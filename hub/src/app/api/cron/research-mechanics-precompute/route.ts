import { NextResponse } from 'next/server'
import { getTodaysMatchups } from '@slipsurge/core/mlbSchedule'
import { requireCronAuth } from '@/lib/cron-auth'
import { getGameMechanicsWindows } from '@/lib/hrMechanicsCache'
import { withPipelineHealth } from '@/lib/pipelineHealth'
import { getMechanicsStatcastReadiness } from '@/lib/statcastMechanicsReadiness'

export const revalidate = 0
export const maxDuration = 300

async function pooled<T, R>(items: T[], concurrency: number, task: (item: T) => Promise<R>) {
  const results: R[] = []
  let cursor = 0
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++]
      results.push(await task(item))
    }
  }))
  return results
}

async function run(req: Request) {
  const authError = requireCronAuth(req)
  if (authError) return authError

  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date') || new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const requestedGamePk = Number(searchParams.get('gamePk')) || null
  const schedule = await getTodaysMatchups(date, { includeCandidates: true })
  const games = schedule.filter(game =>
    (game.awayCandidates?.length || game.awayLineup.length) > 0
    && (game.homeCandidates?.length || game.homeLineup.length) > 0
    && (!requestedGamePk || game.gamePk === requestedGamePk),
  )

  const readinessChecks = await pooled(games, 4, async game => ({
    gamePk: game.gamePk,
    readiness: await getMechanicsStatcastReadiness(game, date),
  }))
  const deferred = readinessChecks.filter(check => !check.readiness.ready)
  if (deferred.length) {
    const first = deferred[0].readiness
    return NextResponse.json({
      ok: false,
      deferred: true,
      date,
      requiredThroughDate: first.requiredThroughDate,
      stage: first.stage,
      reason: first.reason,
      retryAt: first.retryAt,
      gamesWaiting: deferred.map(check => ({
        gamePk: check.gamePk,
        stage: check.readiness.stage,
        reason: check.readiness.reason,
        missingProfiles: check.readiness.missingProfiles.length,
      })),
    }, {
      status: 425,
      headers: { 'Retry-After': '3600' },
    })
  }

  const failures: { gamePk: number; error: string }[] = []
  const completed = await pooled(games, 2, async game => {
    try {
      const { results } = await getGameMechanicsWindows(game, date, { force: true, verifySources: false })
      return { gamePk: game.gamePk, windows: Object.keys(results).length }
    } catch (cause) {
      console.error('[research-mechanics-precompute] game failed', { gamePk: game.gamePk, type: cause instanceof Error ? cause.name : typeof cause })
      failures.push({ gamePk: game.gamePk, error: 'precompute failed' })
      return null
    }
  })

  const successful = completed.filter(Boolean)
  return NextResponse.json({
    ok: failures.length === 0,
    date,
    gamesFound: games.length,
    gamesComputed: successful.length,
    windowsComputed: successful.reduce((sum, row) => sum + (row?.windows ?? 0), 0),
    failures,
  }, { status: failures.length ? 503 : 200 })
}

export const GET = withPipelineHealth('research-mechanics-precompute', run)
