import { NextResponse } from 'next/server'
import { requireBrowserbaseCronAuth } from '@/lib/cron-auth'
import { getTodaysMatchups, type TodayGame } from '@/lib/mlbSchedule'
import { openSession } from '@/lib/browserbase'
import { runFanduelScrape } from '@/lib/scrapers/fanduelScraper'
import { findAndClickGame, legIndexFor } from '@/lib/scrapers/gameMatch'
import { fanOutToSelf } from '@/lib/scrapers/fanout'
import { PLATFORM_URL } from '@/lib/stripe'

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

async function scrapeOneGame(g: TodayGame, date: string, legIdx: number) {
  const bb = await openSession()
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

    const imported = await postImport(scrapes, date, g.homeTeam, g.awayTeam, g.gameKey)
    return { gameKey: g.gameKey, tabsScraped: scrapes.length, imported }
  } catch (e: any) {
    return { gameKey: g.gameKey, error: e?.message ?? String(e) }
  } finally {
    await bb.close()
  }
}

export async function GET(req: Request) {
  const authError = requireBrowserbaseCronAuth(req)
  if (authError) return authError

  const date = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const games = await getTodaysMatchups(date)
  if (!games.length) return NextResponse.json({ date, games: 0, results: [] })

  const gamePkParam = new URL(req.url).searchParams.get('gamePk')
  if (gamePkParam) {
    const gamePk = Number(gamePkParam)
    const g = games.find(x => x.gamePk === gamePk)
    if (!g) return NextResponse.json({ error: `gamePk ${gamePk} not found in today's matchups` }, { status: 404 })
    const result = await scrapeOneGame(g, date, legIndexFor(games, g))
    return NextResponse.json({ date, gamePk, result })
  }

  const results = await fanOutToSelf('/api/cron/scrape-fanduel', games.map(g => g.gamePk))
  return NextResponse.json({ date, games: games.length, results })
}
