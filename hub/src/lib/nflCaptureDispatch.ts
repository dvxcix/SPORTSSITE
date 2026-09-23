import { captureNeedsRefresh, easternKickoff, type DatedCapture } from './browserbaseRefresh'

export const NFL_CAPTURE_REQUEST_TIMEOUT_MS = 270_000
export const NFL_CAPTURE_BATCH_SIZE = 2

type AttemptRun = { started_at: string; details: unknown }
export function recentNflCaptureAttempts(runs: AttemptRun[]): Map<string, number> {
  const attempts = new Map<string, number>()
  for (const run of runs) {
    const details = run.details as { results?: { gameId?: string }[] } | null
    if (!Array.isArray(details?.results)) continue
    for (const result of details.results) {
      if (typeof result?.gameId !== 'string') continue
      const at = Date.parse(run.started_at)
      if (Number.isFinite(at)) attempts.set(result.gameId, Math.max(at, attempts.get(result.gameId) ?? 0))
    }
  }
  return attempts
}

export function selectNflCaptureCandidates<T extends DatedCapture & { gameId: string }>(
  candidates: T[], attempts: Map<string, number>, now: Date,
): T[] {
  const checkedAt = (game: T) => Math.max(game.capturedAt ?? 0, attempts.get(game.gameId) ?? 0)
  return candidates.filter(game => captureNeedsRefresh(game, now)
    && now.getTime() - (attempts.get(game.gameId) ?? 0) >= 30 * 60_000)
    .sort((a, b) => {
      const urgency = (game: T) => {
        const kickoff = easternKickoff(game.gameDate, game.gameTime)?.getTime()
        return kickoff != null && kickoff - now.getTime() <= 6 * 3600_000 ? 0 : 1
      }
      return urgency(a) - urgency(b) || checkedAt(a) - checkedAt(b) || a.gameDate.localeCompare(b.gameDate)
    })
    .slice(0, NFL_CAPTURE_BATCH_SIZE)
}

export function nflCaptureResultStatus(results: { ok: boolean; deferred?: boolean }[]): number {
  if (results.some(result => !result.ok && !result.deferred)) return 502
  return results.some(result => result.deferred) ? 425 : 200
}
