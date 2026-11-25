import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCreatorPaymentState, creatorAccountLink } from '@/lib/creatorWhop'
import { createAdminClient } from '@/lib/supabase/admin'
import { PLATFORM_URL } from '@/lib/platform'
import { isTrustedWhopUrl } from '@/lib/whopUrl'
import { safeApiError } from '@/lib/safeApiError'
import { creatorWalletAuth } from '@/lib/creatorWalletAuth'
import { consumeServerRateLimit } from '@/lib/serverRateLimit'

export async function POST(request: Request) {
  const headers = { 'Cache-Control': 'private, no-store' }
  if (request.headers.has('authorization')) {
    const auth = await creatorWalletAuth(request)
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status, headers })
    if (auth.testAccount) return NextResponse.json({ error: 'Financial actions are disabled for this test account.' }, { status: 403, headers })
    const limit = await consumeServerRateLimit(auth.userId, 'creator_native_payout_portal', 8, 600)
    if (!limit.available || !limit.allowed) return NextResponse.json({ error: 'Please wait before opening another secure session.' }, { status: limit.available ? 429 : 503, headers })
    return openPortal(auth.accountId)
  }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const admin = createAdminClient()
  const { data: profile } = await admin.from('users').select('username,whop_connected_company_id').eq('id', user.id).single()
  if (!profile?.whop_connected_company_id || profile.username?.toLowerCase() === 'slipsurge') return NextResponse.json({ error: 'Finish payment setup in Creator Studio first.' }, { status: 409 })
  return openPortal(profile.whop_connected_company_id)
}

async function openPortal(accountId: string) {
  try {
    await getCreatorPaymentState(accountId)
    const link = await creatorAccountLink(accountId, 'payouts_portal', `${PLATFORM_URL}/creators/payouts`)
    if (!isTrustedWhopUrl(link.url)) throw new Error('Invalid payout destination')
    return NextResponse.json({ url: link.url }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (cause) { return safeApiError('creator-payout-portal', cause, 'Whop payouts could not be opened. Try again.', 502) }
}
