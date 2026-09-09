import { NextResponse } from 'next/server'
import { requireBrowserbaseCronAuth } from '@/lib/cron-auth'
import { getUpcomingNflPikkitGames } from '@/lib/nflPikkitSchedule'
import { PLATFORM_URL } from '@/lib/platform'
import { createAdminClient } from '@/lib/supabase/admin'
import { withPipelineHealth } from '@/lib/pipelineHealth'

export const maxDuration = 300
export const revalidate = 0
export const GET = withPipelineHealth('poll-fanduel-nfl', run, { allowSecondarySecret: true })
async function run(req: Request) {
  const auth = requireBrowserbaseCronAuth(req)
  if (auth) return auth
  const upcoming = await getUpcomingNflPikkitGames(7)
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const games = (await Promise.all(upcoming.map(async game => {
    if (game.gameDate === today) return game
    const { data, error } = await createAdminClient().from('nfl_fanduel_capture_history').select('captured_at').eq('game_id', game.gameId).order('captured_at', { ascending: false }).limit(1).maybeSingle()
    if (error) throw new Error('Capture status unavailable')
    return !data || Date.now() - Date.parse(data.captured_at) >= 6 * 3600000 ? game : null
  }))).filter((game): game is NonNullable<typeof game> => game !== null)
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
