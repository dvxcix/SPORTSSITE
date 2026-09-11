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

export const revalidate = 0
export const maxDuration = 280

const SCRAPE_TIMEOUT_MS = 260_000
const MP_URL = 'https://emllcbynioctxkbsdlwp.supabase.co'

type CaptureState = PikkitCoverage & { capturedAt: number | null }

async function latestCapture(gameKey: string, date: string): Promise<CaptureState> {
  const key = process.env.MLB_PARTY_SERVICE_ROLE_KEY
  if (!key) throw new Error('MLB_PARTY_SERVICE_ROLE_KEY is not configured')
  const query = new URLSearchParams({
    select: 'updated_at,prop_type,player_name', game_date: `eq.${date}`, game_key: `eq.${gameKey}`,
    order: 'updated_at.desc', limit: '1000',
  })
  const response = await fetch(`${MP_URL}/rest/v1/pikkit_public_picks?${query}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: 'no-store',
  })
  // A freshness-read outage must not look like an empty history; that would
  // launch a paid browser on every cron tick until first pitch.
  if (!response.ok) throw new Error(`Pikkit freshness lookup failed (${response.status})`)
  const rows = await response.json().catch(() => [])
  const captured = rows?.[0]?.updated_at ? Date.parse(rows[0].updated_at) : NaN
  if (!Number.isFinite(captured)) return { capturedAt: null, ...summarizePikkitRows([]) }
  // Every row in one import is timestamped within milliseconds. Evaluate
  // only the newest batch: stale markets from an older, fuller capture must
  // not make today's latest partial scrape look complete.
  const newestBatch = rows.filter((row: { updated_at?: string }) => {
    const timestamp = row.updated_at ? Date.parse(row.updated_at) : NaN
    return Number.isFinite(timestamp) && captured - timestamp <= 30_000
  })
  return { capturedAt: captured, ...summarizePikkitRows(newestBatch) }
}
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
      const ok = res.ok && Boolean(result) && result?.imported?.ok !== false && (!finalReason || skipped)
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
  if (!pregame.length) return NextResponse.json({ date, games: games.length, pregame: 0, results: [] })

  const force = new URL(req.url).searchParams.get('force') === '1'
  const captured = await Promise.all(pregame.map(game => latestCapture(game.gameKey, date)))
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
