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

export type SavantSplitRow = { category: string; window_type: string; dims: Record<string, string | number>; metrics: Record<string, number | string | null> }

// A Factor's recency selector must reach Savant-model-only metrics too, not
// just pitchlog_stat ones — MATRIX_RECENCY_WINDOWS (savantSplitsSync.ts) was
// built expressly so l1/l3/l5/l10 rows exist per player for this. 'custom'
// has no Savant-side analog (only exact date-range slicing over raw pitch
// rows makes sense there), so it falls back to 'season' rather than
// matching nothing.
const RECENCY_TO_SAVANT_WINDOW: Record<Exclude<MatrixRecency, 'custom'>, string> = {
  game: 'l1', l3: 'l3', l5: 'l5', l10: 'l10', season: 'season',
}

export function evaluateSavantFactor(
  factor: MatrixFactor,
  splitRows: SavantSplitRow[],
  batSide: 'L' | 'R',
  pitcherHand: 'L' | 'R',
): boolean {
  const field = SAVANT_FIELD[factor.field_key]
  if (!field) return false
  const windowType = factor.recency && factor.recency !== 'custom' ? RECENCY_TO_SAVANT_WINDOW[factor.recency] : 'season'
  const weightKey = SAVANT_WEIGHT_FIELD[field.category]
  const matching = splitRows.filter(r =>
    r.category === field.category && r.window_type === windowType &&
    r.dims.bat_side === batSide && r.dims.pitch_hand === pitcherHand
  )
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

// Odds Factors read the exact same raw per-player props entry dugout/data
// builds server-side (see bdlByName in api/dugout/data/route.ts) — nested
// per-market/per-book (props.fhr.fanduel, props.sa.betmgm, ...) plus a
// sibling `open` object per opening-baseline field (props.open.saFd, ...),
// NOT the flattened fhr_fd/saFd_open-style fields DugoutClient's own
// buildBatterRow derives from this same object for its own rendering —
// evaluated here directly off the server-side shape, before that client
// flattening ever happens. FanDuel is the canonical book for price/delta
// thresholds since every one of these markets already treats it as primary
// (see MARKET_BOOK_TO_OPEN_FIELD) — "books missing X odds" is the one Factor
// type that's explicitly cross-book by design.
type OddsProps = Record<string, { fanduel?: number | null; caesars?: number | null; betmgm?: number | null; betrivers?: number | null; fanatics?: number | null } | undefined> & {
  open?: Record<string, number | null | undefined>
}
const ODDS_BOOK_FIELD: Record<string, { market: string; open: string }> = {
  fhr: { market: 'fhr', open: 'fhr' },
  hr: { market: 'sa', open: 'saFd' },
  hrml: { market: 'hrMl', open: 'hrMl' },
  laser: { market: 'laser105', open: 'laser105' },
  moonshot: { market: 'moonshot', open: 'moonshot' },
  pa1: { market: 'pa1', open: 'pa1' },
  rbi1: { market: 'rbi', open: 'rbiFd' },
  rbi2: { market: 'rbi2', open: 'rbi2Fd' },
  rbi3: { market: 'rbi3', open: 'rbi3Fd' },
  tb2: { market: 'tb', open: 'tbFd' },
  tb3: { market: 'tb3', open: 'tb3Fd' },
  tb4: { market: 'tb4', open: 'tb4Fd' },
  tb5: { market: 'tb5', open: 'tb5Fd' },
  hr2: { market: 'hr2', open: 'hr2Fd' },
  singles: { market: 'singles', open: 'sngFd' },
  doubles: { market: 'doubles', open: 'dblFd' },
  triples: { market: 'triples', open: 'triFd' },
  sb1: { market: 'stolen_bases', open: 'stolenBases' },
  sb2: { market: 'stolen_bases2', open: 'stolenBases2' },
  hits1: { market: 'hits', open: 'hits' },
  hits2: { market: 'hits2', open: 'hits2' },
  runs1: { market: 'runs', open: 'runs' },
  runs2: { market: 'runs2', open: 'runs2' },
}
const BOOKS_MISSING_FIELD: Record<string, { market: string; books: string[] }> = {
  booksfhr: { market: 'fhr', books: ['fanduel', 'caesars', 'fanatics'] },
  bookshr: { market: 'sa', books: ['fanduel', 'betmgm', 'caesars', 'betrivers', 'fanatics'] },
}

export function evaluateOddsFactor(factor: MatrixFactor, props: OddsProps | null | undefined): boolean {
  if (factor.field_key === 'booksfhr' || factor.field_key === 'bookshr') {
    const spec = BOOKS_MISSING_FIELD[factor.field_key]
    const marketRow = props?.[spec.market]
    const missing = spec.books.filter(b => (marketRow as Record<string, number | null | undefined> | undefined)?.[b] == null).length
    return compareThreshold(missing, factor.operator, factor.value)
  }
  const spec = ODDS_BOOK_FIELD[factor.field_key]
  if (!spec) return false
  const current = props?.[spec.market]?.fanduel ?? null
  const opener = props?.open?.[spec.open] ?? null

  if (factor.operator === 'up' || factor.operator === 'down' || factor.operator === 'flat') {
    if (current == null || opener == null) return false
    if (factor.operator === 'flat') return current === opener
    // Odds delta direction is priced, not signed — a LOWER American price
    // means the market moved toward this outcome ("shortened"), which reads
    // as the intuitive "moved up in likelihood" a member means by "up."
    return factor.operator === 'up' ? current < opener : current > opener
  }
  return compareThreshold(current, factor.operator, factor.value)
}

export function evaluateMatrix(matrix: Matrix, evaluateFactor: (f: MatrixFactor) => boolean): boolean {
  if (!matrix.factors.length) return false
  const results = matrix.factors.map(evaluateFactor)
  if (matrix.match_mode === 'all') return results.every(Boolean)
  const need = matrix.match_any_count ?? 1
  return results.filter(Boolean).length >= need
}
