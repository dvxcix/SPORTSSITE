import { computeStatLine, lastNGameDates, type PitchLogRow, type BatterStats } from '@/lib/batterStatsEngine'

// The evaluation core for Custom Matrix — given a member's saved Matrix
// (Elements/Factors) and one batter's real data for today's game, decides
// whether that batter lights up. Three real data sources, each handled on
// its own terms rather than forced through one interface:
//
//   odds            — reads the SAME per-player `props`/`open` object
//                      dugout/data/route.ts already builds (no extra query).
//   pitchlog_stat   — computed from OUR OWN player_pitch_log via
//                      computeStatLine(), with a REAL "last N games played"
//                      window (not a calendar-day approximation) and the
//                      correct opposing-pitcher-hand filter.
//   savant_stat     — the handful of metrics only Savant's own bat-tracking
//                      model produces (Hard-Swing%, Squared-Up%, Blast%,
//                      Ideal-Attack-Angle%) — read from our
//                      player_statcast_splits sync, weighted-aggregated
//                      across that table's pitch-type/contact-type splits.

export type MatrixOperator = 'gte' | 'lte' | 'eq' | 'up' | 'down' | 'flat'
export type MatrixRecency = 'game' | 'l3' | 'l5' | 'l10' | 'season' | 'custom'

export type MatrixFactor = {
  id: string
  category: 'odds' | 'pitchlog_stat' | 'savant_stat' | 'picks'
  field_key: string
  operator: MatrixOperator
  value: number | null
  recency: MatrixRecency | null
  recency_start: string | null
  recency_end: string | null
}

export type Matrix = {
  id: string
  name: string
  color: string
  priority: number
  match_mode: 'all' | 'any'
  match_any_count: number | null
  factors: MatrixFactor[]
}

// A switch hitter always bats opposite the pitcher's throwing hand — same
// logic already proven live in DugoutClient.tsx's buildBatterRow. Getting
// this wrong for a switch hitter silently pulls the WRONG side of their
// split (e.g. their weaker side vs a hand they never actually face), which
// is exactly the kind of handedness error that must not happen here.
export function effectiveBatSide(bats: string | null | undefined, pitcherHand: 'L' | 'R'): 'L' | 'R' {
  if (bats === 'S') return pitcherHand === 'L' ? 'R' : 'L'
  return (bats === 'L' ? 'L' : 'R')
}

const RECENCY_GAME_COUNT: Record<Exclude<MatrixRecency, 'season' | 'custom'>, number> = {
  game: 1, l3: 3, l5: 5, l10: 10,
}

// Slices a batter's full-season pitch log down to the exact window a Factor
// asked for — real games played (via lastNGameDates), not a calendar-day
// guess, and always first restricted to plate appearances against a
// pitcher of the matchup's actual hand (switch hitters already resolved by
// the caller via effectiveBatSide before this runs).
export function sliceRecencyWindow(
  allRows: PitchLogRow[],
  pitcherHand: 'L' | 'R',
  recency: MatrixRecency | null,
  recencyStart: string | null,
  recencyEnd: string | null,
  asOfDate: string,
): PitchLogRow[] {
  const vsHand = allRows.filter(r => r.p_throws === pitcherHand && r.game_date <= asOfDate)
  if (recency === 'custom') {
    if (!recencyStart || !recencyEnd) return vsHand // no real range given — season is the safe fallback, not an empty window
    return vsHand.filter(r => r.game_date >= recencyStart && r.game_date <= recencyEnd)
  }
  if (recency === 'season' || recency == null) return vsHand
  const dates = lastNGameDates(vsHand, RECENCY_GAME_COUNT[recency])
  return vsHand.filter(r => dates.has(r.game_date))
}

