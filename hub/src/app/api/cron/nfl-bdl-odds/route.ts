import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { requireCronAuth } from '@/lib/cron-auth'
import { withPipelineHealth } from '@/lib/pipelineHealth'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getLiveNflOddsBoard,
  getNflBdlGames,
  getOpeningNflOddsBoard,
  mergeNflOddsBoards,
  nflOddsPayloadHash,
} from '@/lib/nflOdds'
import {
  attachNflTdBaselines,
  ingestNflMarketBoard,
  refreshNflTdBaselines,
  type NflMarketScheduleGame,
  type NflTdBaselineRow,
} from '@/lib/nflMarketArchive'
import type { SidelineOddsBoard } from '@/lib/nflOddsTypes'

export const revalidate = 0
export const maxDuration = 300
export const GET = withPipelineHealth('nfl-bdl-odds', run)

type ScheduleRow = {
  game_id: string
  season: number
  week: number
  game_type: string
  gameday: string
  gametime: string | null
  away_team: string
  home_team: string
}

type StoredBoard = { board: SidelineOddsBoard; payload_hash: string; captured_at: string }

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

async function backfillOneHistoricalGame(admin: ReturnType<typeof createAdminClient>, today: string) {
  const { data: recentGames, error } = await admin
    .from('nfl_schedule')
    .select('game_id, season, week, game_type, gameday, gametime, away_team, home_team')
    .gte('gameday', '2025-10-01')
    .lt('gameday', today)
    .order('gameday', { ascending: false })
    .limit(400)
  if (error) throw new Error(`NFL backfill schedule unavailable: ${error.message}`)
  if (!recentGames?.length) return null

  const { data: statusRows } = await admin
    .from('nfl_odds_backfill_status')
    .select('game_id,status,attempts')
    .in('game_id', recentGames.map(game => game.game_id))
  const statuses = new Map((statusRows ?? []).map(row => [row.game_id, row]))
  const finished = new Set((statusRows ?? [])
    .filter(row => row.status === 'complete' || row.status === 'no-data' || (row.status === 'failed' && row.attempts >= 3))
    .map(row => row.game_id))
  const game = recentGames.find(candidate => !finished.has(candidate.game_id)) as ScheduleRow | undefined
  if (!game) return null

  try {
    const pool = await getNflBdlGames(game.season, game.week)
    const board = await getOpeningNflOddsBoard({
      id: game.game_id,
      season: game.season,
      week: game.week,
      gameType: game.game_type,
      gameday: game.gameday,
      away: { abbr: game.away_team },
      home: { abbr: game.home_team },
    }, pool)
    const complete = board.status === 'ready' && board.players.length > 0
    if (complete) await ingestNflMarketBoard(admin, game as NflMarketScheduleGame, board, 'opening-backfill')
    await admin.from('nfl_odds_backfill_status').upsert({
      game_id: game.game_id,
      bdl_game_id: board.bdlGameId,
      status: complete ? 'complete' : 'no-data',
      attempts: 1,
      last_error: null,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'game_id' })
    return { gameId: game.game_id, status: complete ? 'complete' : 'no-data', rows: complete ? board.players.length : 0 }
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught)
    const attempts = (statuses.get(game.game_id)?.attempts ?? 0) + 1
    await admin.from('nfl_odds_backfill_status').upsert({
      game_id: game.game_id,
      status: 'failed',
      attempts,
      last_error: message.slice(0, 500),
      completed_at: attempts >= 3 ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'game_id' })
    console.error('[nfl-bdl-odds] historical backfill failed', game.game_id, caught)
    return { gameId: game.game_id, status: 'failed', rows: 0 }
  }
}

