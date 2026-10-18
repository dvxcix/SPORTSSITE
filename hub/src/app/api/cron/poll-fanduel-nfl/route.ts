import { NextResponse } from 'next/server'
import { requireBrowserbaseCronAuth } from '@/lib/cron-auth'
import { getUpcomingNflPikkitGames } from '@/lib/nflPikkitSchedule'
import { PLATFORM_URL } from '@/lib/platform'
import { createAdminClient } from '@/lib/supabase/admin'
import { withPipelineHealth } from '@/lib/pipelineHealth'
import { requestNflCapture } from '@/lib/nflCaptureRequest'
import { recentNflCaptureAttempts, selectNflCaptureCandidates, nflCaptureResultStatus, nflCaptureIsIncomplete, NFL_CAPTURE_REQUEST_TIMEOUT_MS } from '@/lib/nflCaptureDispatch'

export const maxDuration = 600
export const revalidate = 0
export const GET = withPipelineHealth('poll-fanduel-nfl', run, { allowSecondarySecret: true })
async function inBatches<T, R>(items: T[], size: number, worker: (item: T) => Promise<R>) {
  const output: R[] = []
  for (let index = 0; index < items.length; index += size) output.push(...await Promise.all(items.slice(index, index + size).map(worker)))
  return output
}
async function run(req: Request) {
  const auth = requireBrowserbaseCronAuth(req)
  if (auth) return auth
  const upcoming = await getUpcomingNflPikkitGames(7)
  const now = new Date()
  const admin = createAdminClient()
  // Unpublished canonical players must not consume the two capture slots.
  const { data: readyRows, error: readyError } = upcoming.length ? await admin.from('nfl_odds_current')
    .select('game_id').in('game_id', upcoming.map(game => game.gameId))
    .not('board->players->0', 'is', null) : { data: [], error: null }
  if (readyError) throw new Error('Canonical capture readiness unavailable')
  const readyIds = new Set((readyRows ?? []).map(row => row.game_id))
  const readyGames = upcoming.filter(game => readyIds.has(game.gameId))
  const { data: attemptRows, error: attemptError } = await admin.from('pipeline_runs')
    .select('started_at,details').eq('job_name', 'poll-fanduel-nfl')
    .gte('started_at', new Date(now.getTime() - 24 * 3600_000).toISOString())
    .order('started_at', { ascending: false }).limit(100)
  if (attemptError) throw new Error('Capture attempts unavailable')
  const attempts = recentNflCaptureAttempts(attemptRows ?? [])
  const candidates = await Promise.all(readyGames.map(async game => {
    const { data, error } = await admin.from('nfl_fanduel_capture_history').select('captured_at,raw_tabs').eq('game_id', game.gameId).order('captured_at', { ascending: false }).limit(1).maybeSingle()
    if (error) throw new Error('Capture status unavailable')
    const capturedAt = data?.captured_at && !nflCaptureIsIncomplete(data.raw_tabs) ? Date.parse(data.captured_at) : 0
    return { ...game, capturedAt }
  }))
  // One concurrent pair leaves enough time for each bounded six-minute extraction.
  // Include failed/deferred attempts in rotation so unlisted props cannot
  // monopolize every run and starve the rest of the slate.
  const games = selectNflCaptureCandidates(candidates, attempts, now)
  const results = await inBatches(games, 2, async game => {
    const requestStarted = Date.now()
    try {
      const response = await requestNflCapture(`${PLATFORM_URL}/api/cron/scrape-fanduel-nfl?gameId=${encodeURIComponent(game.gameId)}`,
        { authorization: `Bearer ${process.env.CRON_SECRET}` }, NFL_CAPTURE_REQUEST_TIMEOUT_MS)
      const body = await response.json()
      return { ...body, gameId: game.gameId, ok: response.ok && body.incomplete !== true, deferred: response.status === 425, httpStatus: response.status }
    } catch (error) {
      // Persist only bounded diagnostic identifiers, never URLs, headers or messages.
      const failure = error as { name?: unknown; code?: unknown; syscall?: unknown; capturePhase?: unknown }
      const identifier = (value: unknown) => typeof value === 'string' && /^[A-Za-z0-9_]{1,60}$/.test(value) ? value : undefined
      return { gameId: game.gameId, ok: false, error: 'Capture request failed',
        errorName: identifier(failure?.name), errorCode: identifier(failure?.code),
        errorSyscall: identifier(failure?.syscall), requestPhase: identifier(failure?.capturePhase), elapsedMs: Date.now() - requestStarted }
    }
  })
  const summary = { discovered: upcoming.length, games: games.length, succeeded: results.filter(result => result.ok).length, deferred: results.filter(result => 'deferred' in result && result.deferred).length, failed: results.filter(result => !result.ok && !('deferred' in result && result.deferred)).length }
  console.info('[poll-fanduel-nfl] complete', { ...summary, results })
  const status = upcoming.length > 0 && readyGames.length === 0 ? 425 : nflCaptureResultStatus(results)
  return NextResponse.json({ ...summary, waitingForCanonical: upcoming.length - readyGames.length, results, ...(status === 425 ? { reason: 'Player markets are not ready for one or more games; retry scheduled.' } : {}) }, { status })
}
