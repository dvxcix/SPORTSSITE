/** Store bounded counts in the job ledger, never member identifiers or provider payloads. */
export function whopReconciliationMetadata(body: Record<string, unknown>) {
  const incomplete = !Number.isSafeInteger(body.totalMemberships) || (body.totalMemberships as number) < 0
    || !Array.isArray(body.results) || body.results.some(row => !row || typeof row !== 'object' || Array.isArray(row))
  if (incomplete) return { error: 'Whop reconciliation report incomplete', details: {}, status: 'failed' as const }
  const rows = body.results as Record<string, unknown>[]
  const granted = rows.filter(row => typeof row.granted === 'string').length
  const revoked = rows.filter(row => typeof row.revoked === 'string').length
  const missingProfiles = rows.filter(row => row.error === 'user not found').length
  const failed = rows.filter(row => row.error && row.error !== 'user not found').length
  const unlinkedActive = rows.filter(row => row.skipped === 'no metadata or linked membership owner'
    && ['active', 'valid', 'trialing', 'canceling', 'past_due', 'completed'].includes(String(row.status))).length
  const summary = rows.find(row => Number.isSafeInteger(row.checked))
  const details = {
    memberships: body.totalMemberships as number, granted, revoked, missingProfiles, unlinkedActive, failed,
    ...(summary ? { checked: summary.checked } : {}),
  }
  return {
    details, recordsProcessed: granted + revoked,
    error: failed ? 'Whop reconciliation contains failed account updates'
      : missingProfiles || unlinkedActive ? 'Whop reconciliation needs account review' : null,
    ...(failed ? { status: 'failed' as const }
      : missingProfiles || unlinkedActive ? { status: 'deferred' as const } : {}),
  }
}