async function run(req: Request) {
  const authError = requireCronAuth(req)
  if (authError) return authError

  const admin = createAdminClient()
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const backfill = await backfillOneHistoricalGame(admin, today)
  const through = new Date(`${today}T12:00:00Z`)
  through.setUTCDate(through.getUTCDate() + 7)

  const { data, error } = await admin
    .from('nfl_schedule')
    .select('game_id, season, week, game_type, gameday, gametime, away_team, home_team')
    .gte('gameday', today)
    .lte('gameday', through.toISOString().slice(0, 10))
    .order('gameday')
    .order('gametime')
    .limit(32)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const schedule = (data ?? []) as ScheduleRow[]
  if (!schedule.length) {
    if (backfill?.status === 'complete') revalidateTag('sideline:nfl-odds', 'max')
    return NextResponse.json({ captured: 0, changed: 0, baselines: 0, backfill, games: [] })
  }

  const { data: existing } = await admin
    .from('nfl_odds_current')
    .select('game_id, board, payload_hash, captured_at')
    .in('game_id', schedule.map(game => game.game_id))
  const previous = new Map((existing ?? []).map(row => [row.game_id, row as StoredBoard]))

  const now = Date.now()
  const captureSchedule = schedule.filter(game => {
    const daysUntil = (new Date(`${game.gameday}T12:00:00Z`).getTime() - new Date(`${today}T12:00:00Z`).getTime()) / 86_400_000
    const stored = previous.get(game.game_id)
    if (daysUntil <= 2 || !stored) return true
    const age = now - new Date(stored.captured_at).getTime()
    return !Number.isFinite(age) || age >= 10 * 60_000
  })

  const weekKeys = Array.from(new Set(captureSchedule.map(game => `${game.season}:${game.week}`)))
  const gamePools = new Map<string, Awaited<ReturnType<typeof getNflBdlGames>>>()
  await Promise.all(weekKeys.map(async key => {
    const [season, week] = key.split(':').map(Number)
    gamePools.set(key, await getNflBdlGames(season, week))
  }))

  const results = await inBatches(captureSchedule, 3, async game => {
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
      const fetched = await getLiveNflOddsBoard(ref, gamePools.get(`${game.season}:${game.week}`))
      const board = mergeNflOddsBoards(previous.get(game.game_id)?.board ?? null, fetched)
      if (!board.bdlGameId || board.status !== 'ready') return { gameId: game.game_id, status: board.status }
      await ingestNflMarketBoard(admin, game as NflMarketScheduleGame, board)
      const payloadHash = nflOddsPayloadHash(board)
      return {
        gameId: game.game_id,
        status: board.status,
        changed: previous.get(game.game_id)?.payload_hash !== payloadHash,
        board,
        game,
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

  const capturedDates = Array.from(new Set(results.flatMap(result => result.row && result.game ? [result.game.gameday] : [])))
  let baselineCount = 0
  if (capturedDates.length) baselineCount = await refreshNflTdBaselines(admin, capturedDates)
  const { data: baselineRows, error: baselineError } = capturedDates.length
    ? await admin.from('nfl_td_baseline_daily')
      .select('slate_date,player_id,player_name,team_abbr,vendor,prop_type,average_odds,sample_games,first_sample_date,through_date')
      .in('slate_date', capturedDates)
    : { data: [], error: null }
  if (baselineError) throw new Error(`NFL TD baseline read failed: ${baselineError.message}`)
  const baselinesByDate = new Map<string, NflTdBaselineRow[]>()
  ;((baselineRows ?? []) as NflTdBaselineRow[]).forEach(row => baselinesByDate.set(row.slate_date, [...(baselinesByDate.get(row.slate_date) ?? []), row]))
  results.forEach(result => {
    if (!result.row || !result.board || !result.game) return
    const enriched = attachNflTdBaselines(result.board, baselinesByDate.get(result.game.gameday) ?? [])
    result.row.board = enriched
  })

  const rows = results.flatMap(result => result.row ? [result.row] : [])
  const changedRows = results.flatMap(result => result.row && result.changed ? [result.row] : [])
  if (rows.length) {
    await writeBatches(rows, batch => admin.from('nfl_odds_current').upsert(batch, { onConflict: 'game_id' }))
  }
  if (changedRows.length) {
    await writeBatches(changedRows, batch => admin.from('nfl_odds_snapshot_history').insert(batch))
  }

  if (rows.length || backfill?.status === 'complete') revalidateTag('sideline:nfl-odds', 'max')

  return NextResponse.json({
    captured: rows.length,
    changed: changedRows.length,
    baselines: baselineCount,
    backfill,
    games: results.map(({ gameId, status, changed }) => ({ gameId, status, changed: Boolean(changed) })),
  })
}
