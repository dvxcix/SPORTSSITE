import { normalizeNflPlayerName } from '@/lib/nflPlayerName'
import { createAdminClient } from '@/lib/supabase/admin'

export type NflPendingPick = {
  id: string
  post_id: string | null
  game_pk: string
  player_id: string
  player_name: string | null
  pick_type: string
  market_side: 'milestone' | 'over' | 'under' | null
  numeric_line: number | string | null
}

type StatRow = Record<string, unknown> & { player_id?: string; player_name?: string; player_display_name?: string }
type Play = {
  play_id: number | string
  qtr: number | null
  touchdown: boolean | null
  pass_touchdown: boolean | null
  rush_touchdown: boolean | null
  passer_player_id: string | null
  receiver_player_id: string | null
  rusher_player_id: string | null
  kickoff_returner_player_id: string | null
  punt_returner_player_id: string | null
  fumble_recovery_1_player_id: string | null
  interception_player_id: string | null
  pass_attempt?: boolean | null
  rush_attempt?: boolean | null
  complete_pass?: boolean | null
  interception?: boolean | null
  passing_yards?: number | string | null
  receiving_yards?: number | string | null
  rushing_yards?: number | string | null
}

const STAT_FIELDS: Record<string, string> = {
  receptions: 'receptions', receiving_yards: 'receiving_yards', targets: 'targets',
  rushing_yards: 'rushing_yards', rushing_attempts: 'carries', carries: 'carries',
  passing_yards: 'passing_yards', passing_tds: 'passing_tds', passing_attempts: 'attempts',
  passing_completions: 'completions', completions: 'completions', interceptions: 'interceptions',
}

function scorerId(play: Play) {
  if (!play.touchdown) return null
  if (play.pass_touchdown) return play.receiver_player_id
  if (play.rush_touchdown) return play.rusher_player_id
  return play.kickoff_returner_player_id ?? play.punt_returner_player_id ?? play.fumble_recovery_1_player_id ?? play.interception_player_id
}

function numeric(row: StatRow, field: string) {
  const value = Number(row[field] ?? 0)
  return Number.isFinite(value) ? value : 0
}

function totalTouchdowns(row: StatRow) {
  return numeric(row, 'receiving_tds') + numeric(row, 'rushing_tds') + numeric(row, 'special_teams_tds')
}

function add(row: StatRow, field: string, value = 1) {
  row[field] = numeric(row, field) + value
}

/** Builds a final player stat row from the official game play stream when the
 * season-stat import has not reached this game yet. A row is emitted only when
 * the player appears in an official play, so missing players are never graded
 * as zero by assumption. */
export function aggregateNflStatFromPlays(playerId: string, plays: Play[]): StatRow | null {
  const row: StatRow = { player_id: playerId }
  let appeared = false

  for (const play of plays) {
    if (play.passer_player_id === playerId) {
      appeared = true
      if (play.pass_attempt) add(row, 'attempts')
      if (play.complete_pass) add(row, 'completions')
      if (play.interception) add(row, 'interceptions')
      add(row, 'passing_yards', Number(play.passing_yards) || 0)
      if (play.pass_touchdown) add(row, 'passing_tds')
    }
    if (play.receiver_player_id === playerId) {
      appeared = true
      if (play.pass_attempt) add(row, 'targets')
      if (play.complete_pass) add(row, 'receptions')
      add(row, 'receiving_yards', Number(play.receiving_yards) || 0)
      if (play.touchdown && play.pass_touchdown) add(row, 'receiving_tds')
    }
    if (play.rusher_player_id === playerId) {
      appeared = true
      if (play.rush_attempt) add(row, 'carries')
      add(row, 'rushing_yards', Number(play.rushing_yards) || 0)
      if (play.touchdown && play.rush_touchdown) add(row, 'rushing_tds')
    }
    const specialTeamsScorer = play.touchdown && !play.pass_touchdown && !play.rush_touchdown
      && scorerId(play) === playerId
    if (specialTeamsScorer) {
      appeared = true
      add(row, 'special_teams_tds')
    }
  }

  return appeared ? row : null
}

function statValue(pick: NflPendingPick, row: StatRow) {
  if (pick.pick_type === 'rushing_receiving_yards') return numeric(row, 'rushing_yards') + numeric(row, 'receiving_yards')
  if (pick.pick_type === 'anytime_td' || pick.pick_type === 'total_tds') return totalTouchdowns(row)
  const field = STAT_FIELDS[pick.pick_type]
  return field ? numeric(row, field) : null
}

function thresholdResult(value: number, side: NflPendingPick['market_side'], line: number | null) {
  const threshold = line ?? 0.5
  if (value === threshold) return 'push' as const
  const won = side === 'under' ? value < threshold : value > threshold
  return won ? 'win' as const : 'loss' as const
}

export function gradeNflPick(pick: NflPendingPick, stats: StatRow[], plays: Play[]) {
  const byId = stats.find(row => row.player_id === pick.player_id)
  const wantedName = normalizeNflPlayerName(pick.player_name ?? '')
  const row = byId
    ?? stats.find(item => normalizeNflPlayerName(item.player_display_name ?? item.player_name ?? '') === wantedName)
    ?? aggregateNflStatFromPlays(pick.player_id, plays)
  if (!row) return null

  const touchdowns = plays.filter(play => play.touchdown && scorerId(play)).sort((a, b) => Number(a.play_id) - Number(b.play_id))
  const scorer = (play: Play | undefined) => play ? scorerId(play) : null
  const playerMatches = (id: string | null) => id === row.player_id || id === pick.player_id
  if (pick.pick_type === 'first_td') return playerMatches(scorer(touchdowns[0])) ? 'win' as const : 'loss' as const
  if (pick.pick_type === 'last_td') return playerMatches(scorer(touchdowns.at(-1))) ? 'win' as const : 'loss' as const
  if (pick.pick_type === 'anytime_td_1h') {
    const count = touchdowns.filter(play => (play.qtr ?? 9) <= 2 && playerMatches(scorer(play))).length
    return thresholdResult(count, pick.market_side, Number(pick.numeric_line ?? 0.5))
  }
  const quarter = pick.pick_type.match(/(?:anytime_)?td_q([1-4])$/)?.[1]
  if (quarter) {
    const count = touchdowns.filter(play => play.qtr === Number(quarter) && playerMatches(scorer(play))).length
    return thresholdResult(count, pick.market_side, Number(pick.numeric_line ?? 0.5))
  }
  const value = statValue(pick, row)
  if (value == null) return null
  const line = pick.numeric_line == null ? null : Number(pick.numeric_line)
  return thresholdResult(value, pick.market_side, Number.isFinite(line) ? line : null)
}

export async function applyNflPickResult(admin: ReturnType<typeof createAdminClient>, pick: NflPendingPick, result: 'win' | 'loss' | 'push') {
  const now = new Date().toISOString()
  const { error } = await admin.from('picks').update({ result, graded_at: now }).eq('id', pick.id)
  if (error) return null
  if (!pick.post_id) return { playerName: pick.player_name, overallResult: null }
  const { data } = await admin.rpc('apply_sport_leg_result_to_post', {
    p_post_id: pick.post_id,
    p_player_key: pick.player_id,
    p_pick_type: pick.pick_type,
    p_result: result,
  })
  const row = data?.[0]
  return { playerName: row?.leg_player_name ?? pick.player_name, overallResult: row?.overall_result ?? null }
}
