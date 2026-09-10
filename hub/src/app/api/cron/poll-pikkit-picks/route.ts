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

export const revalidate = 0
export const maxDuration = 280

const SCRAPE_TIMEOUT_MS = 260_000
const GAMES_PER_BROWSER = 4

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
      const ok = res.ok && Boolean(result) && result?.imported?.ok !== false && (!reason || skipped)
      return { gamePk, status: res.status, ok, skipped, attempts: 1, error: ok ? '' : 'scrape or import failed', reason, rowsImported: Number.isFinite(rowsImported) ? rowsImported : 0 }
    })
  } catch {
    return gamePks.map(gamePk => ({ gamePk, status: 502, ok: false, skipped: false, attempts: 1, error: 'scrape request failed', reason: 'scrape request failed', rowsImported: 0 }))
  }
}

// Captures seven meaningful pregame checkpoints rather than paying for 48
// all-day polls. Four games share one Browserbase session, cutting both the
// per-session browser minimum and the per-session proxy minimum.
async function run(req: Request) {
  const authError = requireBrowserbaseCronAuth(req)
  if (authError) return authError

  const date = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const games = await getTodaysMatchups(date)
  const pregame = games.filter(g => isPregame(g.status))
  if (!pregame.length) return NextResponse.json({ date, games: games.length, pregame: 0, results: [] })

  const batches: number[][] = []
  for (let index = 0; index < pregame.length; index += GAMES_PER_BROWSER) {
    batches.push(pregame.slice(index, index + GAMES_PER_BROWSER).map(game => game.gamePk))
  }
  const normalizedResults = (await Promise.all(batches.map(scrapeBatch))).flat()
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
    pregame: pregame.length,
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
    succeeded: normalizedResults.length - failed.length,
    skipped: normalizedResults.filter(result => result.skipped).length,
    failed: failed.length,
    rowsImported: normalizedResults.reduce((sum, result) => sum + result.rowsImported, 0),
    authState,
    results: normalizedResults,
  }, { status: failed.length ? 502 : 200 })
}

export const GET = withPipelineHealth('poll-pikkit-picks', run, { allowSecondarySecret: true })
