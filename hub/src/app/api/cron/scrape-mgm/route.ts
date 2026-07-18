import { NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'
import { getTodaysMatchups } from '@/lib/mlbSchedule'
import { openSession } from '@/lib/browserbase'
import { scrapeMgmGame } from '@/lib/scrapers/mgmScraper'
import { findAndClickGame, legIndexer, clickTabByText } from '@/lib/scrapers/gameMatch'
import { PLATFORM_URL } from '@/lib/stripe'

export const revalidate = 0
export const maxDuration = 300

// Automates: nc.betmgm.com/.../mlb-75 -> "EVENTS" tab -> click into each of
// today's real games -> append ?market=PlayerProps to the resulting event
// URL -> scrapeMgmGame() expands "Batter home runs", clicks through both
// 1+/2+ threshold tabs, clicking every "Show more" along the way -> POST
// each threshold's result to mgm-import (unlike FD, this route trusts the
// gameKey we pass explicitly — no title-based re-detection on MGM's side).
async function postImport(json: any, gameDate: string, homeTeam: string, awayTeam: string, gameKey: string) {
  const res = await fetch(`${PLATFORM_URL}/api/admin/mgm-import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.CRON_SECRET}` },
    body: JSON.stringify({ json, gameDate, homeTeam, awayTeam, gameKey, isOpening: true }),
  })
  return { ok: res.ok, status: res.status, body: await res.json().catch(() => null) }
}

export async function GET(req: Request) {
  const authError = requireCronAuth(req)
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
        await bb.page.goto('https://www.nc.betmgm.com/en/sports/baseball-23/betting/usa-9/mlb-75', { waitUntil: 'domcontentloaded' })
        // "EVENTS" not "Futures" — best-effort, harmless if already active.
        await clickTabByText(bb.page, 'EVENTS')
        await bb.page.waitForTimeout(1500)

        const legIdx = nextLeg(g.awayTeam, g.homeTeam)
        const clicked = await findAndClickGame(bb.page, g.awayTeam, g.homeTeam, legIdx)
        if (!clicked) {
          results.push({ gameKey: g.gameKey, error: 'game link not found on MGM listing page' })
          continue
        }
        await bb.page.waitForTimeout(2000)

        const url = bb.page.url()
        const propsUrl = url + (url.includes('?') ? '&' : '?') + 'market=PlayerProps'
        const scrapes = await scrapeMgmGame(bb.page, propsUrl)
        if (!scrapes.length) {
          results.push({ gameKey: g.gameKey, error: 'no thresholds scraped — is "Batter home runs" present for this game?' })
          continue
        }
        const imported = await postImport(scrapes, date, g.homeTeam, g.awayTeam, g.gameKey)
        results.push({ gameKey: g.gameKey, thresholdsScraped: scrapes.length, imported })
      } catch (e: any) {
        results.push({ gameKey: g.gameKey, error: e?.message ?? String(e) })
      }
    }
  } finally {
    await bb.close()
  }

  return NextResponse.json({ date, games: games.length, results })
}
