import { NextResponse } from 'next/server'
import { requireBrowserbaseCronAuth } from '@/lib/cron-auth'
import { getTodaysMatchups } from '@/lib/mlbSchedule'
import { openSession } from '@/lib/browserbase'
import { runFanduelScrape } from '@/lib/scrapers/fanduelScraper'
import { findAndClickGame, legIndexer } from '@/lib/scrapers/gameMatch'
import { PLATFORM_URL } from '@/lib/stripe'

export const revalidate = 0
export const maxDuration = 300

// Automates the exact manual workflow: sportsbook.fanduel.com/navigation/mlb
// -> "GAMES" tab -> click into each of today's real games -> run the
// all-tabs scraper (fanduelScraper.ts handles clicking through every
// non-skipped market tab itself) -> POST the result to fanduel-import,
// which auto-detects the real game from each scrape's own event.title
// (see that route's detectGameFromTitle) so an imprecise listing-page click
// still lands under the right game_key.
async function postImport(json: any, gameDate: string, homeTeam: string, awayTeam: string, gameKey: string) {
  const res = await fetch(`${PLATFORM_URL}/api/admin/fanduel-import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.CRON_SECRET}` },
    body: JSON.stringify({ json, gameDate, homeTeam, awayTeam, gameKey, isOpening: true }),
  })
  return { ok: res.ok, status: res.status, body: await res.json().catch(() => null) }
}

export async function GET(req: Request) {
  const authError = requireBrowserbaseCronAuth(req)
  if (authError) return authError

  const date = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const games = await getTodaysMatchups(date)
  if (!games.length) return NextResponse.json({ date, games: 0, results: [] })

  const nextLeg = legIndexer()
  const bb = await openSession()
  const results: any[] = []

  try {
    for (const g of games) {
      try {
        await bb.page.goto('https://sportsbook.fanduel.com/navigation/mlb', { waitUntil: 'domcontentloaded' })
        // Best-effort — harmless no-op if "GAMES" is already the active tab.
        await bb.page.getByText('GAMES', { exact: true }).first().click({ timeout: 5000 }).catch(() => {})
        await bb.page.waitForTimeout(1500)

        const legIdx = nextLeg(g.awayTeam, g.homeTeam)
        const clicked = await findAndClickGame(bb.page, g.awayTeam, g.homeTeam, legIdx)
        if (!clicked) {
          results.push({ gameKey: g.gameKey, error: 'game link not found on FD listing page' })
          continue
        }
        await bb.page.waitForTimeout(2500)

        const scrapes = await bb.page.evaluate(runFanduelScrape)
        if (!scrapes.length) {
          results.push({ gameKey: g.gameKey, error: 'no tabs scraped' })
          continue
        }
        const imported = await postImport(scrapes, date, g.homeTeam, g.awayTeam, g.gameKey)
        results.push({ gameKey: g.gameKey, tabsScraped: scrapes.length, imported })
      } catch (e: any) {
        results.push({ gameKey: g.gameKey, error: e?.message ?? String(e) })
      }
    }
  } finally {
    await bb.close()
  }

  return NextResponse.json({ date, games: games.length, results })
}
