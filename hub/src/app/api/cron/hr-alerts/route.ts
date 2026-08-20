import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCronAuth } from '@/lib/cron-auth'
import { getTodaysMatchups } from '@slipsurge/core/mlbSchedule'
import { fetchHrFeed } from '@/lib/hrFeed'
import { withPipelineHealth } from '@/lib/pipelineHealth'
import { homeRunAlertEvent } from '@/lib/contactAlertEvents'
import { enqueueContactAlert, processContactAlertJobs } from '@/lib/contactAlertOutbox'

export const revalidate = 0
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300
export const GET = withPipelineHealth('hr-alerts', run)

const LIVE_WATCH_WINDOW_MS = 50_000
const LIVE_POLL_INTERVAL_MS = 5_000

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// Vercel starts this once a minute. When a game is live the invocation remains
// active for most of that minute and reads authoritative MLB play-by-play every
// five seconds. The first sweep also includes final games as recovery. Both
// paths use the same durable outbox/event key, so overlapping invocations,
// source corrections and the recovery sweep cannot create duplicate posts.
async function run(req: Request) {
  const authError = requireCronAuth(req)
  if (authError) return authError

  const admin = createAdminClient()
  const date = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const games = await getTodaysMatchups(date)
  if (!games.length) return NextResponse.json({ ok: true, games: 0, liveGames: 0, sweeps: 0, newHrs: 0 })

  const { data: alreadyAlerted } = await admin
    .from('hr_alert_state')
    .select('game_pk,ab_index')
    .in('game_pk', games.map(game => game.gamePk))
  const alertedKeys = new Set((alreadyAlerted ?? []).map(row => `${row.game_pk}-${row.ab_index}`))

  const liveGames = games.filter(game => game.abstractStatus === 'Live')
  const initialGames = games.map(game => ({
    gamePk: game.gamePk,
    status: { abstractGameState: game.abstractStatus },
  }))
  const watchGames = liveGames.map(game => ({
    gamePk: game.gamePk,
    status: { abstractGameState: 'Live' },
  }))
  const deadline = Date.now() + (liveGames.length ? LIVE_WATCH_WINDOW_MS : 0)
  const deliveryTasks: Promise<unknown>[] = []
  const failures: Array<{ gamePk: number; reason: string }> = []
  let sweeps = 0
  let discovered = 0
  let queued = 0
  let created = 0

  do {
    const sweepStartedAt = Date.now()
    const targets = sweeps === 0 ? initialGames : watchGames
    const feed = await fetchHrFeed(targets, { attempts: 1, timeoutMs: 8_000 })
    sweeps += 1
    failures.push(...feed.failures)

    const newHrs = feed.hrFeed.filter(homeRun => !alertedKeys.has(`${homeRun.game_pk}-${homeRun.ab_index}`))
    if (newHrs.length) {
      const jobs: Array<{ id: string; created: boolean }> = []
      for (const homeRun of newHrs) {
        const gameIndex = games.findIndex(game => game.gamePk === homeRun.game_pk)
        if (gameIndex < 0) continue
        const job = await enqueueContactAlert(
          homeRunAlertEvent(homeRun, games[gameIndex], gameIndex, date, feed.contactFeed),
          sweeps === 1 ? 'hr-alerts-recovery' : 'hr-alerts-live-watch',
        )
        jobs.push(job)
        alertedKeys.add(`${homeRun.game_pk}-${homeRun.ab_index}`)
      }

      if (jobs.length) {
        await admin.from('hr_alert_state').upsert(
          newHrs.map(homeRun => ({ game_pk: homeRun.game_pk, ab_index: homeRun.ab_index })),
          { onConflict: 'game_pk,ab_index', ignoreDuplicates: true },
        )
        // Begin rendering and posting immediately while the watcher continues
        // polling. We await all delivery work before the response closes so
        // Fluid Compute cannot terminate unfinished Discord posts.
        deliveryTasks.push(processContactAlertJobs(jobs.map(job => job.id)))
        discovered += newHrs.length
        queued += jobs.length
        created += jobs.filter(job => job.created).length
      }
    }

    if (!liveGames.length || Date.now() >= deadline) break
    const sleepMs = Math.min(
      Math.max(0, LIVE_POLL_INTERVAL_MS - (Date.now() - sweepStartedAt)),
      Math.max(0, deadline - Date.now()),
    )
    if (sleepMs > 0) await wait(sleepMs)
  } while (Date.now() < deadline)

  const deliveryResults = await Promise.allSettled(deliveryTasks)
  const deliveryFailures = deliveryResults.filter(result => result.status === 'rejected').length

  return NextResponse.json({
    ok: deliveryFailures === 0,
    games: games.length,
    liveGames: liveGames.length,
    sweeps,
    newHrs: discovered,
    queued,
    created,
    deliveryFailures,
    feedFailures: failures,
  })
}
