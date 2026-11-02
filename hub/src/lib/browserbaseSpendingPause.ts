// Snapshot provenance mirrors the unconditional browser admission guard.
// A contract test requires both to remain paused until the reviewed shared
// spending controls and operational checks are ready.
export const BROWSERBASE_SPENDING_PAUSED = true
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
