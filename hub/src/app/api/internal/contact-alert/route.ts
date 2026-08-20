import { after, NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'
import { getTodaysMatchups } from '@slipsurge/core/mlbSchedule'
import { fetchHrFeed } from '@/lib/hrFeed'
import { homeRunAlertEvent, nearHomeRunAlertEvent, type NearHrSourceRow } from '@/lib/contactAlertEvents'
import { enqueueContactAlert, processContactAlertJobs } from '@/lib/contactAlertOutbox'
import { fetchMlbPartyRows } from '@/lib/mlbPartyServer'

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
  schema?: string
}

const NEAR_HR_SELECT = [
  'id', 'game_pk', 'game_date', 'play_id', 'batter_name', 'batter_id',
  'pitcher_name', 'pitch_type', 'pitch_speed', 'result', 'inning',
  'half_inning', 'exit_velocity', 'launch_angle', 'hit_distance',
  'hit_bearing', 'parks_hr_count', 'park_hr_list', 'home_team', 'away_team',
  'captured_at',
].join(',')

function easternDate() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}

function sourceWebhookCandidate(body: TriggerBody) {
  const id = Number(body.record?.id)
  return body.type === 'INSERT'
    && body.schema === 'public'
    && body.table === 'near_hrs'
    && Number.isSafeInteger(id)
    && id > 0
}

async function canonicalNearHrWebhookRow(body: TriggerBody): Promise<NearHrSourceRow | null> {
  if (!sourceWebhookCandidate(body)) return null
  const id = Number(body.record?.id)
  const rows = await fetchMlbPartyRows<NearHrSourceRow>(
    `/rest/v1/near_hrs?id=eq.${id}&select=${NEAR_HR_SELECT}&limit=1`,
    { maxRows: 1 },
  )
  const row = rows[0]
  if (!row || !row.batter_name || row.game_date !== easternDate()) return null

  const capturedAt = new Date(String(row.captured_at ?? '')).getTime()
  const age = Date.now() - capturedAt
  if (!Number.isFinite(capturedAt) || age < -2 * 60_000 || age > 15 * 60_000) return null

  if (
    Number(row.game_pk) !== Number(body.record?.game_pk)
    || String(row.batter_name).trim().toLowerCase() !== String(body.record?.batter_name ?? '').trim().toLowerCase()
    || capturedAt !== new Date(String(body.record?.captured_at ?? '')).getTime()
  ) return null

  return row
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as TriggerBody | null
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const authError = requireCronAuth(request)
  let verifiedWebhookRow: NearHrSourceRow | null = null
  if (authError) {
    try {
      verifiedWebhookRow = await canonicalNearHrWebhookRow(body)
    } catch (error) {
      console.error('[contact-alert] source webhook validation failed', error)
      return NextResponse.json({ error: 'Source validation unavailable' }, { status: 503 })
    }
    if (!verifiedWebhookRow) return authError
  }

  const record = verifiedWebhookRow ?? body.record

  const date = record?.game_date ?? easternDate()
  const games = await getTodaysMatchups(date)
  const targetGamePk = Number(body.gamePk ?? record?.game_pk ?? 0)
  const feedGames = targetGamePk ? games.filter(game => game.gamePk === targetGamePk) : games
  const { hrFeed, contactFeed, failures } = await fetchHrFeed(feedGames.map(game => ({
    gamePk: game.gamePk,
    status: { abstractGameState: game.abstractStatus },
  })))

  const jobs: Array<{ id: string; eventKey: string; created: boolean }> = []
  const kind = body.kind ?? (body.table === 'near_hrs' || record ? 'near_hr' : 'hr')
  if (kind === 'near_hr') {
    if (!record) return NextResponse.json({ error: 'Near-HR trigger requires record' }, { status: 400 })
    const event = nearHomeRunAlertEvent(record, games, date, contactFeed)
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
