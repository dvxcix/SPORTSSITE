import { NextResponse } from 'next/server'
import { requireBrowserbaseCronAuth } from '@/lib/cron-auth'
import { withPipelineHealth } from '@/lib/pipelineHealth'
import { PLATFORM_URL } from '@/lib/platform'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUpcomingNflPikkitGames } from '@/lib/nflPikkitSchedule'
import { checkPikkitAuthAndAlert } from '@/lib/scrapers/pikkitAuth'

export const revalidate = 0
export const maxDuration = 300

async function inBatches<T, R>(items: T[], size: number, worker: (item: T) => Promise<R>) {
  const output: R[] = []
  for (let index = 0; index < items.length; index += size) output.push(...await Promise.all(items.slice(index, index + size).map(worker)))
  return output
}

async function run(req: Request) {
  const authError = requireBrowserbaseCronAuth(req)
  if (authError) return authError
  const games = await getUpcomingNflPikkitGames(7)
  if (!games.length) return NextResponse.json({ games: 0, attempted: 0, results: [] })

  const admin = createAdminClient()
  const { data: existing } = await admin.from('nfl_pikkit_picks_current').select('game_id,captured_at').in('game_id', games.map(game => game.gameId))
  const prior = new Map((existing ?? []).map(row => [row.game_id, Date.parse(row.captured_at)]))
  const now = Date.now()
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const candidates = games.filter(game => {
    const daysUntil = (new Date(`${game.gameDate}T12:00:00Z`).getTime() - new Date(`${today}T12:00:00Z`).getTime()) / 86_400_000
    const captured = prior.get(game.gameId)
    return daysUntil <= 2 || !captured || now - captured >= 6 * 60 * 60_000
  })

  const results = await inBatches(candidates, 2, async game => {
    try {
      const response = await fetch(`${PLATFORM_URL}/api/cron/scrape-pikkit-nfl?gameId=${encodeURIComponent(game.gameId)}`, {
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
        signal: AbortSignal.timeout(120_000),
      })
      const body = await response.json().catch(() => null)
      const skipped = body?.skipped === true
      return { gameId: game.gameId, ok: response.ok || skipped, skipped, status: response.status, markets: Number(body?.marketCount ?? 0), error: body?.error ?? null }
    } catch (error) {
      return { gameId: game.gameId, ok: false, skipped: false, status: 502, markets: 0, error: error instanceof Error ? error.name : 'request failed' }
    }
  })
  const failed = results.filter(result => !result.ok)
  const allListingsMissing = results.length > 0 && results.every(result => (
    result.skipped && result.error === 'NFL game link not found on Pikkit'
  ))
  if (allListingsMissing && process.env.PIKKIT_CONTEXT_ID) {
    await checkPikkitAuthAndAlert(process.env.PIKKIT_CONTEXT_ID).catch(error => {
      console.error('[poll-pikkit-nfl-picks] auth alert check failed', {
        type: error instanceof Error ? error.name : typeof error,
      })
    })
  }
  const allSkipped = results.length > 0 && results.every(result => result.skipped)
  const summary = { games: games.length, attempted: candidates.length, succeeded: results.filter(result => result.ok && !result.skipped).length, failed: failed.length, skipped: results.filter(result => result.skipped).length }
  console.info('[poll-pikkit-nfl-picks] complete', { ...summary, results })
  if (allSkipped) {
    return NextResponse.json({ ...summary, reason: 'Pikkit has not exposed NFL public-pick markets for the scheduled games yet', results }, { status: 425 })
  }
  const missingToday = results.filter(result => result.skipped && games.find(game => game.gameId === result.gameId)?.gameDate === today)
  if (missingToday.length && !failed.length) return NextResponse.json({ ...summary, reason: 'Today’s NFL picks were not refreshed', results }, { status: 425 })
  return NextResponse.json({ ...summary, results }, { status: failed.length ? 502 : 200 })
}

export const GET = withPipelineHealth('poll-pikkit-nfl-picks', run, { allowSecondarySecret: true })
