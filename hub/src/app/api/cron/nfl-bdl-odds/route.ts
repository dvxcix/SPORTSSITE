import { NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'
import { withPipelineHealth } from '@/lib/pipelineHealth'
import { createAdminClient } from '@/lib/supabase/admin'
import { getLiveNflOddsBoard, getNflBdlGames, nflOddsPayloadHash } from '@/lib/nflOdds'

export const revalidate = 0
export const maxDuration = 300
export const GET = withPipelineHealth('nfl-bdl-odds', run)

type ScheduleRow = {
  game_id: string
  season: number
  week: number
  game_type: string
  gameday: string
  away_team: string
  home_team: string
}

async function inBatches<T, R>(items: T[], batchSize: number, worker: (item: T) => Promise<R>) {
  const output: R[] = []
  for (let index = 0; index < items.length; index += batchSize) {
    output.push(...await Promise.all(items.slice(index, index + batchSize).map(worker)))
  }
  return output
}

async function writeBatches<T>(rows: T[], writer: (batch: T[]) => PromiseLike<{ error: { message: string } | null }>) {
  for (let index = 0; index < rows.length; index += 4) {
    const { error } = await writer(rows.slice(index, index + 4))
    if (error) throw new Error(error.message)
  }
}

async function run(req: Request) {
  const authError = requireCronAuth(req)
  if (authError) return authError

  const admin = createAdminClient()
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const through = new Date(`${today}T12:00:00Z`)
  through.setUTCDate(through.getUTCDate() + 7)

  const { data, error } = await admin
    .from('nfl_schedule')
    .select('game_id, season, week, game_type, gameday, away_team, home_team')
    .gte('gameday', today)
    .lte('gameday', through.toISOString().slice(0, 10))
    .order('gameday')
    .order('gametime')
    .limit(32)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const schedule = (data ?? []) as ScheduleRow[]
  if (!schedule.length) return NextResponse.json({ captured: 0, changed: 0, games: [] })

  const { data: existing } = await admin
    .from('nfl_odds_current')
    .select('game_id, payload_hash')
    .in('game_id', schedule.map(game => game.game_id))
  const previousHashes = new Map((existing ?? []).map(row => [row.game_id, row.payload_hash]))

  const weekKeys = Array.from(new Set(schedule.map(game => `${game.season}:${game.week}`)))
  const gamePools = new Map<string, Awaited<ReturnType<typeof getNflBdlGames>>>()
  await Promise.all(weekKeys.map(async key => {
    const [season, week] = key.split(':').map(Number)
    gamePools.set(key, await getNflBdlGames(season, week))
  }))

  const results = await inBatches(schedule, 3, async game => {
    try {
      const ref = {
        id: game.game_id,
        season: game.season,
        week: game.week,
        gameType: game.game_type,
        gameday: game.gameday,
        away: { abbr: game.away_team },
        home: { abbr: game.home_team },
      }
      const board = await getLiveNflOddsBoard(ref, gamePools.get(`${game.season}:${game.week}`))
      if (!board.bdlGameId || board.status === 'unavailable') return { gameId: game.game_id, status: board.status }
      const payloadHash = nflOddsPayloadHash(board)
      return {
        gameId: game.game_id,
        status: board.status,
        changed: previousHashes.get(game.game_id) !== payloadHash,
        row: {
          game_id: game.game_id,
          bdl_game_id: board.bdlGameId,
          season: game.season,
          week: game.week,
          away_abbr: game.away_team,
          home_abbr: game.home_team,
          board,
          payload_hash: payloadHash,
          captured_at: board.capturedAt,
        },
      }
    } catch (caught) {
      console.error('[nfl-bdl-odds] capture failed', game.game_id, caught)
      return { gameId: game.game_id, status: 'error' }
    }
  })

  const rows = results.flatMap(result => result.row ? [result.row] : [])
  const changedRows = results.flatMap(result => result.row && result.changed ? [result.row] : [])
  if (rows.length) {
    await writeBatches(rows, batch => admin.from('nfl_odds_current').upsert(batch, { onConflict: 'game_id' }))
  }
  if (changedRows.length) {
    await writeBatches(changedRows, batch => admin.from('nfl_odds_snapshot_history').insert(batch))
  }

  return NextResponse.json({
    captured: rows.length,
    changed: changedRows.length,
    games: results.map(({ gameId, status, changed }) => ({ gameId, status, changed: Boolean(changed) })),
  })
}
