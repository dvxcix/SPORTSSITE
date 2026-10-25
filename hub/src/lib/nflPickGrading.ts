import { normalizeNflPlayerName } from '@/lib/nflPlayerName'
import { attachNflPeriodResults } from './nflPeriodResults'
import { memberPickContract } from './memberPickContract'
import type { createAdminClient } from '@/lib/supabase/admin'

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
  raw?: Record<string, unknown> | null
  play_type?: string | null
  play_deleted?: boolean | null
  two_point_attempt?: boolean | null
}
const validPlay = (play: Play) => !play.play_deleted && !play.two_point_attempt && play.play_type !== 'no_play'

const STAT_FIELDS: Record<string, string> = {
  receptions: 'receptions', receiving_yards: 'receiving_yards', targets: 'targets',
  rushing_yards: 'rushing_yards', rushing_attempts: 'carries', carries: 'carries',
  passing_yards: 'passing_yards', passing_tds: 'passing_tds', passing_attempts: 'attempts',
  passing_completions: 'completions', completions: 'completions', interceptions: 'interceptions',
}

export function supportsNflPick(pick: Pick<NflPendingPick, 'pick_type' | 'market_side' | 'numeric_line'>) {
  const type = pick.pick_type
  if (!['milestone', 'over', 'under'].includes(pick.market_side ?? 'milestone')) return false
  if (type === 'first_td' || type === 'last_td') return (pick.market_side == null || pick.market_side === 'milestone') && (pick.numeric_line == null || [0.5, 1].includes(Number(pick.numeric_line)))
  const scorer = ['first_td', 'last_td', 'anytime_td', 'total_tds', 'anytime_td_1h'].includes(type) || /^(?:anytime_)?td_q[1-4]$/.test(type)
  const supported = scorer || Object.hasOwn(STAT_FIELDS, type) || type === 'rushing_receiving_yards'
    || /^(?:passing|receiving|rushing)_yards_(?:[1-4]q|1h)$/.test(type)
  if (!supported) return false
  if (pick.numeric_line == null) return scorer
  return pick.numeric_line !== '' && Number.isFinite(Number(pick.numeric_line)) && Number(pick.numeric_line) >= 0
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
    if (!validPlay(play)) continue
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
  const known = (field: string) => row[field] != null && row[field] !== '' && Number.isFinite(Number(row[field]))
  if (pick.pick_type === 'rushing_receiving_yards') return known('rushing_yards') && known('receiving_yards') ? numeric(row, 'rushing_yards') + numeric(row, 'receiving_yards') : null
  if (pick.pick_type === 'anytime_td' || pick.pick_type === 'total_tds') return ['receiving_tds', 'rushing_tds', 'special_teams_tds'].every(known) ? totalTouchdowns(row) : null
  const field = STAT_FIELDS[pick.pick_type]
  return field && known(field) ? numeric(row, field) : null
}

function thresholdResult(value: number, side: NflPendingPick['market_side'], line: number | null) {
  const threshold = line ?? 0.5
  if ((side ?? 'milestone') === 'milestone') return value >= threshold ? 'win' as const : 'loss' as const
  if (value === threshold) return 'push' as const
  const won = side === 'under' ? value < threshold : value > threshold
  return won ? 'win' as const : 'loss' as const
}

export function gradeNflPick(pick: NflPendingPick, stats: StatRow[], plays: Play[]) {
  if (!supportsNflPick(pick)) return null
  const byId = stats.find(row => row.player_id === pick.player_id)
  const wantedName = normalizeNflPlayerName(pick.player_name ?? '')
  const names = wantedName ? stats.filter(item => normalizeNflPlayerName(item.player_display_name ?? item.player_name ?? '') === wantedName) : []
  const row = byId ?? (names.length === 1 ? names[0] : undefined)
  if (!row) return null

  const period = pick.pick_type.match(/^(passing|receiving|rushing)_yards_([1-4]q|1h)$/)
  if (period) {
    // Reuse the public-results reconciler: it excludes deleted/no-play/two-point
    // events and requires the complete game's yards to match its official box
    // score before exposing any split. Missing or truncated facts stay pending.
    if (!byId || !plays.some(play => play.qtr === 4) || new Set(plays.map(play => play.play_id)).size !== plays.length) return null
    const key = `${period[1]}_yards`
    const expected = row[key]
    if (expected == null || expected === '' || !Number.isFinite(Number(expected))) return null
    const player = { id: null, gsisId: pick.player_id, name: '', team: '', stats: { [key]: Number(expected) } as Record<string, number | null> }
    attachNflPeriodResults([player], plays, true)
    const value = player.stats[pick.pick_type]
    return value == null ? null : thresholdResult(value, pick.market_side, Number(pick.numeric_line))
  }

  const touchdowns = plays.filter(play => validPlay(play) && play.touchdown && scorerId(play)).sort((a, b) => Number(a.play_id) - Number(b.play_id))
  const scorer = (play: Play | undefined) => play ? scorerId(play) : null
  const playerMatches = (id: string | null) => id === row.player_id || id === pick.player_id
  const scoringMarket = ['first_td', 'last_td', 'anytime_td_1h'].includes(pick.pick_type) || /^(?:anytime_)?td_q[1-4]$/.test(pick.pick_type)
  if (scoringMarket) {
    const fields = ['receiving_tds', 'rushing_tds', 'special_teams_tds']
    // A partial play stream may have no score for a player. Reconcile the game
    // against every official scorer's non-passing TD total before using order
    // or periods. Matching just the game total can hide separately synced rows.
    if (!plays.some(play => play.qtr === 4) || plays.length >= 1000 || new Set(plays.map(play => play.play_id)).size !== plays.length
      || stats.some(stat => !stat.player_id || fields.some(field => stat[field] == null || stat[field] === '' || !Number.isInteger(Number(stat[field])) || Number(stat[field]) < 0))
      || new Set(stats.map(stat => stat.player_id)).size !== stats.length) return null
    const official = new Map(stats.map(stat => [stat.player_id!, totalTouchdowns(stat)]))
    const observed = new Map<string, number>()
    for (const play of touchdowns) {
      const id = scorerId(play)!
      if (!official.has(id)) return null
      observed.set(id, (observed.get(id) ?? 0) + 1)
    }
    if ([...official].some(([id, total]) => total !== (observed.get(id) ?? 0))) return null
  }
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

export async function applyNflPickResult(admin: ReturnType<typeof createAdminClient>, pick: NflPendingPick, result: 'win' | 'loss' | 'push', timeoutMs = 5_000) {
  const { data, error } = await admin.rpc('settle_member_pick_exact', { p_pick_id: pick.id, p_result: result, p_expected: memberPickContract(pick, 'NFL') }).abortSignal(AbortSignal.timeout(timeoutMs))
  if (error) throw new Error('Atomic settlement failed')
  const row = data?.[0]
  if (!row?.applied) return null
  return { playerName: row?.leg_player_name ?? pick.player_name, overallResult: row?.overall_result ?? null }
}
