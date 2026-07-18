import { NextResponse } from 'next/server'
import { requireBrowserbaseCronAuth } from '@/lib/cron-auth'
import { getTodaysMatchups, type TodayGame } from '@/lib/mlbSchedule'
import { openSession } from '@/lib/browserbase'
import { runPikkitScrape } from '@/lib/scrapers/pikkitScraper'
import { findAndClickGame, legIndexFor, clickTabByText } from '@/lib/scrapers/gameMatch'
import { fanOutToSelf } from '@/lib/scrapers/fanout'
import { PLATFORM_URL } from '@/lib/stripe'

export const revalidate = 0
export const maxDuration = 300

// Automates: app.pikkit.com/leagues/mlb -> click into a specific game ->
// the event page's "Odds" header tab -> "Batting Props" sub-tab ->
// runPikkitScrape() (walks the market <select>, same as the manual
// bookmarklet) -> POST to pikkit-import. Runs against a PERSISTED
// Browserbase context (PIKKIT_CONTEXT_ID) since this is the one site of
// the three that requires being signed in — see /api/admin/pikkit-context
// for the one-time login setup that produces that context id.
//
// Called two ways: ?gamePk=123 scrapes just that game; no gamePk fans out
// one concurrent request per today's game back to this same route instead
// of looping in-process (see fanOutToSelf). Every concurrent invocation
// resumes the SAME persisted login context — unverified whether Pikkit's
// own backend tolerates multiple simultaneous sessions on one signed-in
// account cleanly; watch the first real multi-game day's Browserbase
// replays for unexpected logouts before trusting this at full concurrency.
async function postImport(json: any, gameDate: string, homeTeam: string, awayTeam: string, gameKey: string) {
  const res = await fetch(`${PLATFORM_URL}/api/admin/pikkit-import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.CRON_SECRET}` },
    body: JSON.stringify({ json, gameDate, homeTeam, awayTeam, gameKey }),
  })
  return { ok: res.ok, status: res.status, body: await res.json().catch(() => null) }
}

async function scrapeOneGame(g: TodayGame, date: string, legIdx: number, contextId: string) {
  const bb = await openSession({ contextId })
  try {
    await bb.page.goto('https://app.pikkit.com/leagues/mlb', { waitUntil: 'domcontentloaded' })
    await bb.page.waitForTimeout(1500)

    const clicked = await findAndClickGame(bb.page, g.awayTeam, g.homeTeam, legIdx)
    if (!clicked) return { gameKey: g.gameKey, error: 'game link not found on Pikkit MLB listing page — check the persisted context is still signed in' }
    await bb.page.waitForTimeout(2000)

    await clickTabByText(bb.page, 'Odds')
    await bb.page.waitForTimeout(1000)
    await clickTabByText(bb.page, 'Batting Props')
    await bb.page.waitForTimeout(1000)

    const scrape = await bb.page.evaluate(runPikkitScrape)
    const marketCount = Object.keys(scrape.props).length
    if (!marketCount) return { gameKey: g.gameKey, error: 'no markets scraped' }

    const imported = await postImport(scrape, date, g.homeTeam, g.awayTeam, g.gameKey)
    return { gameKey: g.gameKey, marketsScraped: marketCount, imported }
  } catch (e: any) {
    return { gameKey: g.gameKey, error: e?.message ?? String(e) }
  } finally {
    await bb.close()
  }
}

export async function GET(req: Request) {
  const authError = requireBrowserbaseCronAuth(req)
  if (authError) return authError

  const contextId = process.env.PIKKIT_CONTEXT_ID
  if (!contextId) {
    return NextResponse.json({ error: 'PIKKIT_CONTEXT_ID is not configured — run the one-time login setup first (GET /api/admin/pikkit-context while signed in as admin)' }, { status: 500 })
  }

  const date = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const games = await getTodaysMatchups(date)
  if (!games.length) return NextResponse.json({ date, games: 0, results: [] })

  const gamePkParam = new URL(req.url).searchParams.get('gamePk')
  if (gamePkParam) {
    const gamePk = Number(gamePkParam)
    const g = games.find(x => x.gamePk === gamePk)
    if (!g) return NextResponse.json({ error: `gamePk ${gamePk} not found in today's matchups` }, { status: 404 })
    const result = await scrapeOneGame(g, date, legIndexFor(games, g), contextId)
    return NextResponse.json({ date, gamePk, result })
  }

  const results = await fanOutToSelf('/api/cron/scrape-pikkit', games.map(g => g.gamePk))
  return NextResponse.json({ date, games: games.length, results })
}
