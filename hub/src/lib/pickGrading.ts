import type { createAdminClient } from './supabase/admin'
import { memberPickContract } from './memberPickContract'
type Admin = ReturnType<typeof createAdminClient>
type BattingLine = Record<string, unknown>
export type MlbPlay = { atBatIndex?: number; matchup?: { batter?: { id?: number } }; about?: { isComplete?: boolean }; pitchIndex?: number[]; result?: { eventType?: string; description?: string }; playEvents?: { hitData?: { launchSpeed?: number; totalDistance?: number } }[] }
export type MlbLiveFeed = { gamePk?: number; gameData?: { status?: { abstractGameState?: string } }; liveData?: { boxscore?: { teams?: Record<string, { teamStats?: { batting?: BattingLine }; players?: Record<string, { stats?: { batting?: BattingLine; pitching?: { gamesStarted?: number; strikeOuts?: number } } }> }> }; plays?: { allPlays?: MlbPlay[] }; linescore?: { teams?: Record<string, { runs?: number }> } } }

// Shared between the daily final-settlement cron (settle-picks) and the
// live in-progress-game cron (grade-live-picks) — both need the exact same
// stat-threshold logic so a leg can never grade differently depending on
// which pass touched it first.

// Batting-stat threshold per pick_type (matches PROP_META's pickType values
// in hub/src/lib/watchlist.ts). "first_hr" is handled separately since it
// needs play-by-play order, not just the box score line.
export const THRESHOLDS: Record<string, (b: BattingLine) => boolean> = {
  anytime_hr:    (b) => Number(b.homeRuns ?? 0) >= 1,
  hr_2plus:      (b) => Number(b.homeRuns ?? 0) >= 2,
  hits:          (b) => Number(b.hits ?? 0) >= 1,
  hits_2plus:    (b) => Number(b.hits ?? 0) >= 2,
  single:        (b) => (Number(b.hits ?? 0) - Number(b.doubles ?? 0) - Number(b.triples ?? 0) - Number(b.homeRuns ?? 0)) >= 1,
  double:        (b) => Number(b.doubles ?? 0) >= 1,
  triple:        (b) => Number(b.triples ?? 0) >= 1,
  rbi:           (b) => Number(b.rbi ?? 0) >= 1,
  rbi_2plus:     (b) => Number(b.rbi ?? 0) >= 2,
  rbi_3plus:     (b) => Number(b.rbi ?? 0) >= 3,
  total_bases:   (b) => Number(b.totalBases ?? 0) >= 2,
  total_bases_3plus: (b) => Number(b.totalBases ?? 0) >= 3,
  total_bases_4plus: (b) => Number(b.totalBases ?? 0) >= 4,
  total_bases_5plus: (b) => Number(b.totalBases ?? 0) >= 5,
  run_scored:    (b) => Number(b.runs ?? 0) >= 1,
  run_scored_2plus: (b) => Number(b.runs ?? 0) >= 2,
  stolen_base:   (b) => Number(b.stolenBases ?? 0) >= 1,
  stolen_base_2plus: (b) => Number(b.stolenBases ?? 0) >= 2,
  batter_strikeout: (b) => Number(b.strikeOuts ?? 0) >= 1,
  hits_runs_rbis: (b) => (Number(b.hits ?? 0) + Number(b.runs ?? 0) + Number(b.rbi ?? 0)) >= 1,
  hits_runs_rbis_3plus: (b) => (Number(b.hits ?? 0) + Number(b.runs ?? 0) + Number(b.rbi ?? 0)) >= 3,
}

export async function fetchLiveFeed(gamePk: string, timeoutMs = 15_000) {
  if (!/^\d+$/.test(gamePk) || timeoutMs <= 0) return null
  const res = await fetch(`https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`, { cache: 'no-store', signal: AbortSignal.timeout(Math.min(15_000, timeoutMs)) })
  if (!res.ok) return null
  const feed = await res.json()
  return String(feed?.gamePk) === gamePk ? feed : null
}

