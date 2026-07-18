import { NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'
import { getTodaysMatchups } from '@/lib/mlbSchedule'
import { openSession } from '@/lib/browserbase'
import { runPikkitScrape } from '@/lib/scrapers/pikkitScraper'
import { findAndClickGame, legIndexer, clickTabByText } from '@/lib/scrapers/gameMatch'
import { PLATFORM_URL } from '@/lib/stripe'

export const revalidate = 0
export const maxDuration = 300

// Automates: app.pikkit.com/leagues/mlb -> click into each of today's real
// games -> the event page's "Odds" header tab -> "Batting Props" sub-tab
// -> runPikkitScrape() (walks the market <select>, same as the manual
// bookmarklet) -> POST to pikkit-import. Runs against a PERSISTED
// Browserbase context (PIKKIT_CONTEXT_ID) since this is the one site of
// the three that requires being signed in — see /api/admin/pikkit-context
// for the one-time login setup that produces that context id.
async function postImport(json: any, gameDate: string, homeTeam: string, awayTeam: string, gameKey: string) {
  const res = await fetch(`${PLATFORM_URL}/api/admin/pikkit-import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.CRON_SECRET}` },
    body: JSON.stringify({ json, gameDate, homeTeam, awayTeam, gameKey }),
  })
  return { ok: res.ok, status: res.status, body: await res.json().catch(() => null) }
}

export async function GET(req: Request) {
  const authError = requireCronAuth(req)
  if (authError) return authError

  const contextId = process.env.PIKKIT_CONTEXT_ID
  if (!contextId) {
    return NextResponse.json({ error: 'PIKKIT_CONTEXT_ID is not configured — run the one-time login setup first (GET /api/admin/pikkit-context while signed in as admin)' }, { status: 500 })
  }

  const date = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const games = await getTodaysMatchups(date)
  if (!games.length) return NextResponse.json({ date, games: 0, results: [] })

  const nextLeg = legIndexer()
  const bb = await openSession({ contextId })
  const results: any[] = []

  try {
    for (const g of games) {
      try {
        await bb.page.goto('https://app.pikkit.com/leagues/mlb', { waitUntil: 'domcontentloaded' })
        await bb.page.waitForTimeout(1500)

        const legIdx = nextLeg(g.awayTeam, g.homeTeam)
        const clicked = await findAndClickGame(bb.page, g.awayTeam, g.homeTeam, legIdx)
        if (!clicked) {
          results.push({ gameKey: g.gameKey, error: 'game link not found on Pikkit MLB listing page — check the persisted context is still signed in' })
          continue
        }
        await bb.page.waitForTimeout(2000)

        await clickTabByText(bb.page, 'Odds')
        await bb.page.waitForTimeout(1000)
        await clickTabByText(bb.page, 'Batting Props')
        await bb.page.waitForTimeout(1000)

        const scrape = await bb.page.evaluate(runPikkitScrape)
        const marketCount = Object.keys(scrape.props).length
        if (!marketCount) {
          results.push({ gameKey: g.gameKey, error: 'no markets scraped' })
          continue
        }
        const imported = await postImport(scrape, date, g.homeTeam, g.awayTeam, g.gameKey)
        results.push({ gameKey: g.gameKey, marketsScraped: marketCount, imported })
      } catch (e: any) {
        results.push({ gameKey: g.gameKey, error: e?.message ?? String(e) })
      }
    }
  } finally {
    await bb.close()
  }

  return NextResponse.json({ date, games: games.length, results })
}
