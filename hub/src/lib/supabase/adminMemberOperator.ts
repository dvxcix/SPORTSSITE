import 'server-only'
import { NextResponse } from 'next/server'
import { adminDecisionActor } from './adminDecisionActor'
import { createClient } from './server'

/** Mobile admin actions require the current native account checks. Existing
 * browser operations retain their verified cookie account and role lookup. */
export async function adminMemberOperator(request: Request) {
  if (request.headers.has('authorization')) {
    const actor = await adminDecisionActor(request)
    return actor.error ? { error: actor.error } : { adminId: actor.user.id }
  }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) }
  const { data: profile } = await supabase.from('users').select('account_type').eq('id', user.id).maybeSingle()
  if (profile?.account_type !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { adminId: user.id }
}
