import { whopMembershipPeriodEnd, type WhopAccessRecord } from '@/lib/whopMembershipAccess'

/** Verify a separate higher-tier membership before replacing the current link. */
export async function verifyConcurrentUpgrade(
  input: { membershipId: string; planId: string; userId: string; whopUserId: string | null; source: 'main' | 'addon' },
  apiKey: string | undefined,
  fetcher: typeof fetch = fetch,
): Promise<{ periodEnd: string; cancelAtPeriodEnd: boolean }> {
  if (!apiKey) throw new Error('Whop upgrade verification unavailable')
  let response: Response
  try {
    response = await fetcher(`https://api.whop.com/api/v2/memberships/${encodeURIComponent(input.membershipId)}`, {
      headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(10_000),
    })
  } catch {
    throw new Error('Whop upgrade verification unavailable')
  }
  if (!response.ok) throw new Error('Whop upgrade verification unavailable')
  const body: unknown = await response.json().catch(() => null)
  if (!body || typeof body !== 'object') throw new Error('Whop upgrade verification incomplete')
  const wrapper = body as Record<string, unknown>
  const raw = wrapper.data && typeof wrapper.data === 'object' ? wrapper.data : wrapper
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Whop upgrade verification incomplete')
  const member = raw as Record<string, unknown>
  const idOf = (value: unknown): unknown => typeof value === 'string' ? value
    : value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>).id : undefined
  const metadata = member.metadata && typeof member.metadata === 'object' && !Array.isArray(member.metadata)
    ? member.metadata as Record<string, unknown> : {}
  const providerUserId = idOf(member.user)
  const metadataUserId = metadata.internal_user_id
  const planReferences = [member.plan_id, member.plan].filter(value => value != null).map(idOf)
  if (member.id !== input.membershipId || planReferences.length === 0 || planReferences.some(id => id !== input.planId)
    || (metadataUserId != null && metadataUserId !== input.userId)
    || (input.whopUserId && providerUserId !== input.whopUserId)
    || (metadataUserId !== input.userId && !input.whopUserId)) {
    throw new Error('Whop upgrade identity mismatch')
  }
  if (input.source === 'main') {
    for (const [field, expected] of [['company', 'biz_lQsa02bB46YIlL'], ['product', 'prod_7z1xwDKvVgpiE']] as const) {
      if (member[field] != null && idOf(member[field]) !== expected) throw new Error('Whop upgrade identity mismatch')
    }
  }
  const status = typeof member.status === 'string' ? member.status.trim().toLowerCase() : ''
  const periodEnd = whopMembershipPeriodEnd(member as WhopAccessRecord)
  if (!['active', 'trialing', 'past_due', 'canceling'].includes(status) || member.valid === false
    || (status === 'canceling' && member.cancel_at_period_end === false)
    || typeof member.cancel_at_period_end !== 'boolean' || !periodEnd || Date.parse(periodEnd) <= Date.now()) {
    throw new Error('Whop upgrade lifecycle unavailable')
  }
  return { periodEnd, cancelAtPeriodEnd: member.cancel_at_period_end }
}
