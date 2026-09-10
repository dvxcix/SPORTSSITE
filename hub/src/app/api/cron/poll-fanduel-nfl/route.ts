import { NextResponse } from 'next/server'
import { requireBrowserbaseCronAuth } from '@/lib/cron-auth'
import { getUpcomingNflPikkitGames } from '@/lib/nflPikkitSchedule'
import { PLATFORM_URL } from '@/lib/platform'
import { createAdminClient } from '@/lib/supabase/admin'
import { withPipelineHealth } from '@/lib/pipelineHealth'
import { captureNeedsRefresh } from '@/lib/browserbaseRefresh'

export const maxDuration = 300
export const revalidate = 0
export const GET = withPipelineHealth('poll-fanduel-nfl', run, { allowSecondarySecret: true })
async function inBatches<T, R>(items: T[], size: number, worker: (item: T) => Promise<R>) {
  const output: R[] = []
  for (let index = 0; index < items.length; index += size) output.push(...await Promise.all(items.slice(index, index + size).map(worker)))
  return output
}
async function run(req: Request) {
  const auth = requireBrowserbaseCronAuth(req)
  if (auth) return auth
  const upcoming = await getUpcomingNflPikkitGames(7)
  const now = new Date()
  const admin = createAdminClient()
  const candidates = (await Promise.all(upcoming.map(async game => {
    const { data, error } = await admin.from('nfl_fanduel_capture_history').select('captured_at').eq('game_id', game.gameId).order('captured_at', { ascending: false }).limit(1).maybeSingle()
    if (error) throw new Error('Capture status unavailable')
    const capturedAt = data?.captured_at ? Date.parse(data.captured_at) : 0
    return captureNeedsRefresh({ gameDate: game.gameDate, gameTime: game.gameTime, capturedAt }, now) ? { game, capturedAt } : null
  }))).filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
    .sort((a, b) => a.capturedAt - b.capturedAt || a.game.gameDate.localeCompare(b.game.gameDate))
  // Rotate the stalest six games each run. At a 30-minute cadence this covers
  // a full Sunday slate without a single dispatcher attempting 16 browsers.
  const games = candidates.slice(0, 6).map(candidate => candidate.game)
  // Browser sessions are memory-heavy. Two at a time keeps the dispatcher
  // inside the function budget and avoids one large slate exhausting memory.
  const results = await inBatches(games, 2, async game => {
    try {
      const response = await fetch(`${PLATFORM_URL}/api/cron/scrape-fanduel-nfl?gameId=${encodeURIComponent(game.gameId)}`, {
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` }, signal: AbortSignal.timeout(80_000),
      })
      const body = await response.json()
      return { gameId: game.gameId, ok: response.ok, ...body }
    } catch { return { gameId: game.gameId, ok: false, error: 'Capture request failed' } }
  })
  const summary = { discovered: upcoming.length, stale: candidates.length, games: games.length, succeeded: results.filter(result => result.ok).length, failed: results.filter(result => !result.ok).length }
  console.info('[poll-fanduel-nfl] complete', { ...summary, results })
  return NextResponse.json({ ...summary, results }, { status: summary.failed ? 502 : 200 })
}