// The first HR of the game, by earliest at-bat index across both teams.
// Works fine against an in-progress feed too — it just reflects however
// many home runs have happened so far.
export function findFirstHrBatterId(liveFeed: MlbLiveFeed): number | null {
  const plays: MlbPlay[] = liveFeed?.liveData?.plays?.allPlays ?? []
  const hrPlays = plays
    .filter(p => p.result?.eventType === 'home_run' && p.about?.isComplete === true)
    .sort((a, b) => (a.atBatIndex ?? 0) - Number(b.atBatIndex ?? 0))
  return hrPlays[0]?.matchup?.batter?.id ?? null
}

export function findBattingLine(liveFeed: MlbLiveFeed, mlbId: number): BattingLine | null {
  const teams = liveFeed?.liveData?.boxscore?.teams
  if (!teams) return null
  for (const side of ['home', 'away']) {
    const p = teams[side]?.players?.[`ID${mlbId}`]
    if (p) return p.stats?.batting ?? null
  }
  return null // player not in either team's box score = did not play
}

export type MlbContract = { pick_type: string; numeric_line?: number | string | null; market_side?: string | null; line?: string | null }
export type PendingPick = MlbContract & { id: string; post_id: string | null; mlb_id: number; game_pk?: string }

export function canonicalMlbPickType(type: string) { return type === 'pa1' ? 'first_pa_hr' : type }

const REQUIRED_STATS: Record<string, string[]> = {
  anytime_hr: ['homeRuns'], hr_2plus: ['homeRuns'], hits: ['hits'], hits_2plus: ['hits'],
  single: ['hits', 'doubles', 'triples', 'homeRuns'], double: ['doubles'], triple: ['triples'],
  rbi: ['rbi'], rbi_2plus: ['rbi'], rbi_3plus: ['rbi'], total_bases: ['totalBases'],
  total_bases_3plus: ['totalBases'], total_bases_4plus: ['totalBases'], total_bases_5plus: ['totalBases'],
  run_scored: ['runs'], run_scored_2plus: ['runs'], stolen_base: ['stolenBases'], stolen_base_2plus: ['stolenBases'],
  batter_strikeout: ['strikeOuts'], hits_runs_rbis: ['hits', 'runs', 'rbi'], hits_runs_rbis_3plus: ['hits', 'runs', 'rbi'],
}
const FIXED_LINES: Record<string, number> = {
  anytime_hr: 1, hr_2plus: 2, hits: 1, hits_2plus: 2, single: 1, double: 1, triple: 1,
  rbi: 1, rbi_2plus: 2, rbi_3plus: 3, total_bases: 2, total_bases_3plus: 3, total_bases_4plus: 4, total_bases_5plus: 5,
  run_scored: 1, run_scored_2plus: 2, stolen_base: 1, stolen_base_2plus: 2, batter_strikeout: 1,
  hits_runs_rbis: 1, hits_runs_rbis_3plus: 3, laser_105: 105, laser_110: 110,
  first_hr: 1, first_pa_hr: 1, hr_moneyline_parlay: 1,
}
function count(value: unknown): value is number { return typeof value === 'number' && Number.isInteger(value) && value >= 0 }
function exactLine(pick: MlbContract) {
  if (pick.numeric_line == null || pick.numeric_line === '') return null
  const value = Number(pick.numeric_line)
  return Number.isFinite(value) && value >= 0 ? value : null
}
export function supportsMlbPick(pick: MlbContract): boolean {
  const type = canonicalMlbPickType(pick.pick_type)
  if (type === 'pitcher_strikeouts') return exactLine(pick) != null && ['over', 'under', 'milestone'].includes(pick.market_side ?? '')
  if (pick.market_side && pick.market_side !== 'milestone') return false
  if (type === 'moonshot') return exactLine(pick) != null && exactLine(pick)! > 0
  if (pick.numeric_line != null && (!Object.hasOwn(FIXED_LINES, type) || exactLine(pick) !== FIXED_LINES[type])) return false
  return Object.hasOwn(THRESHOLDS, type) || ['first_hr', 'first_pa_hr', 'laser_105', 'laser_110', 'hr_moneyline_parlay'].includes(type)
}

