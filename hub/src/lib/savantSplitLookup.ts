// Per-pitch-type lookup over a batter's own synced Savant bat-tracking
// splits (player_statcast_splits) — the 4 metrics that are genuinely
// Savant-model-only and can't be recomputed from raw pitch-log rows
// (Hard-Swing%, Squared-Up%, Blast%, Ideal-Attack-Angle%). Everything else
// batter-vs-pitcher-mix already shows (bat speed, attack angle, swing
// length, barrel%) comes straight off computeStatLine in batterStatsEngine.ts
// instead, computed in-house with an exact last-N-games-played window — see
// matrixEngine.ts's own header comment for the full split.
export type SavantSplitRow = {
  category: string
  window_type: string
  dims: Record<string, string | number>
  metrics: Record<string, number | string | null>
}

const WEIGHT_FIELD: Record<string, string> = {
  bat_tracking: 'swings_competitive',
  swing_path_attack_angle: 'competitive_swings',
}

// Weighted average across whatever contact-type rows match this exact
// (pitch type, bat side, pitch hand, window) — same reasoning as
// matrixEngine's evaluateSavantFactor: a 1-swing outlier split shouldn't
// count the same as a 40-swing one.
export function lookupSavantMetric(
  rows: SavantSplitRow[],
  category: 'bat_tracking' | 'swing_path_attack_angle',
  windowType: string,
  pitchType: string,
  batSide: 'L' | 'R',
  pitcherHand: 'L' | 'R',
  metric: string,
): number | null {
  const weightKey = WEIGHT_FIELD[category]
  const matching = rows.filter(r =>
    r.category === category && r.window_type === windowType &&
    r.dims.api_pitch_type === pitchType && r.dims.bat_side === batSide && r.dims.pitch_hand === pitcherHand
  )
  let sum = 0, weight = 0
  for (const r of matching) {
    const m = r.metrics[metric]
    const w = r.metrics[weightKey]
    if (typeof m !== 'number' || typeof w !== 'number' || w <= 0) continue
    sum += m * w
    weight += w
  }
  return weight > 0 ? sum / weight : null
}

// Blends the lookup across whatever pitcher hand(s) actually make up the
// rows being shown for this pitch type — weighted by real observed pitch
// count, not a single assumed hand. Correct for every scope this table
// offers: a hand-filtered scope naturally has only one hand present (pure
// single-hand lookup falls out automatically); an unfiltered/"Vs. This
// Team" scope genuinely mixes both, and blending by real count is the
// honest answer rather than guessing one side. A switch hitter's effective
// bat side is re-resolved per hand bucket (always opposite that bucket's
// pitcher hand), not once for the whole row — his side really does differ
// between the two buckets being blended.
export function lookupSavantMetricBlended(
  rows: SavantSplitRow[],
  category: 'bat_tracking' | 'swing_path_attack_angle',
  windowType: string,
  pitchType: string,
  bats: string | null | undefined,
  pitchesSeenThisType: { p_throws: string | null }[],
  metric: string,
): number | null {
  const countByHand: Record<'L' | 'R', number> = { L: 0, R: 0 }
  for (const r of pitchesSeenThisType) {
    if (r.p_throws === 'L' || r.p_throws === 'R') countByHand[r.p_throws]++
  }
  let sum = 0, weight = 0
  for (const hand of ['L', 'R'] as const) {
    const n = countByHand[hand]
    if (!n) continue
    const batSide = bats === 'S' ? (hand === 'L' ? 'R' : 'L') : (bats === 'L' ? 'L' : 'R')
    const v = lookupSavantMetric(rows, category, windowType, pitchType, batSide, hand, metric)
    if (v == null) continue
    sum += v * n
    weight += n
  }
  return weight > 0 ? sum / weight : null
}

// Batter Cost's own recency-scope keys ('season' | '1' | '3' | '5' | '10' |
// 'vsPitcher' | 'vsTeam') don't line up 1:1 with player_statcast_splits'
// window_type ('season' | 'recency' | 'l1' | 'l3' | 'l5' | 'l10') — 'vs This
// Pitcher'/'vs This Team' have no Savant-side analog (that leaderboard has
// no per-opponent filter), so both fall back to 'season' rather than
// matching nothing.
export function batterScopeToSavantWindow(scope: string): string {
  if (scope === '1') return 'l1'
  if (scope === '3') return 'l3'
  if (scope === '5') return 'l5'
  if (scope === '10') return 'l10'
  return 'season'
}
