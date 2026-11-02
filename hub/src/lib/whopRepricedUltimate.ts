import { whopMembershipGrantsAccess, whopMembershipPeriodEnd } from '@/lib/whopMembershipAccess'

// A Whop per-member renewal edit creates a new hidden plan. Recognize it
// only for the already-linked membership, never as a new checkout offer.
const ULTIMATE_MONTHLY = 'plan_tCrVAX62uKyEq'
const SLIPSURGE_PRODUCT = 'prod_7z1xwDKvVgpiE'
const SLIPSURGE_BUSINESS = 'biz_lQsa02bB46YIlL'

type StoredMembership = {
  tier?: unknown
  whop_plan_id?: unknown
  whop_membership_id?: unknown
}

export async function resolveRepricedUltimatePlan(
  input: { source: 'main' | 'addon'; planId?: string; membershipId?: string; stored: StoredMembership | null },
  apiKey: string | undefined,
  fetcher: typeof fetch = fetch,
): Promise<{ canonicalPlanId: string; periodEnd: string } | null> {
  const { source, planId, membershipId, stored } = input
  if (source !== 'main' || !planId?.startsWith('plan_') || !membershipId?.startsWith('mem_')
    || stored?.tier !== 'ultimate' || stored.whop_plan_id !== ULTIMATE_MONTHLY
    || stored.whop_membership_id !== membershipId) return null
  if (!apiKey) throw new Error('Whop plan lookup unavailable')

  let membershipRes: Response
  try {
    membershipRes = await fetcher(`https://api.whop.com/api/v2/memberships/${encodeURIComponent(membershipId)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    throw new Error('Whop membership lookup failed')
  }
  if (!membershipRes.ok) throw new Error('Whop membership lookup failed')
  const membershipBody: unknown = await membershipRes.json().catch(() => null)
  if (!membershipBody || typeof membershipBody !== 'object') throw new Error('Whop membership lookup returned invalid data')
  const wrapper = membershipBody as Record<string, unknown>
  const membership = wrapper.data && typeof wrapper.data === 'object' ? wrapper.data as Record<string, unknown> : wrapper
  const membershipPlan = typeof membership.plan_id === 'string' ? membership.plan_id
    : typeof membership.plan === 'string' ? membership.plan
      : membership.plan && typeof membership.plan === 'object' ? (membership.plan as Record<string, unknown>).id : undefined
  if (typeof membership.id !== 'string' || typeof membershipPlan !== 'string') {
    throw new Error('Whop membership lookup returned incomplete data')
  }
  // A signed event can arrive before Whop's read endpoint reflects its new
  // plan. Do not acknowledge that lag as a confirmed unrelated plan.
  if (membership.id !== membershipId || membershipPlan !== planId) {
    throw new Error('Whop membership plan not yet confirmed')
  }
  for (const [field, expected] of [['company', SLIPSURGE_BUSINESS], ['product', SLIPSURGE_PRODUCT]] as const) {
    const nested = membership[field]
    if (nested == null) continue
    // Whop's membership response may return these identities as a scalar ID
    // or an object containing an ID. Both must exactly match our business or
    // product; malformed and conflicting identities never grant access.
    const observed = typeof nested === 'string' ? nested
      : typeof nested === 'object' && !Array.isArray(nested) ? (nested as Record<string, unknown>).id : undefined
    if (typeof observed !== 'string' || !observed) {
      throw new Error('Whop membership identity unavailable')
    }
    if (observed !== expected) return null
  }
  if (typeof membership.status !== 'string' && typeof membership.valid_status !== 'string' && typeof membership.valid !== 'boolean') {
    throw new Error('Whop membership status unavailable')
  }
  const providerPeriodEnd = whopMembershipPeriodEnd(membership)
  if (!providerPeriodEnd) throw new Error('Whop membership period unavailable')
  if (!whopMembershipGrantsAccess(membership) || Date.parse(providerPeriodEnd) <= Date.now()) return null

  let res: Response
  try {
    res = await fetcher(`https://api.whop.com/api/v1/plans/${encodeURIComponent(planId)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    throw new Error('Whop plan lookup failed')
  }
  if (!res.ok) throw new Error('Whop plan lookup failed')
  const value: unknown = await res.json().catch(() => null)
  if (!value || typeof value !== 'object') throw new Error('Whop plan lookup returned invalid data')
  const plan = value as Record<string, unknown>
  const account = plan.account && typeof plan.account === 'object' ? plan.account as Record<string, unknown> : null
  const company = plan.company && typeof plan.company === 'object' ? plan.company as Record<string, unknown> : null
  const product = plan.product && typeof plan.product === 'object' ? plan.product as Record<string, unknown> : null
  const businessIds = [account?.id, company?.id].filter((id): id is string => typeof id === 'string')
  const planTypes = [plan.plan_type, plan.billing_type].filter((value): value is string => typeof value === 'string')
  // Missing authorization details are treated as a retriable failure, not as
  // proof that a real paying member's plan is unrelated.
  if (typeof plan.id !== 'string' || businessIds.length === 0
    || !product || typeof product.id !== 'string' || typeof plan.billing_period !== 'number'
    || typeof plan.currency !== 'string' || typeof plan.renewal_price !== 'number'
    || planTypes.length === 0 || typeof plan.visibility !== 'string') {
    throw new Error('Whop plan lookup returned incomplete data')
  }
  if (plan.id !== planId || businessIds.some(id => id !== SLIPSURGE_BUSINESS) || product.id !== SLIPSURGE_PRODUCT
    || planTypes.some(type => type !== 'renewal') || plan.billing_period !== 30 || plan.currency !== 'usd'
    || plan.renewal_price !== 19.99 || plan.visibility !== 'hidden') return null
  return { canonicalPlanId: ULTIMATE_MONTHLY, periodEnd: providerPeriodEnd }
}
