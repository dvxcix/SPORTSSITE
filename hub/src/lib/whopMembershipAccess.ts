export type WhopAccessRecord = {
  status?: string
  valid_status?: string
  valid?: boolean
  cancel_at_period_end?: boolean
  renewal_period_end?: string | number
  period_end?: string | number
  expires_at?: string | number
}

export function whopMembershipPeriodEnd(record: WhopAccessRecord): string | null {
  const raw = record.renewal_period_end ?? record.period_end ?? record.expires_at
  if (typeof raw === 'number') {
    const milliseconds = raw > 10_000_000_000 ? raw : raw * 1000
    const parsed = new Date(milliseconds)
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null
  }
  if (typeof raw !== 'string' || !raw.trim()) return null
  const parsed = new Date(raw)
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null
}

export function whopCancellationKeepsAccess(record: WhopAccessRecord, now = Date.now()): boolean {
  if (record.cancel_at_period_end !== true) return false
  const periodEnd = whopMembershipPeriodEnd(record)
  return periodEnd !== null && Date.parse(periodEnd) > now
}

export function whopMembershipGrantsAccess(record: WhopAccessRecord, now = Date.now()): boolean {
  if (record.valid === true) return true
  const status = String(record.status ?? record.valid_status ?? '').trim().toLowerCase()
  // Whop treats canceling, past-due, and completed memberships as still
  // granting access. A scheduled cancellation also remains entitled through
  // renewal_period_end, even if webhook delivery order briefly exposes a
  // stale lifecycle status.
  if (['active', 'valid', 'trialing', 'canceling', 'past_due', 'completed'].includes(status)) return true
  return whopCancellationKeepsAccess(record, now)
}
