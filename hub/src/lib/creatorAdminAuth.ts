import 'server-only'
import { createClient } from './supabase/server'
import { createAdminClient } from './supabase/admin'
import { adminDecisionActor } from './supabase/adminDecisionActor'

/** Layouts do not serialize with page loads. Verify before any service-role read. */
export async function creatorAdminAuth(request?: Request) {
  if (request?.headers.has('authorization')) {
    const actor = await adminDecisionActor(request)
    if (actor.error) {
      const data = await actor.error.json().catch(() => null)
      return { status: actor.error.status, error: typeof data?.error === 'string' ? data.error : 'Admin access unavailable' }
    }
    return { user: actor.user, admin: actor.admin }
  }
  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return { status: 401 as const, error: 'Not signed in' }
  const { data: profile } = await client.from('users').select('account_type').eq('id', user.id).single()
  if (profile?.account_type !== 'admin') return { status: 403 as const, error: 'Forbidden' }
  const { data: assurance, error } = await client.auth.mfa.getAuthenticatorAssuranceLevel()
  if (error || assurance?.nextLevel === 'aal2' && assurance.currentLevel !== 'aal2') return { status: 403 as const, error: 'Complete your security verification in Settings.' }
  return { user, admin: createAdminClient() }
}
