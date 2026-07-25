import { computeStatLine, lastNGameDates, type PitchLogRow, type BatterStats } from '@/lib/batterStatsEngine'
import type { StatcastWindow, StatcastLine } from '@/lib/dugoutStatcast'

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

// 'tied' (odds/dugout_specs only) — "this player's value for this exact
// field(+book) exactly matches at least one teammate's," e.g. three guys
// all showing HR ÷ Parlay 1.18, or two guys both at FHR +900. Resolved by
// the caller (dugout/data/route.ts, the only place with visibility into
// every batter on the same team at once) via the isTied callbacks threaded
// through MatrixMatchContext — see evaluateOddsFactor/evaluateDugoutSpecsFactor.
// 'is_null'/'is_not_null' — real gap (2026-07-25): a filter always silently
// FAILED for a player with no value at all (no price posted for that book,
// no season average computed yet, no picks data) — there was no way to
// build a rule OUT OF that absence itself, e.g. "exclude anyone with no
// 110+ laser price" or "only players missing an FHR line entirely." These
// two make "has no value"/"has a value" a first-class condition on any
// field, any category — see compareThreshold's early-return for them below.
// 'lt_anchor'/'gt_anchor' — only meaningful on a filter step living inside
// an 'unless' step's condition_steps (see MatrixPipelineStep below):
// compares against that 'unless' step's dynamically-resolved anchor value
// (whatever the pool going INTO the 'unless' step was tied/ranked on)
// instead of a literal typed-in number. Evaluates to false wherever no
// anchor is in scope (fail-safe, never a crash).
export type MatrixOperator = 'gte' | 'lte' | 'eq' | 'up' | 'down' | 'flat' | 'positive' | 'negative' | 'tied' | 'is_null' | 'is_not_null' | 'lt_anchor' | 'gt_anchor'
// Real gap (2026-07-24): the grid's own Statcast section shows every
// pitchlog_stat/savant_stat field at both a recent window AND a season
// value, with a Δ (recent − season) alongside some of them — a Matrix
// Factor could only ever check the raw recent-window value, never that
// same delta a member can see plainly on the board (e.g. "his recent bat
// speed is UP 2.5 from his season number" was visible but not buildable).
// The '*_delta' variants below reuse the exact same precomputed windows —
// no new fetch or precompute, just recentWindow − season at evaluation
// time (see evaluatePitchlogFactorPrecomputed/evaluateSavantFactor).
export type MatrixRecency = 'game' | 'l3' | 'l5' | 'l10' | 'season' | 'custom' | 'game_delta' | 'l3_delta' | 'l5_delta' | 'l10_delta'

const DELTA_RECENCIES = ['game_delta', 'l3_delta', 'l5_delta', 'l10_delta'] as const
type DeltaRecency = typeof DELTA_RECENCIES[number]
function isDeltaRecency(r: MatrixRecency | null): r is DeltaRecency {
  return !!r && (DELTA_RECENCIES as readonly string[]).includes(r)
}
function baseWindowOfDelta(r: DeltaRecency): 'game' | 'l3' | 'l5' | 'l10' {
  return r.slice(0, -'_delta'.length) as 'game' | 'l3' | 'l5' | 'l10'
}

export type MatrixFactor = {
  id: string
  category: 'odds' | 'dugout_specs' | 'pitchlog_stat' | 'savant_stat' | 'picks'
  field_key: string
  operator: MatrixOperator
  value: number | null
  recency: MatrixRecency | null
  recency_start: string | null
  recency_end: string | null
  // Only meaningful for the two real multi-book odds markets (FHR, Anytime
  // HR) — which book(s) this Factor actually checks. null/empty defaults to
  // ['fanduel'] (the same single-book behavior every other odds Factor has
  // always had). See MULTI_BOOK_MARKET below.
  books: string[] | null
  // null → every book in `books` must satisfy the Factor (a single book
  // selected is just that one book, same as before this existed). A number
  // → "at least N of `books` satisfy it" — e.g. "3+ of FHR's books moved up
  // since open," not "FanDuel specifically."
  books_min_count: number | null
  // Only meaningful for operator 'tied' — whether the comparison pool is
  // this player's own team ('team', the default/null case) or every batter
  // in the game on either side ('game'). null/'team' preserves the original
  // per-team-only behavior 'tied' shipped with.
  tie_scope: 'team' | 'game' | null
  // Only meaningful for operator 'tied' — real gap (2026-07-25): when a
  // 'tied' Factor's pool has more than one raw tie cluster at different
  // values (e.g. two players tied at .50 on one team, two different
  // players tied at .35 on the other), the original behavior kept EVERY
  // cluster's members. null keeps that original behavior; 'highest'/
  // 'lowest' narrows to just the single tie cluster at that extreme value
  // BEFORE any tiebreaker chain below runs (which then narrows WITHIN that
  // one chosen cluster, if it's still >1 player) — see selectTieCluster.
  tie_direction: 'highest' | 'lowest' | null
  // Only meaningful for operator 'tied' — an ordered fallback chain that
  // narrows a raw tie group down to whoever ranks best on some OTHER field
  // (any category, e.g. "of everyone tied on HR÷Parlay, keep only the
  // highest recent Attack Angle"). Applied in order: if step 1 still leaves
  // more than one player tied, step 2 runs on just that remaining pool, and
  // so on. If the whole chain runs out and players still tie, ALL of them
  // stay highlighted — there's no more information to pick a "winner," so
  // nothing is silently dropped. null/empty = the original plain-tie
  // behavior (every member of the raw tie group counts).
  tiebreakers: MatrixTiebreaker[] | null
}

