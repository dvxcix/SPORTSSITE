import { createAdminClient } from '@/lib/supabase/admin'
import { getTodaysMatchups } from '@slipsurge/core/mlbSchedule'
import { fetchBulkBatterPitchRows } from '@/lib/matrixMatch'
import { computeAllPitchlogStatWindows, type PitchlogStatWindow } from '@slipsurge/core/matrixEngine'
import type { BatterStats } from '@slipsurge/core/batterStatsEngine'

// Precomputes Custom Matrix's pitchlog_stat category (whiff%/chase%/hard-
// hit%/barrel%/HR/etc, real "last N games played" windows — see
// evaluatePitchlogFactorPrecomputed in matrixEngine.ts for the full
// incident this fixes) for a whole date, ONCE, instead of every Ultimate
// member's own request re-fetching a full season of raw pitches per
// batter. Exact same pattern as dugoutStatcastPrecompute.ts's savant_stat
// table — a batter's per-pitch data doesn't change until the next day's
// synced pitch-log cron runs, so there's no reason this should ever be
// computed live in the request path.
export const DUGOUT_PITCHLOG_STAT_TABLE = 'dugout_pitchlog_stat_precomputed'

export async function precomputeDugoutPitchlogStatForDate(date: string): Promise<{ date: string; batters: number; rows: number }> {
  // Same confirmed-∪-projected lineup resolution the Statcast precompute
  // and the Dugout grid itself use — covers every batter it could ever
  // need to look up, whether or not lineups have posted yet.
  const games = await getTodaysMatchups(date)
  const batterIds = new Set<number>()
  for (const g of games) {
    for (const p of [...g.homeLineup, ...g.awayLineup]) batterIds.add(p.mlb_id)
  }
  const ids = Array.from(batterIds)
  if (!ids.length) return { date, batters: 0, rows: 0 }

  const admin = createAdminClient()
  const pitchRowsByBatter = await fetchBulkBatterPitchRows(admin, ids)

  // Both possible opposing-pitcher hands, not just today's actual probable
  // starters — same reasoning as the Statcast precompute: a late pitcher
  // swap then just reads the other hand's already-precomputed row instead
  // of needing a re-run.
  const rows: { game_date: string; mlb_id: number; pitcher_hand: 'L' | 'R'; windows: Record<PitchlogStatWindow, BatterStats> }[] = []
  for (const mlbId of ids) {
    const pitchRows = pitchRowsByBatter[mlbId] ?? []
    for (const hand of ['L', 'R'] as const) {
      rows.push({ game_date: date, mlb_id: mlbId, pitcher_hand: hand, windows: computeAllPitchlogStatWindows(pitchRows, hand, date) })
    }
  }

  const CHUNK = 500
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await admin
      .from(DUGOUT_PITCHLOG_STAT_TABLE)
      .upsert(rows.slice(i, i + CHUNK), { onConflict: 'game_date,mlb_id,pitcher_hand' })
    if (error) throw error
  }
  return { date, batters: ids.length, rows: rows.length }
}
