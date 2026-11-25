import 'server-only'
import { createClient } from './supabase/server'
import { createAdminClient } from './supabase/admin'
import { requireNativeAccount } from './supabase/nativeAccount'

export async function creatorWalletAuth(request?: Request) {
  let userId: string
  if (request?.headers.has('authorization')) {
    const account = await requireNativeAccount(request)
    if (account.error) return { status: account.error.status, error: account.error.status === 403 ?
      'Complete your security verification in Settings.' : 'Your payment account could not be checked.' } as const
    userId = account.userId
  } else {
    const client = await createClient()
    const { data: { user }, error } = await client.auth.getUser()
    if (error || !user) return { status: 401, error: 'Sign in to view your balance.' } as const
    const { data: assurance, error: assuranceError } = await client.auth.mfa.getAuthenticatorAssuranceLevel()
    if (assuranceError || !assurance || assurance.nextLevel === 'aal2' && assurance.currentLevel !== 'aal2') return { status: 403, error: 'Complete your security verification in Settings.' } as const
    userId = user.id
  }
  const { data: profile, error: profileError } = await createAdminClient().from('users').select('username,whop_connected_company_id').eq('id', userId).single()
  if (profileError) return { status: 503, error: 'Your payment account could not be checked.' } as const
  if (!profile?.whop_connected_company_id) return { status: 409, error: 'Set up your payment account in Creator Studio first.' } as const
  return { userId, accountId: profile.whop_connected_company_id as string, testAccount: profile.username?.toLowerCase() === 'slipsurge' }
}
