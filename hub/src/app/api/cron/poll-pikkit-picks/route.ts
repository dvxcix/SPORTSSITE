import { NextResponse } from 'next/server'
import { withPipelineHealth } from '@/lib/pipelineHealth'
import { requireBrowserbaseCronAuth } from '@/lib/cron-auth'
import { getTodaysMatchups, isPregame } from '@slipsurge/core/mlbSchedule'
import { PLATFORM_URL } from '@/lib/platform'
import {
  PIKKIT_SIGNED_OUT_ERROR,
  checkPikkitAuthAndAlert,
  checkPikkitImportHealthAndAlert,
} from '@/lib/scrapers/pikkitAuth'
import { pikkitCaptureDecision } from '@/lib/pikkitCaptureSchedule'
import { summarizePikkitRows, type PikkitCoverage } from '@/lib/pikkitCoverage'
import { getMlbPublicReceipts } from '@/lib/mlbPublicCapture'

export const revalidate = 0
export const maxDuration = 280

const SCRAPE_TIMEOUT_MS = 260_000
type CaptureState = PikkitCoverage & { capturedAt: number | null }
async function scrapeBatch(gamePks: number[]) {
  try {
    const res = await fetch(`${PLATFORM_URL}/api/cron/scrape-pikkit?gamePks=${gamePks.join(',')}`, {
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
      signal: AbortSignal.timeout(SCRAPE_TIMEOUT_MS),
    })
    const body = await res.json().catch(() => null)
    const rows = Array.isArray(body?.results) ? body.results : []
    return gamePks.map((gamePk, index) => {
      const result = rows[index]
      const skipped = result?.skipped === true
      const reason = typeof result?.error === 'string' ? result.error : typeof body?.error === 'string' ? body.error : ''
      const rowsImported = Number(result?.imported?.body?.rowsImported ?? 0)
      const complete = result?.coverage?.complete === true
      const incompleteReason = result?.coverage && !complete
        ? `incomplete capture (${result.coverage.marketCount} markets, ${result.coverage.playerCount} players, ${result.coverage.rowCount} rows)`
        : ''
      const finalReason = reason || incompleteReason
      // A requested capture that could not find its game is still a failed
      // capture. `skipped` describes the source condition for alerting; it
      // must never turn missing required data into an HTTP-200 success.
      // The batch endpoint correctly returns 502 when ANY requested game
      // fails. Do not stamp successful siblings as failures merely because
      // the aggregate response is non-2xx; each result carries its own import
      // and coverage outcome.
      const ok = Boolean(result) && result?.imported?.ok === true && !finalReason
      return { gamePk, status: res.status, ok, skipped, attempts: Number(result?.attempts ?? 1), error: ok ? '' : 'scrape or import failed', reason: finalReason, rowsImported: Number.isFinite(rowsImported) ? rowsImported : 0, coverage: result?.coverage ?? null }
    })
  } catch {
    return gamePks.map(gamePk => ({ gamePk, status: 502, ok: false, skipped: false, attempts: 1, error: 'scrape request failed', reason: 'scrape request failed', rowsImported: 0 }))
  }
}

