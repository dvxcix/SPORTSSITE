import 'server-only'
import { NextResponse } from 'next/server'
import { createAdminClient } from './admin'
import { accountSettingsActor } from './accountSettingsActor'

export async function adminDecisionActor(request: Request) {
  const account = await accountSettingsActor(request)
  if (account.error) return { error: account.error }
  const admin = createAdminClient()
  const { data, error } = await admin.from('users').select('account_type').eq('id', account.user.id).maybeSingle()
  const headers = { 'Cache-Control': 'private, no-store' }
  if (error) return { error: NextResponse.json({ error: 'Admin access could not be checked' }, { status: 503, headers }) }
  if (data?.account_type !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403, headers }) }
  return { admin, supabase: account.supabase, user: account.user, native: account.native }
}
