import { computeStatLine, type PitchLogRow } from '@/lib/batterStatsEngine'
import { sliceRecencyWindow, effectiveBatSide, weightedSavantMetric, type SavantSplitRow, type MatrixRecency } from '@/lib/matrixEngine'

// The Dugout grid's own "Statcast" section (BSpd through HR, plus Timing/
// Miss) — previously sourced from mlb-party's third-party proxy
// (batter_statcast_splits/batter_timing_splits: season + one fixed ~6-day
// "recent" window, no per-player game-count precision). Now computed
// in-house from the exact same real data Custom Matrix already trusts:
// player_pitch_log for anything derivable from raw pitches (exact last-N-
// games-played, not a calendar-day guess), and our own synced
// player_statcast_splits for the handful of metrics only Savant's own
// bat-tracking model produces. Same underlying Savant numbers for those,
// just read from data we sync ourselves with real L1/L3/L5/L10 windows
// instead of mlb-party's single fixed window.

export const STATCAST_WINDOWS = ['season', 'l1', 'l3', 'l5', 'l10'] as const
export type StatcastWindow = typeof STATCAST_WINDOWS[number]

export type StatcastLine = {
  avgBatSpeed: number | null
  avgAttackAngle: number | null
  avgSwingLength: number | null
  avgTilt: number | null
  barrelPct: number | null
  hardHitPct: number | null
  avgEv: number | null
  avgLa: number | null
  hr: number | null
  hardSwingRate: number | null
  squaredUpPct: number | null
  blastPct: number | null
  idealAttackAngleRate: number | null
  pullAirRate: number | null
  fbRate: number | null
  onTimePct: number | null
  missDistance: number | null
}

// sliceRecencyWindow (matrixEngine.ts) speaks the older 'game'|'l3'|'l5'|
// 'l10'|'season' vocabulary; player_statcast_splits' own window_type column
// is 'l1'|'l3'|'l5'|'l10'|'season'. Same real windows, two different names
// for the "last 1" case — this maps between them rather than picking one
// and silently mismatching the other.
const STATCAST_TO_PITCHLOG_RECENCY: Record<StatcastWindow, MatrixRecency> = {
  season: 'season', l1: 'game', l3: 'l3', l5: 'l5', l10: 'l10',
}

const SAVANT_RATE_FIELD: { key: keyof StatcastLine; category: string; metric: string }[] = [
  { key: 'hardSwingRate', category: 'bat_tracking', metric: 'hard_swing_rate' },
  { key: 'squaredUpPct', category: 'bat_tracking', metric: 'squared_up_per_swing' },
  { key: 'blastPct', category: 'bat_tracking', metric: 'blast_per_swing' },
  { key: 'idealAttackAngleRate', category: 'swing_path_attack_angle', metric: 'ideal_attack_angle_rate' },
  { key: 'pullAirRate', category: 'batted_ball_splits', metric: 'pull_air_rate' },
  { key: 'fbRate', category: 'batted_ball_splits', metric: 'fb_rate' },
]

export function computeStatcastLine(
  pitchRows: PitchLogRow[],
  savantRows: SavantSplitRow[],
  bats: string | null | undefined,
  pitcherHand: 'L' | 'R',
  asOfDate: string,
  window: StatcastWindow,
): StatcastLine {
  const pitchWindow = sliceRecencyWindow(pitchRows, pitcherHand, STATCAST_TO_PITCHLOG_RECENCY[window], null, null, asOfDate)
  const line = computeStatLine(pitchWindow)
  const batSide = effectiveBatSide(bats, pitcherHand)

  const savant: Record<string, number | null> = {}
  for (const f of SAVANT_RATE_FIELD) {
    // Every one of these 6 is a 0-1 fraction in Savant's own export
    // (confirmed live). Left UNSCALED here — the client renders every one
    // of these via pp() (DugoutClient.tsx), which already does its own
    // ×100 for display, same as the odds/matchup tables' every other 0-1
    // rate field. Scaling here too double-multiplied every value by 100
    // AGAIN on render (confirmed live: a real onTimePct of 0.767 was
    // rendering as 7668.7 — 0.767 × 100 × 100), reported live as "the
    // numbers are WAY whacky." barrelPct/hardHitPct are a different case:
    // computeStatLine() (batterStatsEngine.ts) already returns those as
    // real 0-100 values, and the client renders them via ppRaw() (no
    // further scaling) — that pairing was already correct.
    savant[f.key] = weightedSavantMetric(savantRows, f.category, window, batSide, pitcherHand, f.metric)
  }
  // on_time_percent is the same 0-1-fraction convention as the 6 above —
  // same reasoning, left unscaled. miss_distance is a real physical
  // distance (confirmed live, ~0.9-1.4 feet), not a rate — always unscaled.
  const onTimePct = weightedSavantMetric(savantRows, 'swing_timing_miss_distance', window, batSide, pitcherHand, 'on_time_percent')
  const missDistance = weightedSavantMetric(savantRows, 'swing_timing_miss_distance', window, batSide, pitcherHand, 'miss_distance')

  return {
    avgBatSpeed: line.avgBatSpeed, avgAttackAngle: line.avgAttackAngle, avgSwingLength: line.avgSwingLength,
    avgTilt: line.avgTilt, barrelPct: line.barrelPct, hardHitPct: line.hardHitPct,
    avgEv: line.avgEv, avgLa: line.avgLa, hr: line.hr,
    hardSwingRate: savant.hardSwingRate, squaredUpPct: savant.squaredUpPct, blastPct: savant.blastPct,
    idealAttackAngleRate: savant.idealAttackAngleRate, pullAirRate: savant.pullAirRate, fbRate: savant.fbRate,
    onTimePct,
    missDistance,
  }
}

// All 5 windows at once — the Dugout page precomputes every window server-
// side so the client-side recency toggle is instant (switch which already-
// computed window's numbers render) instead of a re-fetch/recompute per click.
export function computeAllStatcastWindows(
  pitchRows: PitchLogRow[],
  savantRows: SavantSplitRow[],
  bats: string | null | undefined,
  pitcherHand: 'L' | 'R',
  asOfDate: string,
): Record<StatcastWindow, StatcastLine> {
  const out = {} as Record<StatcastWindow, StatcastLine>
  for (const w of STATCAST_WINDOWS) out[w] = computeStatcastLine(pitchRows, savantRows, bats, pitcherHand, asOfDate, w)
  return out
}
