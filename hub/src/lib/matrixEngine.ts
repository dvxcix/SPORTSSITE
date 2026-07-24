import { computeStatLine, lastNGameDates, type PitchLogRow, type BatterStats } from '@/lib/batterStatsEngine'

// The evaluation core for Custom Matrix — given a member's saved Matrix
// (Elements/Factors) and one batter's real data for today's game, decides
// whether that batter lights up. Five real data sources, each handled on
// its own terms rather than forced through one interface:
//
//   odds            — reads the SAME per-player `props`/`open` object
//                      dugout/data/route.ts already builds (no extra query).
//   dugout_specs    — the Dugout table's own computed ratio/delta columns
//                      (DIV, FHR÷HR, HR÷Parlay, PA÷HR, HR÷RBI[2/3], HR÷HRR,
//                      HR÷TB[3/4/5], HR÷2HR, M÷F, FHR%, HR%) — the exact
//                      same fdczDiv/implRatio formulas DugoutClient.tsx's
//                      buildBatterRow uses, recomputed here from the same
//                      raw props + season-average maps so this stays a pure
//                      function of already-fetched data, no new query.
//   pitchlog_stat   — computed from OUR OWN player_pitch_log via
//                      computeStatLine(), with a REAL "last N games played"
//                      window (not a calendar-day approximation) and the
//                      correct opposing-pitcher-hand filter.
//   savant_stat     — the handful of metrics only Savant's own bat-tracking
//                      model produces (Hard-Swing%, Squared-Up%, Blast%,
//                      Ideal-Attack-Angle%) — read from our
//                      player_statcast_splits sync, weighted-aggregated
//                      across that table's pitch-type/contact-type splits.
//   picks           — community pick counts, either a raw threshold or
//                      (fieldKey ending "Pct") this player's share of his
//                      own game's total picks for that market (18 batters).

export type MatrixOperator = 'gte' | 'lte' | 'eq' | 'up' | 'down' | 'flat' | 'positive' | 'negative'
export type MatrixRecency = 'game' | 'l3' | 'l5' | 'l10' | 'season' | 'custom'

