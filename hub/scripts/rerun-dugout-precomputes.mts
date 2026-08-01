// One-off: re-runs today's Dugout precompute crons (statcast, matchup-edge
// aka "Paper", pitchlog_stat, season-avg) for their normal trailing window
// now that player_pitch_log has been backfilled for 2026-07-30/07-31 — the
// crons already ran once today against the stale pitch log (see
// diagnose-pitch-log-gap.mjs), so their tables need a fresh pass to reflect
// the fix without waiting for tomorrow's scheduled run.
import { precomputeDugoutStatcastForDate } from '../src/lib/dugoutStatcastPrecompute'
import { precomputeMatchupEdgeForDate } from '../src/lib/dugoutMatchupEdgePrecompute'
import { precomputeDugoutPitchlogStatForDate } from '../src/lib/dugoutPitchlogStatPrecompute'
import { precomputeDugoutSeasonAvgForDate } from '../src/lib/dugoutSeasonAvgPrecompute'

const DATES = ['2026-08-01', '2026-07-31', '2026-07-30']

for (const date of DATES) {
  console.log(`\n=== ${date} ===`)
  for (const [name, fn] of [
    ['statcast', () => precomputeDugoutStatcastForDate(date)],
    ['matchup-edge (Paper)', () => precomputeMatchupEdgeForDate(date)],
    ['pitchlog-stat', () => precomputeDugoutPitchlogStatForDate(date)],
    ['season-avg', () => precomputeDugoutSeasonAvgForDate(date)],
  ] as const) {
    try {
      const result = await fn()
      console.log(`  [${name}] OK`, JSON.stringify(result))
    } catch (e: any) {
      console.error(`  [${name}] FAILED`, e?.message || e)
    }
  }
}
