import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { backfillDiscordIdentitiesAndListLinkedUserIds, syncDiscordRoleForUser } from '@/lib/discord'
import { asyncPool } from '@/lib/matrixMatch'
import { discordAdminActor } from '@/lib/discordAdminActor'
import { writeAdminAudit } from '@/lib/adminAudit'

export const maxDuration = 300

// One-time (or run-whenever-roles-drift) backfill for members who linked
// Discord and/or bought a tier BEFORE the bot's role sync went live —
// syncDiscordRoleForUser only ever fires at the moment a tier actually
// changes (Whop webhook, reconcile cron, admin grant/revoke, OAuth link),
// so anyone whose Discord was linked before this existed just never got
// their role assigned. This walks every already-linked account once and
// syncs them all against their current real tier.
export async function POST(request: Request) {
  const actor = await discordAdminActor(request)
  if (actor.error) return actor.error

  const admin = createAdminClient()
  const userIds = await backfillDiscordIdentitiesAndListLinkedUserIds(admin)

  // Serialized on purpose (confirmed via runtime logs: concurrency of 5 here
  // meant 5 users firing up to 4 sequential role calls each at once, well
  // over Discord's per-route role add/remove rate limit — every call in
  // that batch came back 429 and was silently dropped, so nothing actually
  // synced despite a "success" count). One user at a time, combined with
  // discordFetch's built-in 429 retry, actually gets through.
  let synced = 0
  let failed = 0
  await asyncPool(1, userIds, async id => {
    const ok = await syncDiscordRoleForUser(admin, id)
    if (ok) synced++
    else failed++
  })

  if (actor.native) await writeAdminAudit(admin, { actorUserId: actor.id, action: 'discord_sync_roles',
    targetType: 'discord', details: { total: userIds.length, synced, failed }, request })
  return NextResponse.json({ ok: true, total: userIds.length, synced, failed })
}
