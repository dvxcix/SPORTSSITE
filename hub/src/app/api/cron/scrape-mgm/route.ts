import { NextResponse } from 'next/server'
import { requireBrowserbaseCronAuth } from '@/lib/cron-auth'
import { getTodaysMatchups, type TodayGame } from '@/lib/mlbSchedule'
import { openSession } from '@/lib/browserbase'
import { scrapeMgmGame } from '@/lib/scrapers/mgmScraper'
import { findAndClickGame, legIndexFor, clickTabByText } from '@/lib/scrapers/gameMatch'
import { fanOutToSelf } from '@/lib/scrapers/fanout'
import { PLATFORM_URL } from '@/lib/stripe'

export const revalidate = 0
export const maxDuration = 300

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
  })
  return { ok: res.ok, status: res.status, body: await res.json().catch(() => null) }
}

async function scrapeOneGame(g: TodayGame, date: string, legIdx: number) {
  const bb = await openSession({ stealth: true })
  try {
    await bb.page.goto('https://www.nc.betmgm.com/en/sports/baseball-23/betting/usa-9/mlb-75', { waitUntil: 'domcontentloaded' })
    // "EVENTS" not "Futures" — best-effort, harmless if already active.
    await clickTabByText(bb.page, 'EVENTS')
    await bb.page.waitForTimeout(1500)

    const clicked = await findAndClickGame(bb.page, g.awayTeam, g.homeTeam, legIdx)
    if (!clicked) return { gameKey: g.gameKey, error: 'game link not found on MGM listing page' }
    await bb.page.waitForTimeout(2000)

    const url = bb.page.url()
    const propsUrl = url + (url.includes('?') ? '&' : '?') + 'market=PlayerProps'
    const scrapes = await scrapeMgmGame(bb.page, propsUrl)
    if (!scrapes.length) return { gameKey: g.gameKey, error: 'no thresholds scraped — is "Batter home runs" present for this game?' }

    const imported = await postImport(scrapes, date, g.homeTeam, g.awayTeam, g.gameKey)
    return { gameKey: g.gameKey, thresholdsScraped: scrapes.length, imported }
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

  const results = await fanOutToSelf('/api/cron/scrape-mgm', games.map(g => g.gamePk))
  return NextResponse.json({ date, games: games.length, results })
}
