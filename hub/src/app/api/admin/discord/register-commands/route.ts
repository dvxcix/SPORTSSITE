import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { registerCreatorDiscordCommands } from '@/lib/creatorDiscordCommands'
import { safeApiError } from '@/lib/safeApiError'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) }
  const { data: profile } = await supabase.from('users').select('account_type').eq('id', user.id).single()
  if (profile?.account_type !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return {}
}

// Global slash commands only need re-registering when the command LIST
// itself changes (a new command, a renamed/removed one) — Discord caches
// these for up to an hour on first roll-out, so this is a manual admin
// button (see /admin/discord) rather than something run on every deploy.
// Must stay in sync with the `name` switch in
// /api/discord/interactions/route.ts, or Discord will show a command this
// route doesn't know how to answer.

export async function POST() {
  const { error } = await requireAdmin()
  if (error) return error

  try {
    const registered = await registerCreatorDiscordCommands()
    return NextResponse.json({ ok: true, registered })
  } catch (error) {
    return safeApiError('admin-discord-register-commands', error, 'Failed to register commands')
  }
}
