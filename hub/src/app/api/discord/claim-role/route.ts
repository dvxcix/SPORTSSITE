import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getDiscordConfig, syncDiscordIdentity, syncDiscordRoleForUser } from '@/lib/discord'

// Self-serve version of the admin "Sync All Member Roles" backfill, scoped
// to just the signed-in member — a safety net for drift (a role manually
// removed in Discord, a past sync hitting a transient Discord-side error,
// etc.), not a replacement for the automatic sync that already fires at
// link time and on every real tier change (see syncDiscordRoleForUser's own
// call sites).
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const admin = createAdminClient()
  const config = await getDiscordConfig(admin)
  if (!config?.enabled) return NextResponse.json({ error: 'Discord sync is not enabled right now.' }, { status: 400 })

  // users.discord_id is only ever written by syncDiscordIdentity, which only
  // ran automatically going forward from when that capture shipped — anyone
  // who linked Discord before then (their real identity is on the Supabase
  // Auth user, e.g. shows up fine in Settings > Edit Profile's "Connected
  // Accounts") has a live identity but a null discord_id column, and no
  // other path ever backfills it (the admin bulk sync is a roles-only sync
  // that already requires discord_id to be set). Re-run it here first so a
  // stale/never-captured discord_id self-heals from the real OAuth identity
  // instead of telling an already-linked member to link again.
  await syncDiscordIdentity(admin, user.id)

  const { data: profile } = await admin.from('users').select('discord_id').eq('id', user.id).single()
  if (!profile?.discord_id) {
    return NextResponse.json({ error: 'Link your Discord account first — Settings → Edit Profile → Connected Accounts.' }, { status: 400 })
  }

  const ok = await syncDiscordRoleForUser(admin, user.id)
  if (!ok) {
    return NextResponse.json({ error: "Couldn't reach Discord — make sure you've joined the server, then try again." }, { status: 502 })
  }
  return NextResponse.json({ ok: true })
}
