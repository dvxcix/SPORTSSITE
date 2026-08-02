import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { syncDiscordRoleForUser } from '@/lib/discord'
import { asyncPool } from '@/lib/matrixMatch'

export const maxDuration = 300

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) }
  const { data: profile } = await supabase.from('users').select('account_type').eq('id', user.id).single()
  if (profile?.account_type !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return {}
}

// One-time (or run-whenever-roles-drift) backfill for members who linked
// Discord and/or bought a tier BEFORE the bot's role sync went live —
// syncDiscordRoleForUser only ever fires at the moment a tier actually
// changes (Whop webhook, reconcile cron, admin grant/revoke, OAuth link),
// so anyone whose Discord was linked before this existed just never got
// their role assigned. This walks every already-linked account once and
// syncs them all against their current real tier.
export async function POST() {
  const { error } = await requireAdmin()
  if (error) return error

  const admin = createAdminClient()
  const userIds: string[] = []
  const PAGE = 1000
  for (let offset = 0; ; offset += PAGE) {
    const { data } = await admin.from('users').select('id').not('discord_id', 'is', null).range(offset, offset + PAGE - 1)
    if (!data?.length) break
    userIds.push(...data.map(r => r.id))
    if (data.length < PAGE) break
  }

  // Bounded concurrency — same reasoning as every other bulk external-API
  // fan-out in this codebase (matrixMatch.ts, dugout/data/route.ts): each
  // user can fire several sequential Discord calls (up to 3 role removes +
  // 1 add), so unbounded parallelism here would slam Discord's per-guild
  // rate limit across 200+ members at once.
  let synced = 0
  await asyncPool(5, userIds, async id => {
    await syncDiscordRoleForUser(admin, id)
    synced++
  })

  return NextResponse.json({ ok: true, total: userIds.length, synced })
}
