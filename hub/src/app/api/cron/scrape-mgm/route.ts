import { NextResponse } from 'next/server'
import { requireBrowserbaseCronAuth } from '@/lib/cron-auth'
import { getTodaysMatchups, isPregame, type TodayGame } from '@slipsurge/core/mlbSchedule'
import { openSession } from '@/lib/browserbase'
import { scrapeMgmGame } from '@/lib/scrapers/mgmScraper'
import { findAndClickGame, legIndexFor, clickTabByText } from '@/lib/scrapers/gameMatch'
import { fanOutToSelf } from '@/lib/scrapers/fanout'
import { PLATFORM_URL } from '@/lib/platform'
import { createAdminClient } from '@/lib/supabase/admin'
import { needsBetMgmFallback } from '@/lib/scrapers/mgmCoverage'
import { safeErrorMetadata } from '@/lib/safeApiError'
import { withPipelineHealth } from '@/lib/pipelineHealth'

export const revalidate = 0
export const maxDuration = 300
export const GET = withPipelineHealth('scrape-mgm', run, { allowSecondarySecret: true })

// Automates: nc.betmgm.com/.../mlb-75 -> "EVENTS" tab -> click into a
// specific game -> append ?market=PlayerProps to the resulting event URL ->
// scrapeMgmGame() expands "Batter home runs", clicks through both 1+/2+
// threshold tabs, clicking every "Show more" along the way -> POST each
// threshold's result to mgm-import (unlike FD, this route trusts the
// gameKey we pass explicitly — no title-based re-detection on MGM's side).
//
// Called two ways: ?gamePk=123 scrapes just that game; no gamePk fans out
// one concurrent request per today's game back to this same route instead
// of looping in-process (see fanOutToSelf).
async function postImport(json: any, gameDate: string, homeTeam: string, awayTeam: string, gameKey: string) {
  const res = await fetch(`${PLATFORM_URL}/api/admin/mgm-import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.CRON_SECRET}` },
    body: JSON.stringify({ json, gameDate, homeTeam, awayTeam, gameKey, isOpening: true }),
    signal: AbortSignal.timeout(45_000),
  })
  return { ok: res.ok, status: res.status, body: await res.json().catch(() => null) }
}

async function scrapeOneGame(g: TodayGame, date: string, legIdx: number, dryRun: boolean) {
  // nc.betmgm.com is state-gated real-money content — without a North
  // Carolina-located proxy IP, BetMGM's backend won't serve the actual page
  // body (the site loads, but the events/odds content never appears).
  const bb = await openSession({ geoState: 'NC', metadata: { book: 'mgm', gameKey: g.gameKey, gamePk: String(g.gamePk) } })
  try {
    await bb.page.goto('https://www.nc.betmgm.com/en/sports/baseball-23/betting/usa-9/mlb-75', { waitUntil: 'domcontentloaded' })
    // "EVENTS" not "Futures" — best-effort, harmless if already active.
    await clickTabByText(bb.page, 'EVENTS')
    await bb.page.waitForTimeout(1500)

    // Same reasoning as FanDuel's retry — the listing SPA can still be
    // rendering game cards after domcontentloaded, so one retry after a
    // longer wait catches a too-early search without slowing the common case.
    let clicked = await findAndClickGame(bb.page, g.awayTeam, g.homeTeam, legIdx)
    if (!clicked) {
      await bb.page.waitForTimeout(3000)
      clicked = await findAndClickGame(bb.page, g.awayTeam, g.homeTeam, legIdx)
    }
    if (!clicked) return { gameKey: g.gameKey, error: 'game link not found on MGM listing page' }
    await bb.page.waitForTimeout(2000)

    const pageUrl = bb.page.url()
    const propsUrl = pageUrl + (pageUrl.includes('?') ? '&' : '?') + 'market=PlayerProps'
    const scrapes = await scrapeMgmGame(bb.page, propsUrl)
    if (!scrapes.length) return { gameKey: g.gameKey, error: 'no thresholds scraped — is "Batter home runs" present for this game?' }

    if (dryRun) return { gameKey: g.gameKey, thresholdsScraped: scrapes.length, dryRun: true, scrapes }

    const imported = await postImport(scrapes, date, g.homeTeam, g.awayTeam, g.gameKey)
    return { gameKey: g.gameKey, thresholdsScraped: scrapes.length, imported }
  } catch (error) {
    console.error('[scrape-mgm] game failed', { gameKey: g.gameKey, ...safeErrorMetadata(error) })
    return { gameKey: g.gameKey, error: 'scrape failed' }
  } finally {
    await bb.close()
  }
}