export type MlbGrade = { result: 'win' | 'loss' | 'push' | null; reason: 'graded' | 'not-final' | 'unsupported-contract' | 'missing-contract' | 'missing-player' | 'missing-stats' | 'missing-plays' | 'missing-statcast' }
const decision = (result: MlbGrade['result'], reason: MlbGrade['reason'] = 'graded'): MlbGrade => ({ result, reason })

/** Pure, read-only decision. Missing facts never become zero or a DNP. */
export function gradeMlbPick(pick: MlbContract & { mlb_id: number; game_pk?: string }, feed: MlbLiveFeed, final = true): MlbGrade {
  if (final && feed?.gameData?.status?.abstractGameState !== 'Final') return decision(null, 'not-final')
  if (pick.game_pk && String(feed?.gamePk) !== String(pick.game_pk)) return decision(null, 'missing-stats')
  const type = canonicalMlbPickType(pick.pick_type)
  // Legacy Moonshot contracts with no distance can still have a mathematically
  // certain loss when the official player line records no home runs.
  const legacyMoonshot = type === 'moonshot' && !pick.market_side && exactLine(pick) == null
  if (!supportsMlbPick(pick) && !legacyMoonshot) return decision(null, type === 'moonshot' ? 'missing-contract' : 'unsupported-contract')
  const teams = feed?.liveData?.boxscore?.teams
  const side = ['home', 'away'].find(key => teams?.[key]?.players?.[`ID${pick.mlb_id}`])
  const player = side ? teams?.[side]?.players?.[`ID${pick.mlb_id}`] : null
  if (!player) return decision(null, 'missing-player')
  if (type === 'pitcher_strikeouts') {
    const pitching = player.stats?.pitching
    if (!pitching || !count(pitching.gamesStarted)) return decision(null, 'missing-stats')
    if (pitching.gamesStarted === 0) return decision(final ? 'push' : null)
    if (!count(pitching.strikeOuts)) return decision(null, 'missing-stats')
    const line = exactLine(pick)!
    if (!final && (pick.market_side === 'under' || pitching.strikeOuts <= line)) return decision(null)
    if (pick.market_side === 'milestone') return decision(pitching.strikeOuts >= line ? 'win' : final ? 'loss' : null)
    return decision(pitching.strikeOuts === line ? 'push' : (pick.market_side === 'under' ? pitching.strikeOuts < line : pitching.strikeOuts > line) ? 'win' : 'loss')
  }
  const batting = player.stats?.batting
  if (!batting || !count(batting.plateAppearances)) return decision(null, 'missing-stats')
  if (batting.plateAppearances === 0) return decision(final ? 'push' : null)
  const required = REQUIRED_STATS[type]
  if (required) {
    if (!required.every(key => count(batting[key]))) return decision(null, 'missing-stats')
    return decision(THRESHOLDS[type](batting) ? 'win' : final ? 'loss' : null)
  }
  const plays: MlbPlay[] | undefined = feed?.liveData?.plays?.allPlays
  const own = Array.isArray(plays) ? plays.filter(p => p.matchup?.batter?.id === pick.mlb_id && p.about?.isComplete === true).sort((a, b) => (a.atBatIndex ?? Infinity) - (b.atBatIndex ?? Infinity)) : []
  if (type === 'first_pa_hr') {
    if (!own.length || own.some(p => !Number.isInteger(p.atBatIndex) || !p.result?.eventType) || new Set(own.map(p => p.atBatIndex)).size !== own.length || own.length !== batting.plateAppearances) return decision(null, 'missing-plays')
    const first = own[0]
    if (!Array.isArray(first.pitchIndex)) return decision(null, 'missing-plays')
    if (!first.pitchIndex.length && first.result?.eventType === 'intent_walk') return decision(final ? 'push' : null)
    if (!first.pitchIndex.length) return decision(null, 'missing-plays')
    return decision(first.result?.eventType === 'home_run' ? 'win' : final ? 'loss' : null)
  }
  if (!count(batting.homeRuns)) return decision(null, 'missing-stats')
  if (type === 'first_hr') {
    if (batting.homeRuns === 0) return decision(final ? 'loss' : null)
    if (!Array.isArray(plays) || !plays.length) return decision(null, 'missing-plays')
    const hrs = plays.filter(p => p.result?.eventType === 'home_run' && p.about?.isComplete === true)
    if (hrs.some(p => !Number.isInteger(p.atBatIndex) || !p.matchup?.batter?.id)) return decision(null, 'missing-plays')
    const homeRuns = teams?.home?.teamStats?.batting?.homeRuns, awayRuns = teams?.away?.teamStats?.batting?.homeRuns
    if (!count(homeRuns) || !count(awayRuns) || hrs.length !== homeRuns + awayRuns || new Set(hrs.map(p => p.atBatIndex)).size !== hrs.length) return decision(null, 'missing-plays')
    return decision(findFirstHrBatterId(feed) === pick.mlb_id ? 'win' : final ? 'loss' : null)
  }
  if (type === 'hr_moneyline_parlay') {
    if (!final) return decision(null)
    const home = feed?.liveData?.linescore?.teams?.home?.runs, away = feed?.liveData?.linescore?.teams?.away?.runs
    if (!count(home) || !count(away) || home === away) return decision(null, 'missing-stats')
    return decision(batting.homeRuns > 0 && (side === 'home' ? home > away : away > home) ? 'win' : 'loss')
  }
  if (batting.homeRuns === 0) return decision(final ? 'loss' : null)
  if (legacyMoonshot) return decision(null, 'missing-contract')
  const hrs = own.filter(p => p.result?.eventType === 'home_run')
  if (hrs.length !== batting.homeRuns) return decision(null, 'missing-plays')
  const field = type === 'moonshot' ? 'totalDistance' : 'launchSpeed'
  const threshold = type === 'moonshot' ? exactLine(pick)! : type === 'laser_105' ? 105 : 110
  let unknown = false
  for (const hr of hrs) {
    if (/inside[ -]the[ -]park/i.test(hr.result?.description ?? '')) continue
    if (!/homers|home run/i.test(hr.result?.description ?? '')) { unknown = true; continue }
    const hits = (hr.playEvents ?? []).filter((event) => event.hitData)
    const value = hits.at(-1)?.hitData?.[field]
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) { unknown = true; continue }
    if (value >= threshold) return decision('win')
  }
  return unknown ? decision(null, 'missing-statcast') : decision(final ? 'loss' : null)
}

