// Automated NBA/NFL sessions still require the shared atomic budget guard.
// Manual context authentication and the offseason MLB sources remain paused.
export const BROWSERBASE_SPENDING_PAUSED = false

/** An unknown or offseason workflow must never reach the paid admission path. */
export function browserbaseScheduledScopeAllowed(metadata: Record<string, unknown> | undefined) {
  if (!metadata) return false
  if (metadata.sport === 'nfl') return metadata.book === 'pikkit' || metadata.book === 'fanduel'
  if (metadata.sport === 'nba') return typeof metadata.book === 'string' && ['pikkit', 'combined-direct', 'draftkings', 'betmgm'].includes(metadata.book)
  return false
}
// Deploy reader support first; enable capture markers only after old workers
// have drained and production reader compatibility is verified.
export const NFL_PAUSED_PROJECTION_WRITES_ENABLED = false
export const NFL_PAUSED_PROJECTION_ENFORCE_ENABLED = false
// da55312f production dpl_PUfeSXS41d2zPpZcoaLdTfLbYzmu became READY with
// both public aliases at this instant. This historical boundary is immutable.
export const BROWSERBASE_SPENDING_PAUSE_EFFECTIVE_AT = '2026-11-02T15:04:52.593Z'

/** Never reinterpret an unmarked pre-pause game using today's pause switch. */
export function nflLegacyPauseNeedsLastSeen(earliestCutoff: number) {
  return !Number.isFinite(earliestCutoff) || earliestCutoff >= Date.parse(BROWSERBASE_SPENDING_PAUSE_EFFECTIVE_AT)
}