// Fields sourced straight from computeStatLine()'s real return shape — kept
// as a lookup rather than a switch so a mistyped field_key fails loudly
// (undefined) instead of silently matching nothing.
const PITCHLOG_FIELD: Record<string, keyof BatterStats> = {
  pa: 'pa', h: 'hits', '1b': 'singles', '2b': 'doubles', '3b': 'triples', hr: 'hr',
  bb: 'bb', k: 'k', avg: 'avg', obp: 'obp', slg: 'slg',
  whiff: 'whiffPct', chase: 'chasePct', avgev: 'avgEv', la: 'avgLa',
  hh: 'hardHitPct', brl: 'barrelPct', xwoba: 'xwobaContact',
  bspd: 'avgBatSpeed', atk: 'avgAttackAngle', swlen: 'avgSwingLength', tilt: 'avgTilt', attackdir: 'avgAttackDirection',
}

function compareThreshold(current: number | null, operator: MatrixOperator, value: number | null): boolean {
  if (current == null || value == null) return false
  if (operator === 'gte') return current >= value
  if (operator === 'lte') return current <= value
  if (operator === 'eq') return current === value
  return false
}

export function evaluatePitchlogFactor(
  factor: MatrixFactor,
  allRows: PitchLogRow[],
  pitcherHand: 'L' | 'R',
  asOfDate: string,
): boolean {
  const statKey = PITCHLOG_FIELD[factor.field_key]
  if (!statKey) return false
  const window = sliceRecencyWindow(allRows, pitcherHand, factor.recency, factor.recency_start, factor.recency_end, asOfDate)
  const line = computeStatLine(window)
  const current = line[statKey] as number | null
  return compareThreshold(current, factor.operator, factor.value)
}

// player_statcast_splits weight (sample-size) field per category — a plain
// unweighted average across pitch-type/contact-type splits would let a
// 1-swing outlier split count the same as a 40-swing one; confirmed live
// against real synced rows for all four categories rather than assumed.
const SAVANT_WEIGHT_FIELD: Record<string, string> = {
  bat_tracking: 'swings_competitive',
  swing_path_attack_angle: 'competitive_swings',
  swing_timing_miss_distance: 'n_swings',
  batted_ball_splits: 'bbe',
}

// Only the metrics Savant's own bat-tracking model produces that aren't
// present in our raw pitch-by-pitch data at all — everything else moved to
// pitchlog_stat above once real per-pitch fields were confirmed to cover it.
const SAVANT_FIELD: Record<string, { category: string; metric: string }> = {
  hardsw: { category: 'bat_tracking', metric: 'hard_swing_rate' },
  sq: { category: 'bat_tracking', metric: 'squared_up_per_swing' },
  blast: { category: 'bat_tracking', metric: 'blast_per_swing' },
  idlaa: { category: 'swing_path_attack_angle', metric: 'ideal_attack_angle_rate' },
  pullair: { category: 'batted_ball_splits', metric: 'pull_air_rate' },
  fb: { category: 'batted_ball_splits', metric: 'fb_rate' },
}

export type SavantSplitRow = { dims: Record<string, string | number>; metrics: Record<string, number | string | null> }

// player_statcast_splits' `recency` window type only has the site-wide
// fixed 6-day lookback (still used elsewhere, left untouched) — the l1/l3/
// l5/l10 windows added for this feature are calendar-day approximations of
// "games played" (Savant's leaderboard endpoints have no per-player
// game-count parameter), the one honest gap left after moving everything
// else to exact game-count windows above.
export function evaluateSavantFactor(
  factor: MatrixFactor,
  splitRows: SavantSplitRow[],
  batSide: 'L' | 'R',
  pitcherHand: 'L' | 'R',
): boolean {
  const field = SAVANT_FIELD[factor.field_key]
  if (!field) return false
  const weightKey = SAVANT_WEIGHT_FIELD[field.category]
  const matching = splitRows.filter(r => r.dims.bat_side === batSide && r.dims.pitch_hand === pitcherHand)
  let weightedSum = 0
  let totalWeight = 0
  for (const row of matching) {
    const metricVal = row.metrics[field.metric]
    const weightVal = row.metrics[weightKey]
    if (typeof metricVal !== 'number' || typeof weightVal !== 'number' || weightVal <= 0) continue
    weightedSum += metricVal * weightVal
    totalWeight += weightVal
  }
  const current = totalWeight > 0 ? weightedSum / totalWeight : null
  return compareThreshold(current, factor.operator, factor.value)
}

