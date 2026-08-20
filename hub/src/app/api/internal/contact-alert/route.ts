import { after, NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'
import { getTodaysMatchups } from '@slipsurge/core/mlbSchedule'
import { fetchHrFeed } from '@/lib/hrFeed'
import { homeRunAlertEvent, nearHomeRunAlertEvent, type NearHrSourceRow } from '@/lib/contactAlertEvents'
import { enqueueContactAlert, processContactAlertJobs } from '@/lib/contactAlertOutbox'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

type TriggerBody = {
  kind?: 'hr' | 'near_hr'
  gamePk?: number
  abIndex?: number
  record?: NearHrSourceRow
  type?: string
  table?: string
}

export async function POST(request: Request) {
  const authError = requireCronAuth(request)
  if (authError) return authError
  const body = await request.json().catch(() => null) as TriggerBody | null
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const date = body.record?.game_date
    ?? new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const games = await getTodaysMatchups(date)
  const targetGamePk = Number(body.gamePk ?? body.record?.game_pk ?? 0)
  const feedGames = targetGamePk ? games.filter(game => game.gamePk === targetGamePk) : games
  const { hrFeed, contactFeed, failures } = await fetchHrFeed(feedGames.map(game => ({
    gamePk: game.gamePk,
    status: { abstractGameState: game.abstractStatus },
  })))

  const jobs: Array<{ id: string; eventKey: string; created: boolean }> = []
  const kind = body.kind ?? (body.table === 'near_hrs' || body.record ? 'near_hr' : 'hr')
  if (kind === 'near_hr') {
    if (!body.record) return NextResponse.json({ error: 'Near-HR trigger requires record' }, { status: 400 })
    const event = nearHomeRunAlertEvent(body.record, games, date, contactFeed)
    if (!event) return NextResponse.json({ error: 'Could not match near-HR row to today\'s game' }, { status: 422 })
    jobs.push(await enqueueContactAlert(event, 'feed-webhook'))
  } else {
    const matches = hrFeed.filter(homeRun => (
      (!targetGamePk || homeRun.game_pk === targetGamePk)
      && (body.abIndex == null || homeRun.ab_index === Number(body.abIndex))
    ))
    for (const homeRun of matches) {
      const gameIndex = games.findIndex(game => game.gamePk === homeRun.game_pk)
      if (gameIndex < 0) continue
      jobs.push(await enqueueContactAlert(homeRunAlertEvent(homeRun, games[gameIndex], gameIndex, date, contactFeed), 'feed-webhook'))
    }
  }

  if (jobs.length) after(() => processContactAlertJobs(jobs.map(job => job.id)))
  return NextResponse.json({ ok: true, accepted: jobs.length, jobs, feedFailures: failures }, { status: 202 })
}
