import { createAdminClient } from '@/lib/supabase/admin'
import { getTodaysMatchups } from '@slipsurge/core/mlbSchedule'
import { fetchBulkBatterPitchRows, fetchBulkSavantSplits } from '@/lib/matrixMatch'
import { computeAllStatcastWindows, type StatcastWindow, type StatcastLine } from '@slipsurge/core/dugoutStatcast'
import { priorPregameDate } from '@/lib/pregameFeatureDate'
import { isHistoricalDugoutDate } from '@/lib/dugoutBoardDate'

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

// A row dated D is the board that will be shown before games on D. Its
// recency windows must therefore stop at D-1. Today may refresh as source
// data arrives. Historical boards are immutable snapshots: the self-heal
// may fill a missing batter/hand row, but it never rewrites one that already
// existed for that date.
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
  const historical = isHistoricalDugoutDate(date)
  const existingKeys = new Set<string>()
  if (historical) {
    const { data: existing, error: existingError } = await admin
      .from(DUGOUT_STATCAST_TABLE)
      .select('mlb_id,pitcher_hand')
      .eq('game_date', date)
      .in('mlb_id', batterIds)
    if (existingError) throw existingError
    for (const row of existing ?? []) existingKeys.add(`${Number(row.mlb_id)}:${String(row.pitcher_hand)}`)
  }

  const batterIdsToCompute = historical
    ? batterIds.filter(mlbId => !existingKeys.has(`${mlbId}:L`) || !existingKeys.has(`${mlbId}:R`))
    : batterIds
  if (!batterIdsToCompute.length) return { date, batters: batterIds.length, rows: batterIds.length * 2 }

  const [pitchRowsByBatter, savantRowsByBatter] = await Promise.all([
    fetchBulkBatterPitchRows(admin, batterIdsToCompute),
    fetchBulkSavantSplits(admin, batterIdsToCompute, ALL_STATCAST_SAVANT_CATEGORIES),
  ])

  // Both possible opposing-pitcher hands, not just today's actual probable
  // starters — a late pitcher swap (a real, common occurrence) then just
  // reads the OTHER hand's already-precomputed row instead of needing a
  // re-run. The raw pitch-log/Savant rows fetched above are hand-agnostic
  // (one fetch per batter covers both), so this only doubles the cheap
  // in-memory aggregation step, not the real DB read cost.
  const rows: { game_date: string; mlb_id: number; pitcher_hand: 'L' | 'R'; windows: Record<StatcastWindow, StatcastLine>; computed_at: string }[] = []
  const dataThroughDate = priorPregameDate(date)
  const computedAt = new Date().toISOString()
  for (const mlbId of batterIdsToCompute) {
    const bats = batsById.get(mlbId) || '?'
    const pitchRows = pitchRowsByBatter[mlbId] ?? []
    const savantRows = savantRowsByBatter[mlbId] ?? []
    for (const hand of ['L', 'R'] as const) {
      if (existingKeys.has(`${mlbId}:${hand}`)) continue
      rows.push({ game_date: date, mlb_id: mlbId, pitcher_hand: hand, windows: computeAllStatcastWindows(pitchRows, savantRows, bats, hand, dataThroughDate), computed_at: computedAt })
    }
  }

  const CHUNK = 500
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await admin
      .from(DUGOUT_STATCAST_TABLE)
      .upsert(rows.slice(i, i + CHUNK), {
        onConflict: 'game_date,mlb_id,pitcher_hand',
        ignoreDuplicates: historical,
      })
    if (error) throw error
  }
  return { date, batters: batterIds.length, rows: historical ? batterIds.length * 2 : rows.length }
}