// Cheap hourly scheduler. MLB gets two baseline checkpoints (about T-10h and
// T-4h); both-confirmed lineups trigger the definitive final capture through
// lineup-confirmed -> dispatch-scrapes. Browserbase is never opened merely
// because a cron tick occurred.
async function run(req: Request) {
  const authError = requireBrowserbaseCronAuth(req)
  if (authError) return authError

  const date = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const games = await getTodaysMatchups(date)
  const pregame = games.filter(g => isPregame(g.status))
  if (!pregame.length) return NextResponse.json({
    ok: true, date, games: games.length, pregame: 0, due: 0, browserSessions: 0,
    succeeded: 0, skipped: 0, failed: 0, rowsImported: 0,
    reason: 'no-pregame-games', decisions: [], results: [],
  })

  const force = new URL(req.url).searchParams.get('force') === '1'
  // One primary read for the slate. A legacy current-row write without its
  // archive commit must never mark the capture fresh or suppress a retry.
  const receipts = await getMlbPublicReceipts(date)
  const captured: CaptureState[] = pregame.map(game => receipts.get(game.gameKey) ?? { capturedAt: null, ...summarizePikkitRows([]) })
  const decisions = pregame.map((game, index) => {
    const lineupsConfirmed = game.homeLineupConfirmed && game.awayLineupConfirmed
    const capture = captured[index]
    const kickoff = Date.parse(game.gameDate)
    const finalWindow = kickoff - 3 * 60 * 60 * 1000
    const finalCaptureReady = capture.complete && capture.capturedAt != null && capture.capturedAt >= finalWindow
    const requiresCompleteCapture = Date.now() >= kickoff - 4 * 60 * 60 * 1000
    const decision = force
      ? { due: true, slotHours: null, targetAt: null, reason: 'manual-force' }
      : lineupsConfirmed
        ? { due: !finalCaptureReady, slotHours: null, targetAt: new Date(finalWindow).toISOString(), reason: finalCaptureReady ? 'lineup-final-ready' : 'lineup-final-missing' }
        : pikkitCaptureDecision('mlb', kickoff, requiresCompleteCapture && !capture.complete ? null : capture.capturedAt)
    return { game, decision, capture }
  })
  const due = decisions.filter(item => item.decision.due).map(item => item.game)
  if (!due.length) {
    return NextResponse.json({
      ok: true, date, games: games.length, pregame: pregame.length, due: 0,
      browserSessions: 0,
      succeeded: 0, skipped: 0, failed: 0, rowsImported: 0, reason: 'no-captures-due',
      decisions: decisions.map(({ game, decision, capture }) => ({ gamePk: game.gamePk, gameKey: game.gameKey, ...decision, capture })),
      results: [],
    })
  }

  const normalizedResults = await scrapeBatch(due.map(game => game.gamePk))
  const failed = normalizedResults.filter(result => !result.ok)
  const unavailableReason = `game link not found on Pikkit MLB listing page — ${PIKKIT_SIGNED_OUT_ERROR}`
  const allListingsUnavailable = normalizedResults.length > 0
    && normalizedResults.every(result => result.skipped && result.reason === unavailableReason)
  const allMarketDataUnavailable = normalizedResults.length > 0
    && normalizedResults.every(result => result.skipped && (
      result.reason === unavailableReason || result.reason === 'no markets scraped'
    ))

  let authState: Awaited<ReturnType<typeof checkPikkitAuthAndAlert>> | null = null
  if (allListingsUnavailable) {
    const contextId = process.env.PIKKIT_CONTEXT_ID
    authState = contextId ? await checkPikkitAuthAndAlert(contextId) : 'unknown'
  }

  await checkPikkitImportHealthAndAlert({
    pregame: due.length,
    failedGamePks: failed.map(result => result.gamePk),
    accessUnavailable: allMarketDataUnavailable && authState !== 'signed-out',
  }).catch(error => console.error('[poll-pikkit-picks] health alert failed', {
    type: error instanceof Error ? error.name : typeof error,
  }))

  if (failed.length) {
    console.error('[poll-pikkit-picks] one or more games failed', {
      date,
      pregame: pregame.length,
      failed: failed.length,
      gamePks: failed.map(result => result.gamePk),
    })
  }

  return NextResponse.json({
    date,
    games: games.length,
    pregame: pregame.length,
    due: due.length,
    browserSessions: 1,
    succeeded: normalizedResults.length - failed.length,
    skipped: normalizedResults.filter(result => result.skipped).length,
    failed: failed.length,
    rowsImported: normalizedResults.reduce((sum, result) => sum + result.rowsImported, 0),
    authState,
    reason: failed.length ? failed.map(result => `${result.gamePk}: ${result.reason || result.error}`).join('; ').slice(0, 1800) : undefined,
    decisions: decisions.map(({ game, decision, capture }) => ({ gamePk: game.gamePk, gameKey: game.gameKey, ...decision, capture })),
    results: normalizedResults,
  }, { status: failed.length ? 502 : 200 })
}

export const GET = withPipelineHealth('poll-pikkit-picks', run, { allowSecondarySecret: true })
