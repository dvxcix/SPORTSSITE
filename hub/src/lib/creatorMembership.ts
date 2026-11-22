import { whopMembershipGrantsAccess, whopMembershipPeriodEnd } from './whopMembershipAccess'
export type CreatorMembership = {
 id: string; variant_id: string; account: { id: string }; user_id?: string | null; expires_at?: string | null; metadata?: Record<string, unknown>;
 status: string; current_period_end?: string | null; renewal_period_end?: string | number;
 cancel_at_period_end?: boolean; updated_at: string; manage_url?: string | null
}
export function creatorMembershipState(member: CreatorMembership, recurring: boolean, now = Date.now()) {
  const record = { ...member, current_period_end: member.current_period_end ?? undefined, expires_at: member.expires_at ?? undefined }
  const periodEnd = whopMembershipPeriodEnd(record)
  if (!Number.isFinite(Date.parse(member.updated_at))) throw new Error('Membership version unavailable')
  if (recurring && !periodEnd && whopMembershipGrantsAccess(record, now)) throw new Error('Paid-through date unavailable')
  const access = whopMembershipGrantsAccess(record, now) && (periodEnd == null || Date.parse(periodEnd) > now)
  return { status: access ? member.status === 'trialing' ? 'trialing' : 'active' : 'expired', periodEnd, providerUpdatedAt: new Date(member.updated_at).toISOString() }
}
export function creatorMoney(value: unknown): { amount: number; currency: string } | null {
 if (value && typeof value === 'object' && 'amount' in value && 'currency' in value) {
   const money = value as { amount: unknown; currency: unknown }
   const amount = Number(money.amount)
   return typeof money.amount === 'string' && Number.isFinite(amount) && typeof money.currency === 'string' ? { amount, currency: money.currency } : null
 }
 return null
}
