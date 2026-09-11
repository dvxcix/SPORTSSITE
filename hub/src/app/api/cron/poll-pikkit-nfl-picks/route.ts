import { NextResponse } from 'next/server'
import { requireBrowserbaseCronAuth } from '@/lib/cron-auth'
import { withPipelineHealth } from '@/lib/pipelineHealth'
import { PLATFORM_URL } from '@/lib/platform'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUpcomingNflPikkitGames } from '@/lib/nflPikkitSchedule'
import { checkPikkitAuthAndAlert } from '@/lib/scrapers/pikkitAuth'
import { easternKickoff } from '@/lib/browserbaseRefresh'
import { pikkitCaptureDecision } from '@/lib/pikkitCaptureSchedule'

export const revalidate = 0
export const maxDuration = 300

async function run(req: Request) {
  const authError = requireBrowserbaseCronAuth(req)
  if (authError) return authError
  const games = await getUpcomingNflPikkitGames(7)
  if (!games.length) return NextResponse.json({ games: 0, attempted: 0, results: [] })

  const admin = createAdminClient()
  const { data: existing } = await admin.from('nfl_pikkit_picks_current').select('game_id,captured_at').in('game_id', games.map(game => game.gameId))
  const prior = new Map((existing ?? []).map(row => [row.game_id, Date.parse(row.captured_at)]))
  const now = new Date()
  const force = new URL(req.url).searchParams.get('force') === '1'
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const decisions = games.map(game => {
    const kickoff = easternKickoff(game.gameDate, game.gameTime)?.getTime() ?? NaN
    return {
      game,
      decision: force
        ? { due: Number.isFinite(kickoff) && kickoff > now.getTime(), slotHours: null, targetAt: null, reason: 'manual-force' }
        : pikkitCaptureDecision('nfl', kickoff, prior.get(game.gameId) ?? null, now.getTime()),
    }
  })
  const selected = decisions.filter(item => item.decision.due).map(item => item.game)
  if (!selected.length) {
    return NextResponse.json({
      games: games.length, due: 0, attempted: 0, browserSessions: 0,
      decisions: decisions.map(({ game, decision }) => ({ gameId: game.gameId, gameDate: game.gameDate, ...decision })),
      results: [],
    })
  }

  let response: Response
  let body: { results?: Array<Record<string, unknown>> } | null = null
  try {
    response = await fetch(`${PLATFORM_URL}/api/cron/scrape-pikkit-nfl?gameIds=${encodeURIComponent(selected.map(game => game.gameId).join(','))}`, {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      signal: AbortSignal.timeout(260_000),
    })
    body = await response.json().catch(() => null)
  } catch {
    response = new Response(null, { status: 502 })
  }
  const rawResults = Array.isArray(body?.results) ? body.results : []
  const results = selected.map((game, index) => {
    const result = rawResults[index]
    const skipped = result?.skipped === true
    const error = typeof result?.error === 'string' ? result.error : response.ok ? null : 'batch request failed'
    return {
      gameId: game.gameId, ok: (response.ok || skipped) && Boolean(result), skipped,
      status: response.status, markets: Number(result?.marketCount ?? 0), error,
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
  const summary = { games: games.length, due: selected.length, attempted: selected.length, browserSessions: body ? 1 : 0, succeeded: results.filter(result => result.ok && !result.skipped).length, failed: failed.length, skipped: results.filter(result => result.skipped).length }
  console.info('[poll-pikkit-nfl-picks] complete', { ...summary, results })
  if (allSkipped) {
    return NextResponse.json({ ...summary, reason: 'Pikkit has not exposed NFL public-pick markets for the scheduled games yet', decisions: decisions.map(({ game, decision }) => ({ gameId: game.gameId, gameDate: game.gameDate, ...decision })), results }, { status: 425 })
  }
  const missingToday = results.filter(result => result.skipped && games.find(game => game.gameId === result.gameId)?.gameDate === today)
  if (missingToday.length && !failed.length) return NextResponse.json({ ...summary, reason: 'Today’s NFL picks were not refreshed', decisions: decisions.map(({ game, decision }) => ({ gameId: game.gameId, gameDate: game.gameDate, ...decision })), results }, { status: 425 })
  return NextResponse.json({ ...summary, decisions: decisions.map(({ game, decision }) => ({ gameId: game.gameId, gameDate: game.gameDate, ...decision })), results }, { status: failed.length ? 502 : 200 })
}

export const GET = withPipelineHealth('poll-pikkit-nfl-picks', run, { allowSecondarySecret: true })
