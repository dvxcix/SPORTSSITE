import { NextRequest, NextResponse } from 'next/server'
import { creatorRouteAccount } from '@/lib/creatorRouteAccount'
import { createAdminClient } from '@/lib/supabase/admin'
import { getWhopPlatformCompanyId, PLATFORM_URL } from '@/lib/whopPlatform'
import { creatorAccountLink, creatorWhop, getCreatorPaymentState } from '@/lib/creatorWhop'
import { isTrustedWhopUrl } from '@/lib/whopUrl'
import { consumeServerRateLimit } from '@/lib/serverRateLimit'
import { safeApiError } from '@/lib/safeApiError'

export async function POST(request: NextRequest) {
  const embedded = new URL(request.url).searchParams.get('embedded') === '1'
  if (embedded && !request.headers.has('authorization') && request.headers.get('origin') !== request.nextUrl.origin) return NextResponse.json({ error: 'Open payment setup from SlipSurge.' }, { status: 403 })
  const account = await creatorRouteAccount(request)
  if (account.error) return account.error
  const { userId, email } = account
  const rate = await consumeServerRateLimit(userId, 'creator_onboarding', 12, 3600)
  if (!rate.available || !rate.allowed) return NextResponse.json({ error: 'Please wait before restarting payment setup.' }, { status: rate.available ? 429 : 503 })
  const admin = createAdminClient()
  const { data: profile, error } = await admin.from('users').select('id,email,username,display_name,account_type,whop_connected_company_id').eq('id', userId).single()
  if (error || !profile) return safeApiError('creator-onboarding-profile', error)
  if (profile.username?.toLowerCase() === 'slipsurge') return NextResponse.json({ error: 'Payment setup is disabled for this test account.' }, { status: 403 })
  try {
    const parentId = getWhopPlatformCompanyId()
    const root = await creatorWhop<{ id: string }>('/accounts/me')
    if (root.id !== parentId) throw new Error('Platform account mismatch')
    let accountId = profile.whop_connected_company_id as string | null
    if (!accountId) {
      // Unique under the platform even after the provider's 24h idempotency window.
      const externalId = `slipsurge:${userId}`
      const existing = await creatorWhop<{ data: { id: string; parent_account?: { id: string } | null }[] }>(`/accounts?external_id=${encodeURIComponent(externalId)}`)
      const account = existing.data[0] ?? await creatorWhop<{ id: string; parent_account?: { id: string } | null }>('/accounts', {
        title: profile.display_name || profile.username, email: email || profile.email, external_id: externalId,
        metadata: { slipsurge_user_id: userId },
      }, `slipsurge-account-${userId}`)
      if (!/^biz_[a-zA-Z0-9]+$/.test(account.id) || account.parent_account?.id !== parentId) throw new Error('Invalid platform subaccount')
      accountId = account.id
      // Creator publishing tools do not grant SlipSurge research tiers or admin access.
      const { error: saveError } = await admin.from('users').update({
        whop_connected_company_id: accountId, creator_commerce_status: 'onboarding', creator_commerce_updated_at: new Date().toISOString(),
        ...(profile.account_type === 'admin' ? {} : { account_type: 'creator' }),
      }).eq('id', userId).is('whop_connected_company_id', null)
      if (saveError) throw new Error('Creator account could not be saved')
    }
    const state = await getCreatorPaymentState(accountId)
    if (embedded) return NextResponse.json({ embedded: true, state }, { headers: { 'Cache-Control': 'private, no-store' } })
    const link = await creatorAccountLink(accountId, 'account_onboarding', `${PLATFORM_URL}/creators/studio?onboarding=return`)
    if (!isTrustedWhopUrl(link.url)) throw new Error('Invalid onboarding destination')
    return NextResponse.json({ url: link.url }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (cause) { return safeApiError('creator-onboarding', cause, 'Whop setup could not be opened. Your progress is saved; try again.', 502) }
}
