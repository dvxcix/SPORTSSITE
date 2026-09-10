import { createClient } from '@supabase/supabase-js'
import { nflKickoffAt } from '../src/app/the-sideline/kickoff'
import {
  computeNflDvp,
  computeNflDvpFromPbp,
  syncNflNgsPassing,
  syncNflNgsReceiving,
  syncNflNgsRushing,
  syncNflPbp,
  syncNflPlayerStats,
} from '../src/lib/nflverseSync'

const apply = process.argv.includes('--delete-invalid')
const syncFeeds = process.argv.includes('--sync-feeds')
const syncDvp = process.argv.includes('--sync-dvp')
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) throw new Error('Supabase server credentials are required')

const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
const season = Number(process.env.SIDELINE_REPAIR_SEASON ?? new Date().getUTCFullYear())
const captureTables = [
  'nfl_odds_snapshot_history',
  'nfl_pikkit_picks_snapshot_history',
  'nfl_fanduel_capture_history',
] as const

const syncResult: Record<string, unknown> = {}
if (syncFeeds) {
  syncResult.playerStats = await syncNflPlayerStats(admin)
  const [passing, receiving, rushing] = await Promise.all([
    syncNflNgsPassing(admin),
    syncNflNgsReceiving(admin),
    syncNflNgsRushing(admin),
  ])
  syncResult.ngs = { passing, receiving, rushing }
  syncResult.pbp = await syncNflPbp(admin, season)
}
if (syncFeeds || syncDvp) {
  syncResult.dvpFromPbp = await computeNflDvpFromPbp(admin, season)
  syncResult.dvp = await computeNflDvp(admin, season)
}

function chunks<T>(rows: T[], size: number) {
  return Array.from({ length: Math.ceil(rows.length / size) }, (_, index) => rows.slice(index * size, (index + 1) * size))
}

const { data: schedule, error: scheduleError } = await admin
  .from('nfl_schedule')
  .select('game_id,gameday,gametime')
  .eq('season', season)
if (scheduleError) throw scheduleError

const kickoffByGame = new Map((schedule ?? []).flatMap(game => {
  const kickoff = nflKickoffAt(game)
  return kickoff ? [[game.game_id, kickoff.toISOString()] as const] : []
}))

const feedCounts: Record<string, number | null> = {}
for (const table of ['nfl_pbp', 'nfl_ngs_passing', 'nfl_ngs_receiving', 'nfl_ngs_rushing', 'nfl_player_stats', 'nfl_dvp']) {
  const { count, error } = await admin.from(table).select('*', { count: 'exact', head: true }).eq('season', season)
  if (error) throw error
  feedCounts[table] = count
}

const invalidByTable: Record<string, Array<{ gameId: string; kickoff: string; rows: number }>> = {}
for (const table of captureTables) {
  const invalid: Array<{ gameId: string; kickoff: string; rows: number }> = []
  for (const gameIds of chunks([...kickoffByGame.keys()], 25)) {
    const { data, error } = await admin.from(table).select('game_id,captured_at').in('game_id', gameIds).order('captured_at')
    if (error) throw error
    const grouped = new Map<string, number>()
    for (const row of data ?? []) {
      const kickoff = kickoffByGame.get(row.game_id)
      if (kickoff && Date.parse(row.captured_at) > Date.parse(kickoff)) grouped.set(row.game_id, (grouped.get(row.game_id) ?? 0) + 1)
    }
    for (const [gameId, rows] of grouped) invalid.push({ gameId, kickoff: kickoffByGame.get(gameId)!, rows })
  }
  invalidByTable[table] = invalid
}

if (apply) {
  for (const table of captureTables) {
    for (const item of invalidByTable[table]) {
      const { error } = await admin.from(table).delete().eq('game_id', item.gameId).gt('captured_at', item.kickoff)
      if (error) throw error
    }
  }
}

console.log(JSON.stringify({
  season,
  applied: apply,
  scheduledGames: kickoffByGame.size,
  feedCounts,
  syncResult,
  postKickoffCaptures: Object.fromEntries(Object.entries(invalidByTable).map(([table, rows]) => [table, {
    games: rows.length,
    rows: rows.reduce((sum, item) => sum + item.rows, 0),
  }])),
}, null, 2))