export type SettleOutcome = {
  result: 'win' | 'loss' | 'push'
  postId: string | null
  legPlayerName: string | null
  legHeadshotUrl: string | null
  // Set only when this leg completed the LAST pending leg on its post,
  // i.e. the overall pick/parlay just became final — useful for firing a
  // one-time "your pick settled" notification instead of one per leg.
  overallResult: 'win' | 'loss' | 'push' | null
}

// Full final-game settlement for one pick: determines win/loss/push against
// the Final box score (a DNP push, first_hr play-by-play order, or a batting-
// stat threshold) and writes it to both `picks` and the post's `pick_data`
// (single pick, or the matching leg + parlay rollup). Shared by settle-picks
// (daily, the backstop) and grade-live-picks (every ~2min, the primary path
// now that it also settles Final games instead of only early live wins) so
// a game can never grade differently depending on which cron reached it
// first. Returns null when the pick_type isn't supported — left pending
// rather than guessed, same as before.
export async function settleFinalPick(admin: Admin, pick: PendingPick, feed: MlbLiveFeed, propMeta: Record<string, { pickType: string }>): Promise<SettleOutcome | null> {
  const { result } = gradeMlbPick(pick, feed)
  if (!result) return null
  return applyMlbPickResult(admin, pick, result, propMeta)
}

