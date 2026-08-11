import { NextResponse } from 'next/server'
import { withPipelineHealth } from '@/lib/pipelineHealth'
import { requireBrowserbaseCronAuth } from '@/lib/cron-auth'
import { getTodaysMatchups, isPregame } from '@slipsurge/core/mlbSchedule'
import { PLATFORM_URL } from '@/lib/platform'

export const revalidate = 0
export const maxDuration = 280

const SCRAPE_TIMEOUT_MS = 70_000
const MAX_SCRAPE_ATTEMPTS = 2

async function scrapeGame(gamePk: number) {
  let lastResult = {
    gamePk,
    status: 502,
    ok: false,
    skipped: false,
    attempts: 0,
    error: 'scrape request failed',
  }

  for (let attempt = 1; attempt <= MAX_SCRAPE_ATTEMPTS; attempt += 1) {
    try {
      const res = await fetch(`${PLATFORM_URL}/api/cron/scrape-pikkit?gamePk=${gamePk}`, {
        headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
        signal: AbortSignal.timeout(SCRAPE_TIMEOUT_MS),
      })
      const body = await res.json().catch(() => null)
      const ok = res.ok && body?.result?.imported?.ok !== false
      const skipped = body?.result?.skipped === true

      lastResult = {
        gamePk,
        status: res.status,
        ok,
        skipped,
        attempts: attempt,
        error: ok ? '' : 'scrape or import failed',
      }

      if (ok || skipped) return lastResult
    } catch {
      lastResult = {
        gamePk,
        status: 502,
        ok: false,
        skipped: false,
        attempts: attempt,
        error: 'scrape request failed',
      }
    }

    if (attempt < MAX_SCRAPE_ATTEMPTS) {
      console.warn('[poll-pikkit-picks] retrying game scrape', { gamePk, attempt })
    }
  }

  return lastResult
}

// Runs every 30 minutes (see vercel.json). Unlike FanDuel/BetMGM — which
// only need ONE scrape per game, right when the opening line appears —
// Pikkit's community pick counts keep changing throughout the whole
// pregame window and the picks section itself disappears once a game
// starts, so this re-scrapes every game that hasn't started yet, every
// run, for as long as it stays pregame. Fans out one concurrent request
// per game to scrape-pikkit?gamePk=... (see fanOutToSelf's reasoning in
// that route) rather than looping — bounded by the slowest single game.
async function run(req: Request) {
  const authError = requireBrowserbaseCronAuth(req)
  if (authError) return authError

  const date = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const games = await getTodaysMatchups(date)
  const pregame = games.filter(g => isPregame(g.status))
  if (!pregame.length) return NextResponse.json({ date, games: games.length, pregame: 0, results: [] })

  const results = await Promise.allSettled(
    pregame.map(g => scrapeGame(g.gamePk))
  )

  const normalizedResults = results.map((result, index) => result.status === 'fulfilled'
    ? result.value
    : { gamePk: pregame[index].gamePk, status: 502, ok: false, skipped: false, attempts: MAX_SCRAPE_ATTEMPTS, error: 'scrape request failed' })
  const failed = normalizedResults.filter(result => !result.ok)

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
    results: normalizedResults,
  }, { status: failed.length ? 502 : 200 })
}

export const GET = withPipelineHealth('poll-pikkit-picks', run, { allowSecondarySecret: true })
