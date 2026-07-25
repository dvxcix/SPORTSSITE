import { NextResponse } from 'next/server'
import { requireBrowserbaseCronAuth } from '@/lib/cron-auth'
import { getTodaysMatchups, type TodayGame } from '@/lib/mlbSchedule'
import { openSession } from '@/lib/browserbase'
import { runFanduelScrape } from '@/lib/scrapers/fanduelScraper'
import { findAndClickGame, legIndexFor } from '@/lib/scrapers/gameMatch'
import { fanOutToSelf } from '@/lib/scrapers/fanout'
import { PLATFORM_URL } from '@/lib/stripe'
import { addDaysToDateStr } from '@/lib/balldontlie'
import { missingMarkets } from '@/lib/scrapers/retryMarkets'

export const revalidate = 0
export const maxDuration = 300

// Automates the exact manual workflow: sportsbook.fanduel.com/navigation/mlb
// -> "GAMES" tab -> click into a specific game -> run the all-tabs scraper
// (fanduelScraper.ts handles clicking through every non-skipped market tab
// itself) -> POST the result to fanduel-import, which auto-detects the real
// game from each scrape's own event.title (see that route's
// detectGameFromTitle) so an imprecise listing-page click still lands under
// the right game_key.
//
// Called two ways:
//   ?gamePk=123   -> scrapes just that one game, one Browserbase session.
//   (no gamePk)   -> "sweep" mode: fans out one concurrent request per
//                    today's game back to this same route instead of
//                    looping in-process — wall time is bounded by the
//                    slowest single game, not the sum of every game, which
//                    is what let a full slate blow past the time budget
//                    when it all ran sequentially in one loop.
async function postImport(json: any, gameDate: string, homeTeam: string, awayTeam: string, gameKey: string) {
  const res = await fetch(`${PLATFORM_URL}/api/admin/fanduel-import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.CRON_SECRET}` },
    body: JSON.stringify({ json, gameDate, homeTeam, awayTeam, gameKey, isOpening: true }),
  })
  return { ok: res.ok, status: res.status, body: await res.json().catch(() => null) }
}

async function scrapeOneGameAttempt(g: TodayGame, date: string, legIdx: number, dryRun: boolean) {
  const bb = await openSession({ metadata: { book: 'fanduel', gameKey: g.gameKey, gamePk: String(g.gamePk) } })
  try {
    await bb.page.goto('https://sportsbook.fanduel.com/navigation/mlb', { waitUntil: 'domcontentloaded' })
    // Best-effort — harmless no-op if "GAMES" is already the active tab.
    await bb.page.getByText('GAMES', { exact: true }).first().click({ timeout: 5000 }).catch(() => {})
    await bb.page.waitForTimeout(1500)

    // The listing SPA can still be rendering game cards after
    // domcontentloaded — a miss here doesn't necessarily mean the game
    // isn't listed, just that the search ran too early. One retry after a
    // longer wait catches that without slowing down the common case.
    let clicked = await findAndClickGame(bb.page, g.awayTeam, g.homeTeam, legIdx)
    if (!clicked) {
      await bb.page.waitForTimeout(3000)
      clicked = await findAndClickGame(bb.page, g.awayTeam, g.homeTeam, legIdx)
    }
    if (!clicked) return { gameKey: g.gameKey, error: 'game link not found on FD listing page' }
    await bb.page.waitForTimeout(2500)

    const scrapes = await bb.page.evaluate(runFanduelScrape)
    if (!scrapes.length) return { gameKey: g.gameKey, error: 'no tabs scraped' }

    if (dryRun) return { gameKey: g.gameKey, tabsScraped: scrapes.length, dryRun: true, scrapes }

    const imported = await postImport(scrapes, date, g.homeTeam, g.awayTeam, g.gameKey)
    return { gameKey: g.gameKey, tabsScraped: scrapes.length, imported }
  } catch (e: any) {
    return { gameKey: g.gameKey, error: e?.message ?? String(e) }
  } finally {
    await bb.close()
  }
}

// Real gap (2026-07-25): fanduelScraper.ts's per-tab section-expand/match
// can silently drop a whole market group with no error while every other
// market on the same page succeeds (see that file's own comments) — one
// scrape attempt had no way to know. dispatch-scrapes' own 5-minute-later
// retry only reacts to ITS queue, so it never fires for a manual direct
// hit on this route (confirmed live: a member's manual re-trigger for a
// missed lineup-confirm window reproduced the exact same gap). Moving the
// self-check + retry HERE instead means every caller — the automated
// dispatcher, the 2-hour sweep, AND a manual gamePk hit — gets the same
// one-retry safety net, no queue required. A fresh Browserbase session on
// the retry (not the same page) since whatever DOM state caused the miss
// shouldn't be trusted to have cleared on its own.
async function scrapeOneGame(g: TodayGame, date: string, legIdx: number, dryRun: boolean) {
  const first = await scrapeOneGameAttempt(g, date, legIdx, dryRun)
  if (dryRun || 'error' in first) return first
  const missing = missingMarkets(first.imported?.body?.marketSummary ?? {})
  if (!missing.length) return first

  const retry = await scrapeOneGameAttempt(g, date, legIdx, dryRun)
  if ('error' in retry) return { ...first, retriedFor: missing, retryError: retry.error }
  const stillMissing = missingMarkets(retry.imported?.body?.marketSummary ?? {})
  return { ...retry, retriedFor: missing, stillMissing: stillMissing.length ? stillMissing : undefined }
}

export async function GET(req: Request) {
  const authError = requireBrowserbaseCronAuth(req)
  if (authError) return authError

  const url = new URL(req.url)
  const todayEt = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  // Resolved once per sweep and threaded through every fanned-out
  // sub-request below (as its own explicit ?date=) instead of letting each
  // one independently re-derive "today" from wall-clock time — a sweep that
  // starts before midnight ET and fans out after it used to have
  // sub-requests silently resolve a DIFFERENT day, 404-ing on a gamePk that
  // wasn't in the newly-recomputed day's slate. ?dayAhead=1 is how the
  // static vercel.json cron schedule reaches "tomorrow" (it can't compute
  // that itself), while ?date= (used only by our own fan-out) always wins
  // once already resolved.
  const dayAhead = url.searchParams.get('dayAhead') === '1'
  const date = url.searchParams.get('date') || (dayAhead ? addDaysToDateStr(todayEt, 1) : todayEt)
  const games = await getTodaysMatchups(date)
  if (!games.length) return NextResponse.json({ date, games: 0, results: [] })

  const gamePkParam = url.searchParams.get('gamePk')
  const dryRun = url.searchParams.get('dryRun') === '1'
  if (gamePkParam) {
    const gamePk = Number(gamePkParam)
    const g = games.find(x => x.gamePk === gamePk)
    if (!g) return NextResponse.json({ error: `gamePk ${gamePk} not found in ${date}'s matchups` }, { status: 404 })
    const result = await scrapeOneGame(g, date, legIndexFor(g), dryRun)
    return NextResponse.json({ date, gamePk, result })
  }

  const extraQuery = `&date=${date}${dryRun ? '&dryRun=1' : ''}`
  const results = await fanOutToSelf('/api/cron/scrape-fanduel', games.map(g => g.gamePk), extraQuery)
  return NextResponse.json({ date, games: games.length, results })
}
