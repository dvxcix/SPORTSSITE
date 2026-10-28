/** Private-only, bounded diagnostics. Never return an exception message or a
 * request parameter: provider and database errors can contain sensitive data. */
export type NbaSlateStage = 'schedule' | 'shared-cache' | 'boards' | 'models' | 'defense' | 'prices' | 'archive' | 'cache-commit' | 'market-context' | 'finalize' | 'render'
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