// Odds Factors read the exact same per-player entry shape dugout/data
// already builds (entry.props.<market>.<book>, entry.props.open.<field>) —
// no separate query. FanDuel is the canonical book for price/delta
// thresholds since every one of these markets already treats it as primary
// (see MARKET_BOOK_TO_OPEN_FIELD) — "books missing X odds" is the one Factor
// type that's explicitly cross-book by design.
const ODDS_BOOK_FIELD: Record<string, { current: string; open: string; books?: string[] }> = {
  fhr: { current: 'fhr_fd', open: 'fhr' },
  hr: { current: 'sa_fd', open: 'saFd' },
  hrml: { current: 'hrMl_fd', open: 'hrMl' },
  laser: { current: 'laser105_fd', open: 'laser105' },
  moonshot: { current: 'moonshot_fd', open: 'moonshot' },
  pa1: { current: 'pa1_fd', open: 'pa1' },
  rbi1: { current: 'rbi_fd', open: 'rbiFd' },
  rbi2: { current: 'rbi2_fd', open: 'rbi2Fd' },
  rbi3: { current: 'rbi3_fd', open: 'rbi3Fd' },
  tb2: { current: 'tb_fd', open: 'tbFd' },
  tb3: { current: 'tb3_fd', open: 'tb3Fd' },
  tb4: { current: 'tb4_fd', open: 'tb4Fd' },
  tb5: { current: 'tb5_fd', open: 'tb5Fd' },
  hr2: { current: 'hr2_fd', open: 'hr2Fd' },
  singles: { current: 'sng_fd', open: 'sngFd' },
  doubles: { current: 'dbl_fd', open: 'dblFd' },
  triples: { current: 'tri_fd', open: 'triFd' },
  sb1: { current: 'stolenBases', open: 'stolenBases' },
  sb2: { current: 'stolenBases2', open: 'stolenBases2' },
  hits1: { current: 'hits', open: 'hits' },
  hits2: { current: 'hits2', open: 'hits2' },
  runs1: { current: 'runs', open: 'runs' },
  runs2: { current: 'runs2', open: 'runs2' },
}
const BOOKS_MISSING_FIELD: Record<string, string[]> = {
  booksfhr: ['fhr_fd', 'fhr_cz', 'fhr_fan'],
  bookshr: ['sa_fd', 'sa_mgm', 'sa_cz', 'sa_br', 'sa_fan'],
}

export function evaluateOddsFactor(factor: MatrixFactor, row: Record<string, unknown>): boolean {
  if (factor.field_key === 'booksfhr' || factor.field_key === 'bookshr') {
    const bookKeys = BOOKS_MISSING_FIELD[factor.field_key]
    const missing = bookKeys.filter(k => row[k] == null).length
    return compareThreshold(missing, factor.operator, factor.value)
  }
  const spec = ODDS_BOOK_FIELD[factor.field_key]
  if (!spec) return false
  const current = row[spec.current] as number | null | undefined
  const opener = (row.open as Record<string, unknown> | undefined)?.[spec.open] as number | null | undefined

  if (factor.operator === 'up' || factor.operator === 'down' || factor.operator === 'flat') {
    if (current == null || opener == null) return false
    if (factor.operator === 'flat') return current === opener
    // Odds delta direction is priced, not signed — a LOWER American price
    // means the market moved toward this outcome ("shortened"), which reads
    // as the intuitive "moved up in likelihood" a member means by "up."
    return factor.operator === 'up' ? current < opener : current > opener
  }
  return compareThreshold(current ?? null, factor.operator, factor.value)
}

export function evaluateMatrix(matrix: Matrix, evaluateFactor: (f: MatrixFactor) => boolean): boolean {
  if (!matrix.factors.length) return false
  const results = matrix.factors.map(evaluateFactor)
  if (matrix.match_mode === 'all') return results.every(Boolean)
  const need = matrix.match_any_count ?? 1
  return results.filter(Boolean).length >= need
}
