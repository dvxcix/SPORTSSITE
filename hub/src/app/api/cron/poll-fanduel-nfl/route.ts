import { NextResponse } from 'next/server'
import { requireBrowserbaseCronAuth } from '@/lib/cron-auth'
import { getUpcomingNflPikkitGames } from '@/lib/nflPikkitSchedule'
import { PLATFORM_URL } from '@/lib/platform'

export const maxDuration = 300
export const revalidate = 0
export async function GET(req: Request) {
  const auth = requireBrowserbaseCronAuth(req)
  if (auth) return auth
  const games = await getUpcomingNflPikkitGames(1)
  const results = await Promise.all(games.map(async game => {
    try {
      const response = await fetch(`${PLATFORM_URL}/api/cron/scrape-fanduel-nfl?gameId=${encodeURIComponent(game.gameId)}`, {
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` }, signal: AbortSignal.timeout(280000),
      })
      const body = await response.json()
      return { gameId: game.gameId, ok: response.ok, ...body }
    } catch { return { gameId: game.gameId, ok: false, error: 'Capture request failed' } }
  }))
  return NextResponse.json({ games: games.length, results }, { status: results.some(r => !r.ok) ? 502 : 200 })
}
