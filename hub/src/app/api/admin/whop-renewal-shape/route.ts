import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { consumeServerRateLimit } from '@/lib/serverRateLimit'
import { whopMembershipGrantsAccess, whopMembershipPeriodEnd } from '@/lib/whopMembershipAccess'
import { resolveRepricedUltimatePlan } from '@/lib/whopRepricedUltimate'
import { verifyConcurrentUpgrade } from '@/lib/whopConcurrentUpgrade'

export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store' }
const MAIN_PRODUCT = 'prod_7z1xwDKvVgpiE'
const MAIN_BUSINESS = 'biz_lQsa02bB46YIlL'
const ORIGINAL_MONTHLY_PLAN = 'plan_tCrVAX62uKyEq'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const PROVIDER_ID = /^[A-Za-z0-9_]{5,100}$/

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}
function id(value: unknown): string | null {
  return typeof value === 'string' ? value : typeof object(value)?.id === 'string' ? object(value)?.id as string : null
}
function no(status: number) { return NextResponse.json({ ok: false }, { status, headers }) }

// Private read-only check for the already-linked, repriced monthly Ultimate
// membership. Never return account IDs, provider IDs, payloads or errors.
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return no(401)
    const { data: profile, error: profileError } = await supabase.from('users').select('account_type').eq('id', user.id).maybeSingle()
    if (profileError || profile?.account_type !== 'admin') return no(403)
    const { data: assurance, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (assuranceError || assurance?.currentLevel !== 'aal2') return no(403)
    if (request.headers.get('origin') !== new URL(request.url).origin || request.headers.get('sec-fetch-site') !== 'same-origin') return no(403)
    const raw = await request.text()
    if (raw.length > 256) return no(400)
    let body: unknown
    try { body = JSON.parse(raw) } catch { return no(400) }
    const targetId = object(body)?.targetUserId
    const expectedPlanId = object(body)?.expectedPlanId
    if (typeof targetId !== 'string' || !UUID.test(targetId)
      || typeof expectedPlanId !== 'string' || !expectedPlanId.startsWith('plan_') || !PROVIDER_ID.test(expectedPlanId)) return no(400)
    const rate = await consumeServerRateLimit(user.id, 'whop_renewal_shape', 4, 600)
    if (!rate.available) return no(503)
    if (!rate.allowed) return no(429)
    const key = process.env.WHOP_API_KEY
    if (!key) return no(503)

    const admin = createAdminClient()
    const { data: target, error: targetError } = await admin.from('users')
      .select('tier,whop_plan_id,whop_membership_id,whop_user_id').eq('id', targetId).maybeSingle()
    const membershipId = target?.whop_membership_id
    if (targetError || target?.tier !== 'ultimate' || target?.whop_plan_id !== ORIGINAL_MONTHLY_PLAN
      || typeof membershipId !== 'string' || !membershipId.startsWith('mem_') || !PROVIDER_ID.test(membershipId)) return no(404)

    const result = {
      ok: false,
      membershipRead: false, membershipIdMatches: false, membershipPlanNested: false, membershipPlanFlat: false, membershipPlanMatchesExpected: false,
      membershipStatusPresent: false, membershipGrantsAccess: false, membershipPeriodPresent: false, membershipPeriodValid: false, membershipPeriodFuture: false, membershipCancelFlagPresent: false,
      membershipBusinessMatches: false, membershipProductMatches: false,
      membershipBusinessMissing: false, membershipBusinessScalar: false, membershipBusinessObject: false,
      membershipProductMissing: false, membershipProductScalar: false, membershipProductObject: false,
      membershipInternalOwnerPresent: false, membershipInternalOwnerMatches: false,
      localWhopUserPresent: false, membershipWhopUserPresent: false, membershipWhopUserMatchesLocal: false,
      membershipValidFalse: false, membershipStatusCompatible: false, upgradeRuntimeWouldAccept: false,
      planRead: false, planIdMatches: false, planAccountMatches: false, planCompanyMatches: false,
      planProductMatches: false, planTypeRenewal: false, planBillingTypeRenewal: false,
      planBillingPeriod30: false, planCurrencyUsd: false, planRenewal1999: false, planHidden: false, runtimeWouldAccept: false,
      planAccountMissing: false, planAccountScalar: false, planAccountObject: false,
      planCompanyMissing: false, planCompanyScalar: false, planCompanyObject: false,
      planProductMissing: false, planProductScalar: false, planProductObject: false,
      planTypeConflict: false, planBillingTypeConflict: false,
      runtimeMembershipIdentityUnavailable: false, runtimeMembershipIncomplete: false,
      runtimeMembershipPlanUnconfirmed: false, runtimeMembershipStatusUnavailable: false,
      runtimeMembershipPeriodUnavailable: false, runtimePlanIncomplete: false,
      runtimeReturnedNoMatch: false, runtimeOtherError: false,
    }
    const get = async (path: string) => {
      try {
        const response = await fetch(`https://api.whop.com${path}`, {
          headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(5_000),
        })
        if (!response.ok) return null
        return object(await response.json().catch(() => null))
      } catch { return null }
    }
    const membershipResponse = await get(`/api/v2/memberships/${encodeURIComponent(membershipId)}`)
    const membership = object(membershipResponse?.data) ?? membershipResponse
    if (!membership) return NextResponse.json(result, { headers })
    result.membershipRead = true
    result.membershipIdMatches = membership.id === membershipId
    result.membershipPlanNested = typeof object(membership.plan)?.id === 'string'
    result.membershipPlanFlat = typeof membership.plan_id === 'string' || typeof membership.plan === 'string'
    result.membershipStatusPresent = typeof membership.status === 'string' || typeof membership.valid_status === 'string' || typeof membership.valid === 'boolean'
    result.membershipGrantsAccess = whopMembershipGrantsAccess(membership)
    result.membershipPeriodPresent = ['renewal_period_end', 'period_end', 'expires_at'].some(field => typeof membership[field] === 'string' || typeof membership[field] === 'number')
    const periodEnd = whopMembershipPeriodEnd(membership)
    result.membershipPeriodValid = periodEnd !== null
    result.membershipPeriodFuture = periodEnd !== null && Date.parse(periodEnd) > Date.now()
    result.membershipCancelFlagPresent = typeof membership.cancel_at_period_end === 'boolean'
    const membershipMetadata = object(membership.metadata)
    const internalOwner = membershipMetadata?.internal_user_id
    const providerUser = id(membership.user)
    result.membershipInternalOwnerPresent = typeof internalOwner === 'string'
    result.membershipInternalOwnerMatches = internalOwner === targetId
    result.localWhopUserPresent = typeof target?.whop_user_id === 'string' && target.whop_user_id.length > 0
    result.membershipWhopUserPresent = typeof providerUser === 'string' && providerUser.length > 0
    result.membershipWhopUserMatchesLocal = result.localWhopUserPresent && providerUser === target?.whop_user_id
    result.membershipValidFalse = membership.valid === false
    result.membershipStatusCompatible = typeof membership.status === 'string'
      && ['active', 'trialing', 'past_due', 'canceling'].includes(membership.status.trim().toLowerCase())
    result.membershipBusinessMatches = id(membership.company) === MAIN_BUSINESS
    result.membershipProductMatches = id(membership.product) === MAIN_PRODUCT
    result.membershipBusinessMissing = membership.company == null
    result.membershipBusinessScalar = typeof membership.company === 'string'
    result.membershipBusinessObject = object(membership.company) !== null
    result.membershipProductMissing = membership.product == null
    result.membershipProductScalar = typeof membership.product === 'string'
    result.membershipProductObject = object(membership.product) !== null
    const planId = id(membership.plan_id) ?? id(membership.plan)
    result.membershipPlanMatchesExpected = planId === expectedPlanId
    if (!result.membershipIdMatches || !result.membershipPlanMatchesExpected || !planId || !planId.startsWith('plan_') || !PROVIDER_ID.test(planId)) return NextResponse.json(result, { headers })
    try {
      // Exercise the same predicate planned for overlap protection using the
      // captured provider response only; this cannot change any account.
      const capturedFetch: typeof fetch = async () => Response.json(membershipResponse)
      result.upgradeRuntimeWouldAccept = !!(await verifyConcurrentUpgrade({
        membershipId, planId, userId: targetId, whopUserId: target.whop_user_id ?? null, source: 'main',
      }, 'diagnostic', capturedFetch))
    } catch { /* Return only fixed booleans, never provider or user details. */ }
    const plan = await get(`/api/v1/plans/${encodeURIComponent(planId)}`)
    if (!plan) return NextResponse.json(result, { headers })
    result.planRead = true
    result.planIdMatches = plan.id === planId
    result.planAccountMatches = id(plan.account) === MAIN_BUSINESS
    result.planCompanyMatches = id(plan.company) === MAIN_BUSINESS
    result.planProductMatches = id(plan.product) === MAIN_PRODUCT
    result.planTypeRenewal = plan.plan_type === 'renewal'
    result.planBillingTypeRenewal = plan.billing_type === 'renewal'
    result.planBillingPeriod30 = plan.billing_period === 30
    result.planCurrencyUsd = plan.currency === 'usd'
    result.planRenewal1999 = plan.renewal_price === 19.99
    result.planHidden = plan.visibility === 'hidden'
    result.planAccountMissing = plan.account == null
    result.planAccountScalar = typeof plan.account === 'string'
    result.planAccountObject = object(plan.account) !== null
    result.planCompanyMissing = plan.company == null
    result.planCompanyScalar = typeof plan.company === 'string'
    result.planCompanyObject = object(plan.company) !== null
    result.planProductMissing = plan.product == null
    result.planProductScalar = typeof plan.product === 'string'
    result.planProductObject = object(plan.product) !== null
    result.planTypeConflict = typeof plan.plan_type === 'string' && plan.plan_type !== 'renewal'
    result.planBillingTypeConflict = typeof plan.billing_type === 'string' && plan.billing_type !== 'renewal'
    // Exercise the exact production predicate with captured JSON only. This
    // performs no additional provider calls and cannot grant access or write.
    try {
      const capturedFetch: typeof fetch = async resource => {
        const url = String(resource)
        if (url === `https://api.whop.com/api/v2/memberships/${encodeURIComponent(membershipId)}`) return Response.json(membershipResponse)
        if (url === `https://api.whop.com/api/v1/plans/${encodeURIComponent(planId)}`) return Response.json(plan)
        throw new Error('Unexpected captured lookup')
      }
      result.runtimeWouldAccept = !!(await resolveRepricedUltimatePlan({ source: 'main', planId, membershipId, stored: target }, 'diagnostic', capturedFetch))
      result.runtimeReturnedNoMatch = !result.runtimeWouldAccept
    } catch (error) {
      // Only fixed classifications are returned; provider payloads and raw
      // error messages never leave this AAL2-protected diagnostic.
      const message = error instanceof Error ? error.message : ''
      result.runtimeMembershipIdentityUnavailable = message === 'Whop membership identity unavailable'
      result.runtimeMembershipIncomplete = message === 'Whop membership lookup returned incomplete data'
      result.runtimeMembershipPlanUnconfirmed = message === 'Whop membership plan not yet confirmed'
      result.runtimeMembershipStatusUnavailable = message === 'Whop membership status unavailable'
      result.runtimeMembershipPeriodUnavailable = message === 'Whop membership period unavailable'
      result.runtimePlanIncomplete = message === 'Whop plan lookup returned incomplete data'
      result.runtimeOtherError = !result.runtimeMembershipIdentityUnavailable && !result.runtimeMembershipIncomplete
        && !result.runtimeMembershipPlanUnconfirmed && !result.runtimeMembershipStatusUnavailable
        && !result.runtimeMembershipPeriodUnavailable && !result.runtimePlanIncomplete
    }
    result.ok = result.runtimeWouldAccept
    return NextResponse.json(result, { headers })
  } catch { return no(503) }
}