export async function applyMlbPickResult(admin: Admin, pick: PendingPick, result: 'win' | 'loss' | 'push', propMeta: Record<string, { pickType: string }>, timeoutMs = 5_000): Promise<SettleOutcome | null> {
  const { data, error } = await admin.rpc('settle_member_pick_exact', {
    p_pick_id: pick.id, p_result: result,
    p_expected: memberPickContract(pick, 'MLB'),
    p_prop_type_map: Object.fromEntries(Object.entries(propMeta).map(([key, meta]) => [key, meta.pickType])),
  }).abortSignal(AbortSignal.timeout(timeoutMs))
  if (error) throw new Error('Atomic settlement failed')
  const row = data?.[0]
  if (!row?.applied) return null
  return { result, postId: pick.post_id, legPlayerName: row.leg_player_name ?? null, legHeadshotUrl: row.leg_headshot_url ?? null, overallResult: row.overall_result ?? null }
}

// posts.pick_data is one JSON blob shared across every leg. This used to be
// a JS-side read-modify-write guarded by a compare-and-swap (.eq('pick_data',
// before)), meant to stop two legs of the same parlay racing each other —
// but two parlays graded correctly in `picks` (graded_at timestamps 10-45+
// minutes apart, nowhere near a race window) still had pick_data frozen
// exactly as originally created, for every leg, across every attempt.
// Whatever the exact failure mode (a JSONB round-trip mismatch through
// PostgREST's .eq() filter is the leading suspect), a single atomic
// `SELECT ... FOR UPDATE` + `UPDATE` inside one Postgres function can't
// have this class of bug — there's no external round-trip to compare
// against, just a row lock. See migration apply_leg_result_to_post_atomic_rpc.
export async function applyLegResultToPost(
  admin: Admin, postId: string, mlbId: number, pickType: string, result: 'win' | 'loss' | 'push',
  propMeta: Record<string, { pickType: string }>,
): Promise<{ legPlayerName: string | null; legHeadshotUrl: string | null; overallResult: 'win' | 'loss' | 'push' | null }> {
  const propTypeMap: Record<string, string> = {}
  for (const [key, meta] of Object.entries(propMeta)) propTypeMap[key] = meta.pickType

  const { data, error } = await admin.rpc('apply_leg_result_to_post', {
    p_post_id: postId,
    p_mlb_id: mlbId,
    p_pick_type: pickType,
    p_result: result,
    p_prop_type_map: propTypeMap,
  })
  const row = data?.[0]
  if (error || !row) return { legPlayerName: null, legHeadshotUrl: null, overallResult: null }
  return {
    legPlayerName: row.leg_player_name ?? null,
    legHeadshotUrl: row.leg_headshot_url ?? null,
    overallResult: row.overall_result ?? null,
  }
}

// Checks whether a pick has ALREADY clinched a win against the current feed
// state — safe to call against a still-in-progress game, since a stat that
// has already happened can't be undone. Returns null when the threshold
// hasn't been reached yet (still could go either way) or the pick_type
// isn't supported — callers should leave the pick pending in that case,
// NOT treat null as a loss (that determination requires the game to be
// Final, which is what settle-picks alone still handles).
export function checkEarlyWin(pickType: string, mlbId: number, liveFeed: MlbLiveFeed): boolean | null {
  return gradeMlbPick({ pick_type: pickType, mlb_id: mlbId }, liveFeed, false).result === 'win' ? true : null
}
