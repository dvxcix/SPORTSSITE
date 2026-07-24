import { createAdminClient } from '@/lib/supabase/admin'
import { getTodaysMatchups } from '@/lib/mlbSchedule'
import { fetchBulkBatterPitchRows, fetchBulkSavantSplits } from '@/lib/matrixMatch'
import { computeAllStatcastWindows, type StatcastWindow, type StatcastLine } from '@/lib/dugoutStatcast'

// Precomputes the Dugout grid's own Statcast section (BSpd through HR, plus
// Timing/Miss, HardSw/SQ/Blast, IdlAA, Pull/FB rate — see dugoutStatcast.ts)
// for a whole date, ONCE, instead of aggregating it live on every single
// page request. Real incident (2026-07-24): the underlying per-batter
// fetch is fine in isolation (confirmed ~150-330ms/batter via EXPLAIN
// ANALYZE), but running that same fan-out from EVERY concurrent viewer's
// own request piled up real contention against Postgres — even after
// caching the date-level lineup resolution, the FIRST request of any
// cache-miss window still had to do the full aggregation live, and under
// real multi-user load that alone was enough to blow past the 2-minute
// statement_timeout. This data doesn't change until the next day's synced
// pitch-log/Savant-split crons run anyway, so there's no reason it should
// ever be computed in the request path at all — a cron writes it here
// once, and dugout/data/route.ts just does a plain indexed SELECT.
export const DUGOUT_STATCAST_TABLE = 'dugout_statcast_precomputed'

const ALL_STATCAST_SAVANT_CATEGORIES = ['bat_tracking', 'batted_ball_splits', 'swing_path_attack_angle', 'swing_timing_miss_distance']

export async function precomputeDugoutStatcastForDate(date: string): Promise<{ date: string; batters: number; rows: number }> {
  // Confirmed-or-projected lineups for every game today — the exact same
  // resolution the Dugout grid itself displays, so this covers every
  // batter it could ever need to look up, whether or not lineups have
  // posted yet.
  const games = await getTodaysMatchups(date)
  const batsById = new Map<number, string>()
  for (const g of games) {
    for (const p of [...g.homeLineup, ...g.awayLineup]) {
      if (!batsById.has(p.mlb_id)) batsById.set(p.mlb_id, p.bats || '?')
    }
  }
  const batterIds = Array.from(batsById.keys())
  if (!batterIds.length) return { date, batters: 0, rows: 0 }

  const admin = createAdminClient()
  const [pitchRowsByBatter, savantRowsByBatter] = await Promise.all([
    fetchBulkBatterPitchRows(admin, batterIds),
    fetchBulkSavantSplits(admin, batterIds, ALL_STATCAST_SAVANT_CATEGORIES),
  ])

  // Both possible opposing-pitcher hands, not just today's actual probable
  // starters — a late pitcher swap (a real, common occurrence) then just
  // reads the OTHER hand's already-precomputed row instead of needing a
  // re-run. The raw pitch-log/Savant rows fetched above are hand-agnostic
  // (one fetch per batter covers both), so this only doubles the cheap
  // in-memory aggregation step, not the real DB read cost.
  const rows: { game_date: string; mlb_id: number; pitcher_hand: 'L' | 'R'; windows: Record<StatcastWindow, StatcastLine> }[] = []
  for (const mlbId of batterIds) {
    const bats = batsById.get(mlbId) || '?'
    const pitchRows = pitchRowsByBatter[mlbId] ?? []
    const savantRows = savantRowsByBatter[mlbId] ?? []
    for (const hand of ['L', 'R'] as const) {
      rows.push({ game_date: date, mlb_id: mlbId, pitcher_hand: hand, windows: computeAllStatcastWindows(pitchRows, savantRows, bats, hand, date) })
    }
  }

  const CHUNK = 500
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await admin
      .from(DUGOUT_STATCAST_TABLE)
      .upsert(rows.slice(i, i + CHUNK), { onConflict: 'game_date,mlb_id,pitcher_hand' })
    if (error) throw error
  }
  return { date, batters: batterIds.length, rows: rows.length }
}