export type MatrixTiebreaker = {
  category: 'odds' | 'dugout_specs' | 'pitchlog_stat' | 'savant_stat' | 'picks'
  field_key: string
  // Only meaningful for pitchlog_stat/savant_stat fields (a recency window
  // is part of what "R ATK" even means) — null defaults to 'season' the
  // same way a plain Factor without a chosen recency does.
  recency: MatrixRecency | null
  // Only meaningful for the two real multi-book odds fields (fhr, hr) —
  // which single book to rank by. null defaults to 'fanduel'.
  book: string | null
  direction: 'highest' | 'lowest'
  // Real gap (2026-07-25): the best value in a pool almost never has an
  // EXACT (2-decimal-rounded) match — confirmed live, e.g. two real HR
  // hitters at 0.2621/0.2688 on the same ratio landed in different rounding
  // buckets and only one survived. null/0 keeps the original exact-match
  // behavior (every existing saved chain evaluates identically); a positive
  // number widens the winner set to anyone within that RAW distance of the
  // best value, direction-aware — see resolveTiebreakers below.
  tolerance: number | null
}

// ─── Pipeline mode ──────────────────────────────────────────────────────
// A Matrix is either "Classic" (the AND-of-Factors system above) or
// "Pipeline" — a freely-ordered chain of steps that narrows a pool of
// players down to a final winner (or winners, if the chain runs out of
// information to pick just one). Three step kinds, one per verb a member
// might reach for while describing a formula in plain English:
//
//   filter — a plain threshold, exactly a classic Factor's condition (hard
//            requirement: if nobody passes, that branch highlights nobody,
//            same as a Factor that never matches).
//   group  — "tied on this field" (reuses groupTiedCandidates below), keeps
//            only the union of whoever's tied with someone else in the
//            CURRENT pool. Lenient: if nobody ties, the pool passes through
//            unchanged rather than being wiped — a narrowing attempt that
//            finds nothing shouldn't destroy a formula that was otherwise
//            working.
//   rank   — "highest/lowest on this field" (reuses resolveTiebreakers
//            below, called with a single-step chain). Also lenient: if
//            nobody in the pool has a value for this field, pass through
//            unchanged.
//
// group/rank only ever consider ONE book for a multi-book odds field (fhr/
// hr) — same single-`book` precedent MatrixTiebreaker already established;
// full multi-book combination (N+ of these books) stays a filter-only
// capability, reusing evaluateOddsFactor wholesale for that case.
//
// unless — real gap (2026-07-25): every step above applies uniformly to
// whatever survived the step before it; some real formulas need "normally
// do X, but if a DIFFERENT specific situation exists elsewhere in the game,
// do Y instead." An 'unless' step is a branch: `category`/`field_key`/
// `recency`/`book` here mean "the ANCHOR field" (usually the same field the
// step right above it grouped/ranked on) — its value is read fresh off
// whoever's in the pool going INTO this step (they're tied/ranked by
// construction, so any one member's value is the reference). If
// `condition_steps` (an ordinary Filter/Group/Rank mini-chain, run STRICT —
// see runPipelineStep — against `condition_scope`'s universe) finds nothing,
// this step is a no-op and the incoming pool passes through unchanged. If it
// finds something, `then_steps` (a second mini-chain, run leniently) narrows
// THAT result down to the replacement pool. Deliberately capped at one level
// — condition_steps/then_steps must not themselves contain an 'unless' step
// (enforced by the UI, not the engine, so a determined caller COULD nest
// deeper, but the builder never offers it).
export type PipelineStepKind = 'filter' | 'group' | 'rank' | 'unless'
export type MatrixPipelineStep = {
  kind: PipelineStepKind
  category: MatrixFactor['category']
  field_key: string
  recency: MatrixRecency | null
  // group/rank: which single book to read for a multi-book field (fhr/hr).
  // null defaults to 'fanduel', same as everywhere else in this engine.
  book: string | null
  // filter only — full multi-book support, identical semantics to a
  // classic Factor's own books/books_min_count.
  books: string[] | null
  books_min_count: number | null
  operator: MatrixOperator | null   // filter only
  value: number | null              // filter only
  // rank: which extreme to keep. group: null keeps every tied cluster
  // (original behavior); 'highest'/'lowest' narrows to the single cluster
  // at that extreme when the pool has more than one — see selectTieCluster.
  direction: 'highest' | 'lowest' | null
  tolerance: number | null          // rank only — see MatrixTiebreaker.tolerance
  // unless only — see the type-level comment above.
  condition_scope: 'team' | 'game' | null
  condition_steps: MatrixPipelineStep[] | null
  then_steps: MatrixPipelineStep[] | null
}
export const MAX_PIPELINE_STEPS = 10

// Per-player data a pipeline step might need, keyed by name_norm by the
// caller (dugout/data/route.ts — the only place with visibility into every
// batter in a game at once). Identical shape to the ad-hoc `Bundle` type
// that block already builds for the tie/tiebreaker precompute — promoted
// here so both that precompute and the pipeline runner share one type
// instead of two independently-typed copies of the same thing.
export type FieldBundle = {
  props: OddsProps | null
  fhrAvg: DugoutSpecsAverages | null | undefined
  saAvg: DugoutSpecsAverages | null | undefined
  pitchlogWindows: Record<PitchlogStatWindow, BatterStats> | null
  statcastWindows: Record<StatcastWindow, StatcastLine> | null
  pikkitEntry: Record<string, { picks?: number | null } | undefined> | null
}