export type MatrixFactor = {
  id: string
  category: 'odds' | 'dugout_specs' | 'pitchlog_stat' | 'savant_stat' | 'picks'
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
  if (current == null) return false
  // Sign-only check — no threshold value needed, same "no value input" shape
  // as odds' up/down/flat. Meant for genuinely signed metrics (a delta vs.
  // this player's own season average, or FD-vs-Caesars divergence) where a
  // member just wants "trending the right way," not a specific number.
  if (operator === 'positive') return current > 0
  if (operator === 'negative') return current < 0
  if (value == null) return false
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
  // Savant's own CSV export returns every one of these 6 rate metrics as a
  // 0-1 fraction (confirmed live: squared_up_per_swing/ideal_attack_angle_
  // rate/pull_air_rate/fb_rate all sampled at values like 0.5, 0.333...),
  // but every OTHER percentage Factor in this engine (pitchlog_stat's
  // whiffPct/chasePct/hardHitPct/barrelPct, straight off computeStatLine)
  // is already 0-100 — the value a member types into "Hard-Swing % ≥ 50"
  // means 50, not 0.5, everywhere else in this feature. Scaling here keeps
  // that one consistent convention instead of silently never matching.
  const current = totalWeight > 0 ? (weightedSum / totalWeight) * 100 : null
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

// "Dugout Specs" — the Dugout table's own computed columns, not raw
// sportsbook prices: implied-probability ratios between two markets
// (DIV, FHR÷HR, HR÷Parlay, PA÷HR, HR÷RBI[2/3], HR÷HRR, HR÷TB[3/4/5],
// HR÷2HR, M÷F) and today's-price-vs-this-player's-own-season-average
// deltas (FHR%, HR%). Every formula here is copy-exact from
// DugoutClient.tsx's buildBatterRow (toImpl/decOdds/fdczDiv/implRatio) —
// recomputed server-side off the SAME raw props object evaluateOddsFactor
// already reads, so a Matrix stays a pure function of data already fetched
// this request, no new query. Only the two season-average Factors
// (fhr_pct/sa_pct) need an extra per-player lookup, passed in by the
// caller (dugout/data/route.ts already fetches fhrAvg/saAvg for every
// Ultimate request; matrixMatch.ts just needs it keyed by name_norm).
function toImpl(o: number | null): number | null {
  if (o == null) return null
  return o > 0 ? 100 / (o + 100) : Math.abs(o) / (Math.abs(o) + 100)
}
function decOdds(p: number | null): number | null {
  if (p == null) return null
  return p > 0 ? p / 100 + 1 : 100 / (-p) + 1
}
function fdczDiv(fd: number | null, cz: number | null): number | null {
  const a = decOdds(fd), b = decOdds(cz)
  if (a == null || b == null) return null
  return 1 / a - 1 / b
}
function implRatio(a: number | null, b: number | null): number | null {
  const ia = toImpl(a), ib = toImpl(b)
  if (ia == null || ib == null || ib === 0) return null
  return ia / ib
}

export type DugoutSpecsAverages = { fd?: number; cz?: number }

const DUGOUT_SPECS_FIELD: Record<string, (props: OddsProps | null | undefined) => number | null> = {
  div: props => fdczDiv(props?.fhr?.fanduel ?? null, props?.fhr?.caesars ?? null),
  fhr_div_sa: props => implRatio(props?.fhr?.fanduel ?? null, props?.sa?.fanduel ?? null),
  m_div_f: props => implRatio(props?.sa?.betmgm ?? null, props?.sa?.fanduel ?? null),
  pa1_div_sa: props => implRatio(props?.pa1?.fanduel ?? null, props?.sa?.fanduel ?? null),
  sa_div_ml: props => implRatio(props?.sa?.fanduel ?? null, props?.hrMl?.fanduel ?? null),
  sa_div_rbi: props => implRatio(props?.sa?.fanduel ?? null, props?.rbi?.fanduel ?? null),
  sa_div_rbi2: props => implRatio(props?.sa?.fanduel ?? null, props?.rbi2?.fanduel ?? null),
  sa_div_rbi3: props => implRatio(props?.sa?.fanduel ?? null, props?.rbi3?.fanduel ?? null),
  sa_div_hrr: props => implRatio(props?.sa?.fanduel ?? null, props?.hrr?.fanduel ?? null),
  sa_div_tb: props => implRatio(props?.sa?.fanduel ?? null, props?.tb?.fanduel ?? null),
  sa_div_tb3: props => implRatio(props?.sa?.fanduel ?? null, props?.tb3?.fanduel ?? null),
  sa_div_tb4: props => implRatio(props?.sa?.fanduel ?? null, props?.tb4?.fanduel ?? null),
  sa_div_tb5: props => implRatio(props?.sa?.fanduel ?? null, props?.tb5?.fanduel ?? null),
  sa_div_hr2: props => implRatio(props?.sa?.fanduel ?? null, props?.hr2?.fanduel ?? null),
}

export function evaluateDugoutSpecsFactor(
  factor: MatrixFactor,
  props: OddsProps | null | undefined,
  fhrAvg: DugoutSpecsAverages | null | undefined,
  saAvg: DugoutSpecsAverages | null | undefined,
): boolean {
  if (factor.field_key === 'fhr_pct' || factor.field_key === 'sa_pct') {
    const fd = props?.[factor.field_key === 'fhr_pct' ? 'fhr' : 'sa']?.fanduel ?? null
    const avg = factor.field_key === 'fhr_pct' ? fhrAvg?.fd : (saAvg?.fd ?? saAvg?.cz)
    const current = fd != null && avg ? ((fd - avg) / avg) * 100 : null
    return compareThreshold(current, factor.operator, factor.value)
  }
  const compute = DUGOUT_SPECS_FIELD[factor.field_key]
  if (!compute) return false
  return compareThreshold(compute(props), factor.operator, factor.value)
}

// Community HR-pick counts (from Pikkit's public board) — either a plain
// count threshold, or (field_key ending "Pct") this player's own share of
// HIS OWN GAME's total picks for that market — summed across all 18
// batters in that one game, not the whole day's slate — "who's getting
// disproportionate public action relative to tonight's other 17 hitters,"
// which a raw count alone can't answer (100 picks means something
// different in a 2-run pitchers' duel than a projected slugfest).
const PICKS_MARKET: Record<string, string> = {
  hr: 'home_runs', hrPct: 'home_runs',
  hits: 'hits', hitsPct: 'hits',
  runs: 'runs', runsPct: 'runs',
  stolenBases: 'stolen_bases', stolenBasesPct: 'stolen_bases',
  singles: 'singles', singlesPct: 'singles',
  doubles: 'doubles', doublesPct: 'doubles',
  triples: 'triples', triplesPct: 'triples',
  rbi: 'rbi', rbiPct: 'rbi',
  hrr: 'hits_runs_rbi', hrrPct: 'hits_runs_rbi',
  tb: 'bases', tbPct: 'bases',
}

export function evaluatePicksFactor(
  factor: MatrixFactor,
  pikkitEntry: Record<string, { picks?: number | null } | undefined> | null | undefined,
  gameTotalPicksByMarket: Record<string, number>,
): boolean {
  const market = PICKS_MARKET[factor.field_key]
  if (!market) return false
  const picks = pikkitEntry?.[market]?.picks ?? null
  if (factor.field_key.endsWith('Pct')) {
    const total = gameTotalPicksByMarket[market] ?? 0
    const current = picks != null && total > 0 ? (picks / total) * 100 : null
    return compareThreshold(current, factor.operator, factor.value)
  }
  return compareThreshold(picks, factor.operator, factor.value)
}

export function evaluateMatrix(matrix: Matrix, evaluateFactor: (f: MatrixFactor) => boolean): boolean {
  if (!matrix.factors.length) return false
  const results = matrix.factors.map(evaluateFactor)
  if (matrix.match_mode === 'all') return results.every(Boolean)
  const need = matrix.match_any_count ?? 1
  return results.filter(Boolean).length >= need
}
