import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { inspectDiscordSlate, retireDiscordSlate } from '@/lib/discordSlateRetirement'
import { MLB_HIBERNATING } from '@/lib/mlbOffseason'

export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store' }

async function requireAdminMfa() {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: 'Sign in required' }, { status: 401, headers })
  const { data: profile, error: profileError } = await supabase.from('users').select('account_type').eq('id', user.id).maybeSingle()
  if (profileError || profile?.account_type !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers })
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (error || data?.currentLevel !== 'aal2') return NextResponse.json({ error: 'Two-factor verification required' }, { status: 403, headers })
  return null
}

export async function GET() {
  const denied = await requireAdminMfa()
  if (denied) return denied
  try { return NextResponse.json(await inspectDiscordSlate(), { headers }) }
  catch { return NextResponse.json({ error: 'Could not inspect Discord commands.' }, { status: 502, headers }) }
}

export async function POST(request: Request) {
  const denied = await requireAdminMfa()
  if (denied) return denied
  if (!MLB_HIBERNATING) return NextResponse.json({ error: 'MLB retirement is not active.' }, { status: 409, headers })
  if (request.headers.get('origin') !== new URL(request.url).origin || request.headers.get('sec-fetch-site') !== 'same-origin') return NextResponse.json({ error: 'Invalid origin' }, { status: 403, headers })
  const body = await request.json().catch(() => null)
  if (!body || typeof body.expectedId !== 'string' || !/^\d{17,20}$/.test(body.expectedId)) return NextResponse.json({ error: 'Inspect the command before removing it.' }, { status: 400, headers })
  try { return NextResponse.json(await retireDiscordSlate(body.expectedId), { headers }) }
  catch { return NextResponse.json({ error: 'Removal was not confirmed. Inspect the command again before retrying.' }, { status: 502, headers }) }
}
