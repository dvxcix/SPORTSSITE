/** Private-only, bounded diagnostics. Never return an exception message or a
 * request parameter: provider and database errors can contain sensitive data. */
export type NbaSlateStage = 'schedule' | 'shared-cache' | 'boards' | 'models' | 'defense' | 'prices' | 'archive' | 'cache-commit' | 'market-context' | 'finalize' | 'render'
type FinalizeStage = 'closed-research' | 'frozen-ranks' | 'legacy-reads'
const slowThresholdMs = 10_000
/** One bounded set of fixed stage durations, only reported for slow requests. */
export function nbaSlateTimer(now: () => number = Date.now) {
  const start = now(), times: Partial<Record<NbaSlateStage, number>> = {}
  const finalizeTimes: Partial<Record<FinalizeStage, number>> = {}
  let stage: NbaSlateStage = 'schedule', last = start
  let finalizeStage: FinalizeStage | null = null, finalizeLast = start
  const advance = (next: NbaSlateStage, at: number) => { times[stage] = (times[stage] ?? 0) + Math.max(0, at - last); stage = next; last = at }
  const stopFinalize = (at: number) => {
    if (finalizeStage) finalizeTimes[finalizeStage] = (finalizeTimes[finalizeStage] ?? 0) + Math.max(0, at - finalizeLast)
    finalizeStage = null
  }
  return {
    enter(next: NbaSlateStage) { advance(next, now()) },
    enterFinalize(next: FinalizeStage) { const at = now(); stopFinalize(at); finalizeStage = next; finalizeLast = at },
    endFinalize() { stopFinalize(now()) },
    finish() {
      const end = now(); advance(stage, end); stopFinalize(end)
      const total = Math.max(0, end - start)
      if (total < slowThresholdMs) return null
      const stages = Object.fromEntries(Object.entries(times).map(([key, elapsed]) => [key, Math.round(elapsed / 100) * 100]))
      const finalize = Object.fromEntries(Object.entries(finalizeTimes).map(([key, elapsed]) => [key, Math.round(elapsed / 100) * 100]))
      return { totalMs: Math.round(total / 100) * 100, stages, ...(Object.keys(finalize).length ? { finalize } : {}) }
    },
  }
}
export function nbaSlateFailure(stage: NbaSlateStage, failure: unknown) {
  const message = failure instanceof Error ? failure.message : ''
  const name = failure instanceof Error ? failure.name : ''
  const reason = name === 'AbortError' || name === 'TimeoutError' ? 'timeout'
    : message === 'NBA research is warming; retry shortly' ? 'cache-warming'
    : message === 'NBA source temporarily unavailable; retry shortly' ? 'cache-cooldown'
    : message === 'NBA shared cache unavailable' ? 'cache-read'
    : message === 'NBA shared refresh unavailable' ? 'cache-lease'
    : message === 'NBA shared refresh could not commit' || message === 'NBA shared refresh missing' ? 'cache-commit'
    : message === 'Pregame research archive unavailable' || message === 'Pregame research could not be archived' ? 'archive'
    : message === 'NBA slate comparison snapshot exceeds its size limit' ? 'snapshot-size'
    : message === 'No NBA boards available' ? 'no-boards'
    : message === 'NBA slate phase could not settle' ? 'phase'
    : 'unknown'
  return { stage, reason }
}