async function run(req: Request) {
  const authError = requireBrowserbaseCronAuth(req)
  if (authError) return authError

  const date = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const games = await getTodaysMatchups(date)
  if (!games.length) return NextResponse.json({ date, games: 0, results: [] })

  const reqUrl = new URL(req.url)
  const gamePkParam = reqUrl.searchParams.get('gamePk')
  const dryRun = reqUrl.searchParams.get('dryRun') === '1'
  const force = reqUrl.searchParams.get('force') === '1'

  const eligible = games.filter(g =>
    isPregame(g.status) && g.homeLineupConfirmed && g.awayLineupConfirmed
  )
  const admin = createAdminClient()
  const eligiblePks = eligible.map(g => String(g.gamePk))
  const snapshotByPk = new Map<string, unknown>()
  if (eligiblePks.length) {
    const { data, error } = await admin
      .from('pregame_odds_snapshots')
      .select('game_pk,prop_map')
      .eq('game_date', date)
      .in('game_pk', eligiblePks)
    if (error) {
      console.error('[scrape-mgm] coverage query failed', { code: error.code })
      return NextResponse.json({ reason: 'Could not verify BetMGM coverage' }, { status: 502 })
    }
    for (const row of data ?? []) snapshotByPk.set(String(row.game_pk), row.prop_map)
  }

  const missingCoverage = eligible.filter(g =>
    force || needsBetMgmFallback(snapshotByPk.get(String(g.gamePk)), g.homeLineup.length + g.awayLineup.length)
  )

  if (gamePkParam) {
    const gamePk = Number(gamePkParam)
    const g = games.find(x => x.gamePk === gamePk)
    if (!g) return NextResponse.json({ error: `gamePk ${gamePk} not found in today's matchups` }, { status: 404 })
    if (!isPregame(g.status)) {
      return NextResponse.json({ date, gamePk, skipped: 'game already started' })
    }
    if (!g.homeLineupConfirmed || !g.awayLineupConfirmed) {
      return NextResponse.json({ date, gamePk, skipped: 'waiting for both confirmed lineups' })
    }
    if (!force && !missingCoverage.some(x => x.gamePk === gamePk)) {
      return NextResponse.json({ date, gamePk, skipped: 'BDL BetMGM coverage is healthy' })
    }
    const result = await scrapeOneGame(g, date, legIndexFor(g), dryRun)
    return NextResponse.json({ date, gamePk, result }, { status: result.error ? 502 : 200 })
  }

  if (!missingCoverage.length) {
    return NextResponse.json({ date, eligibleGames: eligible.length, missingCoverage: 0, skipped: 'BDL BetMGM coverage is healthy' })
  }

  const results = await fanOutToSelf('/api/cron/scrape-mgm', missingCoverage.map(g => g.gamePk), dryRun ? '&dryRun=1' : '')
  const completed = results.filter(result => result.status === 200 && !result.body?.result?.error).length
  const response = {
    date,
    eligibleGames: eligible.length,
    missingCoverage: missingCoverage.length,
    attemptedGamePks: missingCoverage.map(g => g.gamePk),
    completed,
    results,
  }
  return NextResponse.json(response, { status: completed > 0 ? 200 : 502 })
}