export type Matrix = {
  id: string
  name: string
  color: string
  priority: number
  match_mode: 'all' | 'any'
  match_any_count: number | null
  factors: MatrixFactor[]
  // 'classic' (the default — every Matrix before Pipeline mode existed) uses
  // `factors` above via evaluateMatrix. 'pipeline' ignores `factors`
  // entirely — matching is instead "is this player in the winners set
  // dugout/data/route.ts computed by running `pipeline_steps` through
  // runPipeline," threaded in via MatrixMatchContext.isPipelineMatrixWinner.
  matrix_type: 'classic' | 'pipeline'
  pipeline_scope: 'team' | 'game' | null
  pipeline_steps: MatrixPipelineStep[]
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

// Delta recencies never reach this table — they're only meaningful against
// the precomputed windows (evaluatePitchlogFactorPrecomputed/evaluateSavantFactor),
// never through this live "custom range" fallback path.
const RECENCY_GAME_COUNT: Record<Exclude<MatrixRecency, 'season' | 'custom' | DeltaRecency>, number> = {
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
  const baseRecency = isDeltaRecency(recency) ? baseWindowOfDelta(recency) : recency
  const dates = lastNGameDates(vsHand, RECENCY_GAME_COUNT[baseRecency])
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
  // Checked before the null-guard below (every other operator treats null
  // as "can't possibly pass") — these two are the only operators FOR which
  // null is exactly the thing being asked about.
  if (operator === 'is_null') return current == null
  if (operator === 'is_not_null') return current != null
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
  // Real bug, reported live (2026-07-24): 'eq' did strict float equality
  // (current === value) against fields like dugout_specs ratios that are
  // raw division results (implRatio's ia/ib) — never a clean number like
  // the 1.12 a member sees on the board and types in, since the board
  // itself only ever displays these rounded to 2 decimals. A saved "HR ÷
  // Parlay exactly 1.12" Factor was therefore never true for anyone, no
  // matter how the board visibly showed 1.12. Rounding both sides to the
  // same 2 decimals every fractional value in this app is displayed at
  // fixes it; harmless for whole-number fields (odds prices, counts) since
  // rounding an integer is a no-op.
  if (operator === 'eq') return Math.round(current * 100) / 100 === Math.round(value * 100) / 100
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

// Real incident (2026-07-24): pitchlog_stat Factors were the ONE Matrix
// category still doing a live per-batter raw-pitch fetch on every single
// Dugout request (see getCachedBatterPitchRows/matrixPitchRows in
// dugout/data/route.ts) — confirmed live to recur as 28-56s request spikes
// for the specific real members whose saved Matrix happens to use this
// category (e.g. whiff%/hard-hit%/barrel% over a real "last N games"
// window), while members using only savant_stat/dugout_specs/odds never
// touch that path at all. Every recency EXCEPT 'custom' (an arbitrary exact
// date range, which genuinely can't be precomputed as a fixed bucket) is
// one of a small fixed set — exactly like savant_stat's own l1/l3/l5/l10/
// season windows already are, just phrased with pitchlog_stat's older
// 'game'/'l3'/'l5'/'l10'/'season' names. Precomputing all 5 once daily
// (see dugoutPitchlogStatPrecompute.ts) means these Factors read a plain
// indexed SELECT the same way savant_stat already does, instead of ever
// re-fetching a batter's full season of raw pitches per request.
export const PITCHLOG_STAT_WINDOWS = ['game', 'l3', 'l5', 'l10', 'season'] as const
export type PitchlogStatWindow = typeof PITCHLOG_STAT_WINDOWS[number]

// The raw current value for a pitchlog_stat field at a given recency —
// extracted so route.ts's tiebreaker resolver reuses the exact same window
// selection a plain Factor uses (e.g. "R ATK" ranking by the same recent
// Attack Angle a member could otherwise build a threshold Factor from).
export function computePitchlogStatValue(
  fieldKey: string,
  recency: MatrixRecency | null,
  windows: Record<PitchlogStatWindow, BatterStats> | null | undefined,
): number | null {
  const statKey = PITCHLOG_FIELD[fieldKey]
  if (!statKey || !windows) return null
  if (isDeltaRecency(recency)) {
    const recentLine = windows[baseWindowOfDelta(recency)]
    const seasonLine = windows.season
    const recentVal = recentLine ? (recentLine[statKey] as number | null) : null
    const seasonVal = seasonLine ? (seasonLine[statKey] as number | null) : null
    return recentVal != null && seasonVal != null ? recentVal - seasonVal : null
  }
  const bucket = (recency && recency !== 'custom' ? recency : 'season') as PitchlogStatWindow
  const line = windows[bucket]
  return line ? (line[statKey] as number | null) : null
}

export function evaluatePitchlogFactorPrecomputed(
  factor: MatrixFactor,
  windows: Record<PitchlogStatWindow, BatterStats> | null | undefined,
): boolean {
  return compareThreshold(computePitchlogStatValue(factor.field_key, factor.recency, windows), factor.operator, factor.value)
}

// All 5 fixed windows at once, from one batter's raw pitch rows — mirrors
// computeAllStatcastWindows (dugoutStatcast.ts) exactly. Only ever called
// from the daily precompute cron now, never from the request path.
export function computeAllPitchlogStatWindows(
  allRows: PitchLogRow[],
  pitcherHand: 'L' | 'R',
  asOfDate: string,
): Record<PitchlogStatWindow, BatterStats> {
  const out = {} as Record<PitchlogStatWindow, BatterStats>
  for (const w of PITCHLOG_STAT_WINDOWS) {
    out[w] = computeStatLine(sliceRecencyWindow(allRows, pitcherHand, w, null, null, asOfDate))
  }
  return out
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
// Each maps straight onto a field of the Dugout grid's own precomputed
// StatcastLine (dugoutStatcast.ts) — see evaluateSavantFactor below for why
// Matrix reads that cron-precomputed table instead of aggregating raw
// player_statcast_splits rows itself.
const SAVANT_FIELD_TO_STATCAST_KEY: Record<string, keyof StatcastLine> = {
  hardsw: 'hardSwingRate',
  sq: 'squaredUpPct',
  blast: 'blastPct',
  idlaa: 'idealAttackAngleRate',
  pullair: 'pullAirRate',
  fb: 'fbRate',
  // Real gap (2026-07-24): Timing %/Miss Distance are shown right on the
  // grid's own Statcast section (same computeAllStatcastWindows output as
  // every other savant_stat field here) but were never wired into the
  // Matrix field list at all — not missing data, just never exposed.
  timing: 'onTimePct',
  miss: 'missDistance',
}
// missDistance is a real physical distance (~0.9-1.4 feet), not a 0-1 rate
// — the ×100 scaling evaluateSavantFactor applies to every other field
// here would turn a real 1.2ft into a nonsensical 120.
const SAVANT_FIELD_NO_SCALE = new Set(['miss'])

export type SavantSplitRow = { category: string; window_type: string; dims: Record<string, string | number>; metrics: Record<string, number | string | null> }

// A Factor's recency selector must reach Savant-model-only metrics too, not
// just pitchlog_stat ones — MATRIX_RECENCY_WINDOWS (savantSplitsSync.ts) was
// built expressly so l1/l3/l5/l10 rows exist per player for this. 'custom'
// has no Savant-side analog (only exact date-range slicing over raw pitch
// rows makes sense there), so it falls back to 'season' rather than
// matching nothing.
const RECENCY_TO_SAVANT_WINDOW: Record<'game' | 'l3' | 'l5' | 'l10' | 'season', StatcastWindow> = {
  game: 'l1', l3: 'l3', l5: 'l5', l10: 'l10', season: 'season',
}

// Weighted average of one metric across whatever pitch-type/contact-type
// splits match this exact (category, window, bat side, pitch hand) — a
// 1-swing outlier split shouldn't count the same as a 40-swing one.
// Returns the RAW value (whatever scale that metric's own CSV export
// uses — most of these 6 are 0-1 fractions, see evaluateSavantFactor's own
// scaling comment). Used only by dugoutStatcastPrecompute.ts's cron/backfill
// (via computeStatcastLine) now — Custom Matrix's own savant_stat Factors
// read that precomputed output directly (see evaluateSavantFactor below)
// instead of aggregating raw player_statcast_splits rows a second time.
export function weightedSavantMetric(
  splitRows: SavantSplitRow[],
  category: string,
  windowType: string,
  batSide: 'L' | 'R',
  pitcherHand: 'L' | 'R',
  metric: string,
): number | null {
  const weightKey = SAVANT_WEIGHT_FIELD[category]
  const matching = splitRows.filter(r =>
    r.category === category && r.window_type === windowType &&
    r.dims.bat_side === batSide && r.dims.pitch_hand === pitcherHand
  )
  let weightedSum = 0
  let totalWeight = 0
  for (const row of matching) {
    const metricVal = row.metrics[metric]
    const weightVal = row.metrics[weightKey]
    if (typeof metricVal !== 'number' || typeof weightVal !== 'number' || weightVal <= 0) continue
    weightedSum += metricVal * weightVal
    totalWeight += weightVal
  }
  return totalWeight > 0 ? weightedSum / totalWeight : null
}

// savant_stat Factors (Hard-Swing%/Squared-Up%/Blast%/Ideal-Attack-Angle%/
// Pull-Air%/FB%) read straight off the Dugout grid's own cron-precomputed
// Statcast table (dugout_statcast_precomputed, one row per date/batter/
// opposing-pitcher-hand — see dugoutStatcastPrecompute.ts) instead of
// aggregating raw player_statcast_splits rows live. Two real reasons, not
// just perf: (1) this data doesn't change intraday, so there's no reason a
// Matrix evaluation should ever pay a live-fetch cost real production
// contention already proved unsafe under concurrent load; (2)
// player_statcast_splits is a rolling CURRENT-snapshot table with no
// history — aggregating it live for a PAST date would silently return
// TODAY's splits, not the genuinely-as-of-that-date values, which is wrong
// for backtesting. The precomputed table is snapshotted per game_date, so
// this reads the correct historical value for any already-backfilled date.
// The raw current value for a savant_stat field at a given recency —
// extracted so route.ts's tiebreaker resolver reuses the exact same
// window/scale resolution a plain Factor uses.
export function computeSavantStatValue(
  fieldKey: string,
  recency: MatrixRecency | null,
  statcastWindows: Record<StatcastWindow, StatcastLine> | null | undefined,
): number | null {
  const key = SAVANT_FIELD_TO_STATCAST_KEY[fieldKey]
  if (!key || !statcastWindows) return null
  // Savant's own CSV export returns every one of the rate fields here as a
  // 0-1 fraction (confirmed live: squared_up_per_swing/ideal_attack_angle_
  // rate/pull_air_rate/fb_rate/on_time_percent all sampled at values like
  // 0.5, 0.333...), but every OTHER percentage Factor in this engine
  // (pitchlog_stat's whiffPct/chasePct/hardHitPct/barrelPct, straight off
  // computeStatLine) is already 0-100 — the value a member types into
  // "Hard-Swing % ≥ 50" means 50, not 0.5, everywhere else in this
  // feature. Scaling here keeps that one consistent convention instead of
  // silently never matching. miss_distance is a real physical distance,
  // not a rate — see SAVANT_FIELD_NO_SCALE.
  const scale = SAVANT_FIELD_NO_SCALE.has(fieldKey) ? 1 : 100
  if (isDeltaRecency(recency)) {
    const recentWindow = RECENCY_TO_SAVANT_WINDOW[baseWindowOfDelta(recency)]
    const recentRaw = statcastWindows[recentWindow]?.[key] ?? null
    const seasonRaw = statcastWindows.season?.[key] ?? null
    return recentRaw != null && seasonRaw != null ? (recentRaw - seasonRaw) * scale : null
  }
  const windowType: StatcastWindow = recency && recency !== 'custom' ? RECENCY_TO_SAVANT_WINDOW[recency] : 'season'
  const raw = statcastWindows[windowType]?.[key] ?? null
  return raw != null ? raw * scale : null
}

export function evaluateSavantFactor(
  factor: MatrixFactor,
  statcastWindows: Record<StatcastWindow, StatcastLine> | null | undefined,
): boolean {
  return compareThreshold(computeSavantStatValue(factor.field_key, factor.recency, statcastWindows), factor.operator, factor.value)
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
export type OddsProps = Record<string, { fanduel?: number | null; caesars?: number | null; betmgm?: number | null; betrivers?: number | null; fanatics?: number | null } | undefined> & {
  open?: Record<string, number | null | undefined>
}
const ODDS_BOOK_FIELD: Record<string, { market: string; open: string }> = {
  fhr: { market: 'fhr', open: 'fhr' },
  hr: { market: 'sa', open: 'saFd' },
  hrml: { market: 'hrMl', open: 'hrMl' },
  // laser/laser110 are genuinely different FanDuel markets (105+ MPH vs.
  // 110+ MPH home run), not two labels for the same price — confirmed live
  // against fanduel_gap_odds: laser110_fd has been captured by the
  // automatic scrape all along (~40-50% the volume of laser105 on a normal
  // day), it just never had its own Factor option until now.
  laser: { market: 'laser105', open: 'laser105' },
  laser110: { market: 'laser110', open: 'laser110' },
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

// FHR and Anytime HR are the two markets this app actually carries real
// prices from more than one book for (every other odds Factor field is
// FanDuel-only in our data — see ODDS_BOOK_FIELD above) — so these are the
// two a member can genuinely scope to specific book(s), or "N+ of these
// books," rather than always meaning FanDuel implicitly. Each book's own
// opening-price field name (confirmed against MARKET_BOOK_TO_OPEN_FIELD in
// api/dugout/data/route.ts, the one place these are written).
// Exported so dugout/data/route.ts's generic per-team tie precompute (see
// evaluateOddsFactor's 'tied' branch below) knows which odds field_keys are
// genuinely multi-book without duplicating this table.
export const MULTI_BOOK_MARKET: Record<string, { market: string; openByBook: Record<string, string> }> = {
  fhr: { market: 'fhr', openByBook: { fanduel: 'fhr', caesars: 'fhrCz', fanatics: 'fhrFan' } },
  hr: { market: 'sa', openByBook: { fanduel: 'saFd', caesars: 'saCz', betmgm: 'saMgm', betrivers: 'saBr', fanatics: 'saFan' } },
}

// The raw current price for a given odds field_key(+book) — no opener, no
// operator, just the number. Exported so route.ts's tie precompute reuses
// the exact same market/book resolution evaluateOddsFactor uses below,
// rather than re-deriving it (and risking drift). `booksfhr`/`bookshr`
// (a missing-books COUNT, not a price) return null — "tied" is meaningless
// for them, and the UI never offers the operator for those two fields.
export function computeOddsRawPrice(fieldKey: string, book: string, props: OddsProps | null | undefined): number | null {
  const multi = MULTI_BOOK_MARKET[fieldKey]
  if (multi) {
    const marketRow = props?.[multi.market] as Record<string, number | null | undefined> | undefined
    return marketRow?.[book] ?? null
  }
  const spec = ODDS_BOOK_FIELD[fieldKey]
  if (!spec) return null
  return props?.[spec.market]?.fanduel ?? null
}

function oddsFactorTrueForPrice(factor: MatrixFactor, current: number | null, opener: number | null): boolean {
  if (factor.operator === 'up' || factor.operator === 'down' || factor.operator === 'flat') {
    if (current == null || opener == null) return false
    if (factor.operator === 'flat') return current === opener
    // "Up"/"down" mean literal American-price direction, matching the same
    // convention the Dugout board's own delta arrow already uses (OddsCell
    // in DugoutClient.tsx: red ▲ when current > opener, green ▼ when
    // current < opener) — a price moving from +2500 to +3000 is "up," from
    // +2500 to +800 is "down," regardless of what that implies about
    // likelihood. Was inverted from this until 2026-07-24 (confirmed live:
    // a "moved up since open" Factor was actually matching price DECREASES).
    return factor.operator === 'up' ? current > opener : current < opener
  }
  return compareThreshold(current, factor.operator, factor.value)
}

export function evaluateOddsFactor(
  factor: MatrixFactor,
  props: OddsProps | null | undefined,
  // Whether THIS player is one of the final surviving winners of THIS exact
  // Factor's tie group — book selection, scope, and any tiebreaker chain
  // are already fully resolved by the caller, keyed by factor.id. See
  // evaluateDugoutSpecsFactor's matching param for the full rationale.
  isFactorTied?: (factorId: string) => boolean,
): boolean {
  if (factor.field_key === 'booksfhr' || factor.field_key === 'bookshr') {
    const spec = BOOKS_MISSING_FIELD[factor.field_key]
    const marketRow = props?.[spec.market]
    const missing = spec.books.filter(b => (marketRow as Record<string, number | null | undefined> | undefined)?.[b] == null).length
    return compareThreshold(missing, factor.operator, factor.value)
  }

  if (factor.operator === 'tied') return isFactorTied?.(factor.id) ?? false

  const multi = MULTI_BOOK_MARKET[factor.field_key]
  if (multi) {
    // Empty/unset books = the same single-FanDuel behavior this Factor
    // always had before book scoping existed — an existing saved Matrix
    // with no `books` set keeps matching exactly as before.
    const books = factor.books?.length ? factor.books : ['fanduel']
    const results = books.map(book => {
      const marketRow = props?.[multi.market] as Record<string, number | null | undefined> | undefined
      const current = marketRow?.[book] ?? null
      const opener = props?.open?.[multi.openByBook[book]] ?? null
      return oddsFactorTrueForPrice(factor, current, opener)
    })
    return factor.books_min_count != null
      ? results.filter(Boolean).length >= factor.books_min_count
      : results.every(Boolean)
  }

  const spec = ODDS_BOOK_FIELD[factor.field_key]
  if (!spec) return false
  const current = props?.[spec.market]?.fanduel ?? null
  const opener = props?.open?.[spec.open] ?? null
  return oddsFactorTrueForPrice(factor, current, opener)
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

// "PWR ⚡" — the Dugout table's own power-vehicle gate, ported exactly from
// buildBatterRow: uses the builder's own simplified (odds+100)÷(odds+100)
// ratio (rawRatio), NOT implRatio's implied-probability version — matching
// its exact real thresholds rather than approximating them.
function rawRatio(a: number | null, b: number | null): number | null {
  return a != null && b != null ? Math.round(((a + 100) / (b + 100)) * 10) / 10 : null
}
function isPwr(props: OddsProps | null | undefined): boolean {
  const saFd = props?.sa?.fanduel ?? null
  const pvRatio = rawRatio(saFd, props?.doubles?.fanduel ?? null)
  const tb4Gate = rawRatio(saFd, props?.tb4?.fanduel ?? null)
  return pvRatio != null && pvRatio >= 1.35 && pvRatio <= 1.60 && tb4Gate != null && tb4Gate <= 3.8
}

export type DugoutSpecsAverages = { fd?: number; cz?: number }

// Every field here returns a real ratio EXCEPT is_pwr, a boolean gate —
// represented as 1/0 so it flows through the exact same compareThreshold
// path as every ratio field below (operator 'eq', value 1 or 0); the UI
// presents it as a plain Yes/No choice rather than a ratio to type a
// number for, but under the hood it's an ordinary eq Factor.
const DUGOUT_SPECS_FIELD: Record<string, (props: OddsProps | null | undefined) => number | null> = {
  div: props => fdczDiv(props?.fhr?.fanduel ?? null, props?.fhr?.caesars ?? null),
  is_pwr: props => (isPwr(props) ? 1 : 0),
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

// The raw current value for a dugout_specs field — every ratio in
// DUGOUT_SPECS_FIELD, plus fhr_pct/sa_pct's season-average-relative delta
// (which needs the extra averages args those two don't get from `props`
// alone). Exported so route.ts's tie precompute reuses this exact
// resolution instead of re-deriving it — the display column and the tie
// check can never drift apart this way.
export function computeDugoutSpecsValue(
  fieldKey: string,
  props: OddsProps | null | undefined,
  fhrAvg: DugoutSpecsAverages | null | undefined,
  saAvg: DugoutSpecsAverages | null | undefined,
): number | null {
  if (fieldKey === 'fhr_pct' || fieldKey === 'sa_pct') {
    const fd = props?.[fieldKey === 'fhr_pct' ? 'fhr' : 'sa']?.fanduel ?? null
    const avg = fieldKey === 'fhr_pct' ? fhrAvg?.fd : (saAvg?.fd ?? saAvg?.cz)
    return fd != null && avg ? ((fd - avg) / avg) * 100 : null
  }
  return DUGOUT_SPECS_FIELD[fieldKey]?.(props) ?? null
}

export function evaluateDugoutSpecsFactor(
  factor: MatrixFactor,
  props: OddsProps | null | undefined,
  fhrAvg: DugoutSpecsAverages | null | undefined,
  saAvg: DugoutSpecsAverages | null | undefined,
  // Whether THIS player is one of the final surviving winners of THIS exact
  // Factor's tie group (scope + tiebreaker chain already fully resolved by
  // the caller, keyed by factor.id — see dugout/data/route.ts, the only
  // place with visibility into every batter in the game at once). This
  // function stays a pure per-player evaluator like every other
  // dugout_specs Factor.
  isFactorTied?: (factorId: string) => boolean,
): boolean {
  if (factor.operator === 'tied') return isFactorTied?.(factor.id) ?? false
  const current = computeDugoutSpecsValue(factor.field_key, props, fhrAvg, saAvg)
  return compareThreshold(current, factor.operator, factor.value)
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

// The raw current value for a picks field — extracted so route.ts's
// tiebreaker resolver reuses the exact same count/percentage resolution a
// plain Factor uses.
export function computePicksValue(
  fieldKey: string,
  pikkitEntry: Record<string, { picks?: number | null } | undefined> | null | undefined,
  gameTotalPicksByMarket: Record<string, number>,
): number | null {
  const market = PICKS_MARKET[fieldKey]
  if (!market) return null
  const picks = pikkitEntry?.[market]?.picks ?? null
  if (fieldKey.endsWith('Pct')) {
    const total = gameTotalPicksByMarket[market] ?? 0
    return picks != null && total > 0 ? (picks / total) * 100 : null
  }
  return picks
}

export function evaluatePicksFactor(
  factor: MatrixFactor,
  pikkitEntry: Record<string, { picks?: number | null } | undefined> | null | undefined,
  gameTotalPicksByMarket: Record<string, number>,
): boolean {
  return compareThreshold(computePicksValue(factor.field_key, pikkitEntry, gameTotalPicksByMarket), factor.operator, factor.value)
}

export function evaluateMatrix(matrix: Matrix, evaluateFactor: (f: MatrixFactor) => boolean): boolean {
  if (!matrix.factors.length) return false
  const results = matrix.factors.map(evaluateFactor)
  if (matrix.match_mode === 'all') return results.every(Boolean)
  const need = matrix.match_any_count ?? 1
  return results.filter(Boolean).length >= need
}

// ─── Tie-group + tiebreaker reduction (pure logic, no data-fetching) ──────
// dugout/data/route.ts is the only place with visibility into every batter
// in a game at once, so IT builds the raw per-player value maps and calls
// these two functions to turn them into a final "winners" set per Factor.

// Groups candidates by identical value, rounded to the same 2 decimals
// every fractional value in this app displays at (matches compareThreshold's
// 'eq' fix) — singleton "groups" (nobody else shares that value) are
// dropped, since a lone value never counts as a tie.
export function groupTiedCandidates(values: Map<string, number>): Map<number, string[]> {
  const groups = new Map<number, string[]>()
  for (const [name, raw] of values) {
    const v = Math.round(raw * 100) / 100
    const arr = groups.get(v) ?? []
    arr.push(name)
    groups.set(v, arr)
  }
  for (const [v, arr] of groups) if (arr.length < 2) groups.delete(v)
  return groups
}

// When a pool has more than one raw tie cluster at different values (e.g.
// two players tied at .50, two different players tied at .35), the
// original 'tied' behavior kept every cluster. This narrows the group map
// down to just the single cluster at the requested extreme — null returns
// every cluster unchanged. Kept as a map (not flattened) so a caller that
// still needs to run a per-cluster tiebreaker chain (classic 'tied'
// Factors) can do so on whichever cluster(s) survive; pipeline group steps
// use the flattening convenience below since they have no such chain.
export function filterTieGroups(groups: Map<number, string[]>, direction: 'highest' | 'lowest' | null): Map<number, string[]> {
  if (!direction || !groups.size) return groups
  const best = direction === 'lowest' ? Math.min(...groups.keys()) : Math.max(...groups.keys())
  const only = groups.get(best)
  return only ? new Map([[best, only]]) : new Map()
}
export function selectTieCluster(groups: Map<number, string[]>, direction: 'highest' | 'lowest' | null): Set<string> {
  const winners = new Set<string>()
  for (const g of filterTieGroups(groups, direction).values()) for (const n of g) winners.add(n)
  return winners
}

// Narrows one raw tie group down via an ordered tiebreaker chain: at each
// step, keep only the candidate(s) with the best value (per that step's
// direction) for that step's field; once only one candidate remains, later
// steps are skipped. If a step's field has no value for ANY remaining
// candidate, that step is a no-op (falls through to the next one) rather
// than wiping the pool. If the whole chain runs out and multiple candidates
// still share the best value, ALL of them survive — there's no more
// information to pick a single "winner," so nothing is silently dropped.
// `resolveValue` defers to whichever per-category computeXxxValue helper
// applies for that tiebreaker's own category, so this function stays
// category-agnostic.
export function resolveTiebreakers(
  group: string[],
  tiebreakers: MatrixTiebreaker[],
  resolveValue: (name: string, tb: MatrixTiebreaker) => number | null,
): Set<string> {
  let pool = group
  for (const tb of tiebreakers) {
    if (pool.length <= 1) break
    const withValues = pool
      .map(name => ({ name, value: resolveValue(name, tb) }))
      .filter((c): c is { name: string; value: number } => c.value != null)
    if (!withValues.length) continue
    const best = tb.direction === 'lowest'
      ? Math.min(...withValues.map(c => c.value))
      : Math.max(...withValues.map(c => c.value))
    // tolerance>0: widen the winner set to anyone within that RAW distance
    // of the best value instead of requiring an exact 2-decimal match — see
    // MatrixTiebreaker.tolerance for the real gap this closes.
    const bestRounded = Math.round(best * 100) / 100
    pool = withValues
      .filter(c => tb.tolerance
        ? (tb.direction === 'lowest' ? c.value <= best + tb.tolerance : c.value >= best - tb.tolerance)
        : Math.round(c.value * 100) / 100 === bestRounded)
      .map(c => c.name)
  }
  return new Set(pool)
}

// ─── Pipeline runner (pure logic, no data-fetching) ────────────────────
// Same caller/shape convention as the tie/tiebreaker functions above:
// dugout/data/route.ts builds one FieldBundle per player once, then calls
// these to turn a pipeline's ordered steps into a final winners set.

// One raw value for a group/rank step — dispatches to whichever
// computeXxxValue helper applies for that step's category, identical
// dispatch to what route.ts's tie-precompute block used to hand-roll
// inline (resolveTiebreakerValue/rootValue) before this existed.
export function resolveFieldValue(
  category: MatrixFactor['category'],
  fieldKey: string,
  recency: MatrixRecency | null,
  book: string | null,
  bundle: FieldBundle,
  gameTotalPicksByMarket: Record<string, number>,
): number | null {
  if (category === 'odds') return computeOddsRawPrice(fieldKey, book ?? 'fanduel', bundle.props)
  if (category === 'dugout_specs') return computeDugoutSpecsValue(fieldKey, bundle.props, bundle.fhrAvg, bundle.saAvg)
  if (category === 'pitchlog_stat') return computePitchlogStatValue(fieldKey, recency, bundle.pitchlogWindows)
  if (category === 'savant_stat') return computeSavantStatValue(fieldKey, recency, bundle.statcastWindows)
  return computePicksValue(fieldKey, bundle.pikkitEntry, gameTotalPicksByMarket)
}

// A filter step IS a classic Factor condition — built on the fly into the
// exact shape evaluateOddsFactor/evaluateDugoutSpecsFactor/etc. already
// expect, so a Filter step behaves identically to a Factor with the same
// category/field/operator/value (same multi-book books/books_min_count
// combination logic for fhr/hr included, via evaluateOddsFactor itself).
// `id: ''`/`tie_scope: null`/`tiebreakers: null` are inert here — no
// pipeline step's operator is ever 'tied' (the UI never offers it), and
// even if one leaked through, isFactorTied is intentionally omitted below
// so evaluateOddsFactor/evaluateDugoutSpecsFactor's 'tied' branch falls
// back to `?? false`.
export function evaluateFilterStep(
  step: MatrixPipelineStep,
  bundle: FieldBundle,
  gameTotalPicksByMarket: Record<string, number>,
  // Only set when this step is running inside an 'unless' step's
  // condition_steps/then_steps — see MatrixPipelineStep's own comment.
  anchorValue?: number | null,
): boolean {
  if (step.operator === 'lt_anchor' || step.operator === 'gt_anchor') {
    if (anchorValue == null) return false // no anchor in scope — fail safe, not a crash
    const current = resolveFieldValue(step.category, step.field_key, step.recency, step.book, bundle, gameTotalPicksByMarket)
    if (current == null) return false
    return step.operator === 'lt_anchor' ? current < anchorValue : current > anchorValue
  }
  const asFactor: MatrixFactor = {
    id: '', category: step.category, field_key: step.field_key,
    operator: step.operator ?? 'gte', value: step.value,
    recency: step.recency, recency_start: null, recency_end: null,
    books: step.books, books_min_count: step.books_min_count,
    tie_scope: null, tie_direction: null, tiebreakers: null,
  }
  if (step.category === 'odds') return evaluateOddsFactor(asFactor, bundle.props)
  if (step.category === 'dugout_specs') return evaluateDugoutSpecsFactor(asFactor, bundle.props, bundle.fhrAvg, bundle.saAvg)
  if (step.category === 'pitchlog_stat') return evaluatePitchlogFactorPrecomputed(asFactor, bundle.pitchlogWindows)
  if (step.category === 'savant_stat') return evaluateSavantFactor(asFactor, bundle.statcastWindows)
  return evaluatePicksFactor(asFactor, bundle.pikkitEntry, gameTotalPicksByMarket)
}

// Both bundle maps an 'unless' step might need to search OUTSIDE the
// current (possibly team-narrowed) pool — 'team' is whichever full side
// (home or away) the current team-scoped pass is using, 'game' is always
// the full combined map. Every other step kind ignores this entirely.
export type PipelineScopeBundles = { team: Map<string, FieldBundle>; game: Map<string, FieldBundle> }

// Runs ONE step against the current pool. `bundles` is keyed by name_norm
// (same key space `pool` uses) — a name missing from `bundles` simply
// can't pass a filter / can't contribute a value to group-or-rank.
// `strict` (only ever true for an 'unless' step's own condition_steps —
// see runPipeline's 'unless' branch below): group/rank's usual lenient
// "no signal -> pass the pool through unchanged" is exactly backwards
// inside a condition, where "found nothing" has to mean the condition
// genuinely didn't trigger, not "everyone passes." `anchorValue` is only
// ever set the same way, threading an 'unless' step's resolved anchor down
// into nested lt_anchor/gt_anchor filter steps.
export function runPipelineStep(
  pool: Set<string>,
  step: MatrixPipelineStep,
  bundles: Map<string, FieldBundle>,
  gameTotalPicksByMarket: Record<string, number>,
  scopeBundles?: PipelineScopeBundles,
  strict?: boolean,
  anchorValue?: number | null,
): Set<string> {
  if (step.kind === 'filter') {
    const survivors = new Set<string>()
    for (const name of pool) {
      const b = bundles.get(name)
      if (b && evaluateFilterStep(step, b, gameTotalPicksByMarket, anchorValue)) survivors.add(name)
    }
    return survivors
  }
  if (step.kind === 'unless') {
    // No scope info to search elsewhere, or nothing in the incoming pool to
    // anchor against — a no-op rather than a crash.
    if (!scopeBundles || !pool.size) return pool
    const anchorName = pool.values().next().value as string
    const anchorBundle = bundles.get(anchorName)
    const resolvedAnchor = anchorBundle
      ? resolveFieldValue(step.category, step.field_key, step.recency, step.book, anchorBundle, gameTotalPicksByMarket)
      : null

    const universeMap = scopeBundles[step.condition_scope ?? 'team']
    let conditionPool = new Set(universeMap.keys())
    for (const condStep of step.condition_steps ?? []) {
      conditionPool = runPipelineStep(conditionPool, condStep, universeMap, gameTotalPicksByMarket, scopeBundles, true, resolvedAnchor)
    }
    if (!conditionPool.size) return pool // condition didn't trigger -> no-op, original pool continues

    let thenPool = conditionPool
    for (const thenStep of step.then_steps ?? []) {
      thenPool = runPipelineStep(thenPool, thenStep, universeMap, gameTotalPicksByMarket, scopeBundles, false, resolvedAnchor)
    }
    // then_steps somehow emptying out a real, triggered condition shouldn't
    // silently highlight nobody — fall back to the original incoming pool.
    return thenPool.size ? thenPool : pool
  }
  // group/rank are no-ops on an already-singleton (or empty) pool — nothing
  // left to tie or rank against.
  if (pool.size <= 1) return strict ? new Set() : pool
  const resolveValue = (name: string): number | null => {
    const b = bundles.get(name)
    return b ? resolveFieldValue(step.category, step.field_key, step.recency, step.book, b, gameTotalPicksByMarket) : null
  }
  if (step.kind === 'group') {
    const values = new Map<string, number>()
    for (const name of pool) {
      const v = resolveValue(name)
      if (v != null) values.set(name, v)
    }
    const groups = groupTiedCandidates(values)
    const winners = selectTieCluster(groups, step.direction ?? null)
    if (strict) return winners
    return winners.size ? winners : pool // lenient: no ties found -> unchanged
  }
  // rank — resolveTiebreakers already implements exactly this ("keep
  // whoever's best on one field"); called with a single-step chain.
  const tb: MatrixTiebreaker = { category: step.category, field_key: step.field_key, recency: step.recency, book: step.book, direction: step.direction ?? 'highest', tolerance: step.tolerance ?? null }
  const survivors = resolveTiebreakers([...pool], [tb], name => resolveValue(name))
  if (strict) return survivors
  return survivors.size ? survivors : pool // lenient: nobody had a value -> unchanged
}

export function runPipeline(
  universe: Set<string>,
  steps: MatrixPipelineStep[],
  bundles: Map<string, FieldBundle>,
  gameTotalPicksByMarket: Record<string, number>,
  scopeBundles?: PipelineScopeBundles,
): Set<string> {
  let pool = universe
  for (const step of steps) pool = runPipelineStep(pool, step, bundles, gameTotalPicksByMarket, scopeBundles)
  return pool
}
