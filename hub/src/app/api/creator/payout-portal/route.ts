import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCreatorPaymentState, creatorAccountLink } from '@/lib/creatorWhop'
import { createAdminClient } from '@/lib/supabase/admin'
import { PLATFORM_URL } from '@/lib/platform'
import { isTrustedWhopUrl } from '@/lib/whopUrl'
import { safeApiError } from '@/lib/safeApiError'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const admin = createAdminClient()
  const { data: profile } = await admin.from('users').select('username,whop_connected_company_id').eq('id', user.id).single()
  if (!profile?.whop_connected_company_id || profile.username?.toLowerCase() === 'slipsurge') return NextResponse.json({ error: 'Finish payment setup in Creator Studio first.' }, { status: 409 })
  try {
    await getCreatorPaymentState(profile.whop_connected_company_id)
    const link = await creatorAccountLink(profile.whop_connected_company_id, 'payouts_portal', `${PLATFORM_URL}/creators/payouts`)
    if (!isTrustedWhopUrl(link.url)) throw new Error('Invalid payout destination')
    return NextResponse.json({ url: link.url }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (cause) { return safeApiError('creator-payout-portal', cause, 'Whop payouts could not be opened. Try again.', 502) }
}
