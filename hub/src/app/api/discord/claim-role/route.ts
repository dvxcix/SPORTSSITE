import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getDiscordConfig, syncDiscordRoleForUser } from '@/lib/discord'

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

  const { data: profile } = await admin.from('users').select('discord_id').eq('id', user.id).single()
  if (!profile?.discord_id) {
    return NextResponse.json({ error: 'Link your Discord account first — Settings → Connected Accounts.' }, { status: 400 })
  }

  const ok = await syncDiscordRoleForUser(admin, user.id)
  if (!ok) {
    return NextResponse.json({ error: "Couldn't reach Discord — make sure you've joined the server, then try again." }, { status: 502 })
  }
  return NextResponse.json({ ok: true })
}
