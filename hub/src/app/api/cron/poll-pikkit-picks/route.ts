import { NextResponse } from 'next/server'
import { requireBrowserbaseCronAuth } from '@/lib/cron-auth'
import { getTodaysMatchups, isPregame } from '@/lib/mlbSchedule'
import { PLATFORM_URL } from '@/lib/stripe'

export const revalidate = 0
export const maxDuration = 280

// Runs every 30 minutes (see vercel.json). Unlike FanDuel/BetMGM — which
// only need ONE scrape per game, right when the opening line appears —
// Pikkit's community pick counts keep changing throughout the whole
// pregame window and the picks section itself disappears once a game
// starts, so this re-scrapes every game that hasn't started yet, every
// run, for as long as it stays pregame. Fans out one concurrent request
// per game to scrape-pikkit?gamePk=... (see fanOutToSelf's reasoning in
// that route) rather than looping — bounded by the slowest single game.
export async function GET(req: Request) {
  const authError = requireBrowserbaseCronAuth(req)
  if (authError) return authError

  const date = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const games = await getTodaysMatchups(date)
  const pregame = games.filter(g => isPregame(g.status))
  if (!pregame.length) return NextResponse.json({ date, games: games.length, pregame: 0, results: [] })

  const results = await Promise.allSettled(
    pregame.map(async g => {
      const res = await fetch(`${PLATFORM_URL}/api/cron/scrape-pikkit?gamePk=${g.gamePk}`, {
        headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
      })
      return { gamePk: g.gamePk, status: res.status }
    })
  )

  return NextResponse.json({
    date,
    games: games.length,
    pregame: pregame.length,
    results: results.map((r, i) => r.status === 'fulfilled' ? r.value : { gamePk: pregame[i].gamePk, error: r.reason?.message ?? String(r.reason) }),
  })
}
