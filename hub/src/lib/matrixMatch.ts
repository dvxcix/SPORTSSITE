import { createAdminClient } from '@/lib/supabase/admin'
import {
  evaluateMatrix, evaluatePitchlogFactor, evaluateSavantFactor, evaluateOddsFactor, evaluateDugoutSpecsFactor, evaluatePicksFactor, effectiveBatSide,
  type Matrix, type MatrixFactor, type DugoutSpecsAverages,
} from '@/lib/matrixEngine'

type AdminClient = ReturnType<typeof createAdminClient>

// A member's saved Matrices + Factors, once per request (not per-batter) —
// small (≤10 Matrices, ≤40 Factors each per the app-level + DB-trigger cap),
// safe to always fetch for a signed-in Ultimate caller regardless of
// whether any Factor actually needs the heavier bulk data fetched below.
export async function fetchUserMatrices(admin: AdminClient, userId: string): Promise<Matrix[]> {
  const { data: matrices } = await admin
    .from('matrices')
    .select('id, name, color, priority, match_mode, match_any_count')
    .eq('user_id', userId)
    .order('priority', { ascending: true })
  if (!matrices?.length) return []

  const { data: factors } = await admin
    .from('matrix_factors')
    .select('id, matrix_id, category, field_key, operator, value, recency, recency_start, recency_end, books, books_min_count')
    .in('matrix_id', matrices.map(m => m.id))
    .order('position', { ascending: true })

  const byMatrix = new Map<string, MatrixFactor[]>()
  for (const f of factors ?? []) {
    const arr = byMatrix.get(f.matrix_id as string) ?? []
    arr.push(f as unknown as MatrixFactor)
    byMatrix.set(f.matrix_id as string, arr)
  }
  return matrices.map(m => ({ ...m, factors: byMatrix.get(m.id) ?? [] })) as unknown as Matrix[]
}

// Columns actually read by computeStatLine/matrixEngine — the `raw` jsonb
// blob itself is never selected; the handful of swing-path/contact-quality
// fields buried in it are pulled out via PostgREST's `->` path operator
// instead, which cuts payload size enormously at full-slate scale (a
// day's lineups run ~250-300 batters, full season-to-date pitch-by-pitch).
const BULK_PITCHLOG_SELECT = [
  'game_date', 'batter_id', 'events', 'description', 'is_in_play', 'is_swing', 'is_whiff',
  'launch_speed', 'launch_angle', 'xwoba', 'run_value', 'bat_speed', 'p_throws',
  'raw->attack_angle', 'raw->swing_length', 'raw->swing_path_tilt', 'raw->attack_direction', 'raw->launch_speed_angle',
].join(', ')

function numOrNull(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function mapPitchLogRow(r: any) {
  return {
    game_date: r.game_date, batter_id: r.batter_id, events: r.events, description: r.description,
    is_in_play: r.is_in_play, is_swing: r.is_swing, is_whiff: r.is_whiff,
    launch_speed: numOrNull(r.launch_speed), launch_angle: numOrNull(r.launch_angle),
    xwoba: numOrNull(r.xwoba), run_value: numOrNull(r.run_value), bat_speed: numOrNull(r.bat_speed),
    p_throws: r.p_throws,
    attack_angle: numOrNull(r.attack_angle), swing_length: numOrNull(r.swing_length),
    swing_path_tilt: numOrNull(r.swing_path_tilt), attack_direction: numOrNull(r.attack_direction),
    launch_speed_angle: numOrNull(r.launch_speed_angle),
  }
}

// Bulk-fetch every pitch this SPECIFIC set of batters has seen all season,
// grouped by batter_id.
//
// Confirmed live (2026-07-24), across three failed approaches before this
// one, exactly why a combined-IN-list-with-pagination design can't work
// here at all: the daily lineup batter set is ~250-300 players, each with
// ~1,000-1,500 pitches season-to-date (a few hundred thousand rows total).
// (1) Sequential one-page-at-a-time fetching (the original design) blew
// past this route's 60s maxDuration once Statcast made this run on every
// Ultimate load instead of rarely. (2) An exact-count HEAD query, added to
// enable concurrent pagination, was itself cancelled by Postgres — a real
// `57014 statement timeout` — since COUNT(*) over this large a match set is
// exactly as expensive as scanning it. (3) Dropping the count AND the
// now-provably-unneeded ORDER BY (lastNGameDates in batterStatsEngine.ts
// sorts its own distinct dates internally regardless of input order) still
// hit the SAME statement timeout — confirmed via EXPLAIN ANALYZE the actual
// cost driver was OFFSET itself: Postgres can't skip N already-matched rows
// without first finding and discarding all of them, so a page at OFFSET
// 150000 took 5+ seconds all on its own, cost scaling with how deep the
// page is. There is no page-based fix for that; the fetch shape had to
// change entirely.
//
// Fetching per-batter instead sidesteps it: EXPLAIN ANALYZE on a single
// real batter_id (no OFFSET at all, one Index Scan on the existing
// (batter_id, game_date) index) returned a full season — 2,068 rows for one
// of this year's highest-volume hitters — in 333ms cold. Multiplied across
// ~280 batters at real concurrency, that's the same total work this always
// needed, just shaped as N fast independent lookups instead of one query
// whose own OFFSET cost grows the deeper it pages. A generous per-batter
// range (5000) guards against PostgREST's own default response-row cap
// silently truncating a real player's season — no real hitter approaches
// that pitch count.
export async function fetchBulkBatterPitchRows(admin: AdminClient, batterIds: number[]): Promise<Record<number, any[]>> {
  const byBatter: Record<number, any[]> = {}
  if (!batterIds.length) return byBatter
  const CONCURRENCY = 15
  const MAX_PITCHES_PER_BATTER = 5000

  for (let i = 0; i < batterIds.length; i += CONCURRENCY) {
    const chunk = batterIds.slice(i, i + CONCURRENCY)
    const results = await Promise.all(chunk.map(id =>
      admin
        .from('player_pitch_log')
        .select(BULK_PITCHLOG_SELECT)
        .eq('batter_id', id)
        .range(0, MAX_PITCHES_PER_BATTER - 1)
    ))
    for (const { data, error } of results) {
      if (error) throw error
      for (const r of (data ?? []) as any[]) {
        (byBatter[r.batter_id] ??= []).push(mapPitchLogRow(r))
      }
    }
  }
  return byBatter
}

// Bulk-fetch player_statcast_splits rows for exactly the (mlb_id, category)
// pairs the caller's Matrices actually reference.
//
// Confirmed live (2026-07-24): this table has 125,826 rows across just 602
// distinct batters for these 4 categories — a full day's ~280 lineup
// batters scales to roughly 58,000 matching rows. The original single
// `.in('mlb_id', mlbIds)` query with no `.range()` at all hit the exact
// same class of bug as fetchBulkBatterPitchRows, just silently instead of
// with a timeout: PostgREST's own default response-row cap truncated the
// result long before all 280 batters' rows were included, and since there
// was no error, no `.catch()` ever caught it — the Statcast section's
// Savant-derived fields (Timing/Miss, HardSw/SQ/Blast, IdlAA, Pull/FB rate)
// just went blank for nearly every batter with zero signal anything had
// gone wrong. Fetching per mlb_id instead (same fix as the pitch-log bulk
// read) uses the real (mlb_id, role, category, window_type, dims_key)
// index directly — ~209 rows/batter on average across all 4 categories,
// comfortably under any row cap, no pagination needed per player at all.
export async function fetchBulkSavantSplits(admin: AdminClient, mlbIds: number[], categories: string[]): Promise<Record<number, any[]>> {
  const byId: Record<number, any[]> = {}
  if (!mlbIds.length || !categories.length) return byId
  const CONCURRENCY = 15
  const MAX_ROWS_PER_BATTER = 2000

  for (let i = 0; i < mlbIds.length; i += CONCURRENCY) {
    const chunk = mlbIds.slice(i, i + CONCURRENCY)
    const results = await Promise.all(chunk.map(id =>
      admin
        .from('player_statcast_splits')
        .select('mlb_id, category, window_type, dims, metrics')
        .eq('role', 'batter')
        .eq('mlb_id', id)
        .in('category', categories)
        .range(0, MAX_ROWS_PER_BATTER - 1)
    ))
    for (const { data, error } of results) {
      if (error) throw error
      for (const r of data ?? []) {
        (byId[r.mlb_id as number] ??= []).push(r)
      }
    }
  }
  return byId
}

export type MatrixMatch = { id: string; name: string; color: string; priority: number }

const SAVANT_CATEGORY_BY_FIELD_KEY: Record<string, string> = {
  hardsw: 'bat_tracking', sq: 'bat_tracking', blast: 'bat_tracking',
  idlaa: 'swing_path_attack_angle', pullair: 'batted_ball_splits', fb: 'batted_ball_splits',
}

export function savantCategoriesUsed(matrices: Matrix[]): string[] {
  const cats = new Set<string>()
  for (const m of matrices) for (const f of m.factors) {
    if (f.category === 'savant_stat') {
      const cat = SAVANT_CATEGORY_BY_FIELD_KEY[f.field_key]
      if (cat) cats.add(cat)
    }
  }
  return Array.from(cats)
}

export function pitchlogNeeded(matrices: Matrix[]): boolean {
  return matrices.some(m => m.factors.some(f => f.category === 'pitchlog_stat'))
}

export type MatrixMatchContext = {
  fhrAvg?: DugoutSpecsAverages | null
  saAvg?: DugoutSpecsAverages | null
  pikkitEntry?: Record<string, { picks?: number | null } | undefined> | null
  gameTotalPicksByMarket?: Record<string, number>
}

// Evaluates every one of a member's Matrices against ONE batter for ONE
// specific game (handedness is matchup-specific — a switch hitter's
// effective side, and which pitcher hand every Factor checks against,
// depends on who they're actually facing tonight). Returns every Matrix
// that lit up, highest-priority first, so the UI can show the top color as
// the row's primary highlight while still surfacing every match.
export function evaluateBatterMatrices(
  matrices: Matrix[],
  bats: string | null | undefined,
  pitcherHand: 'L' | 'R',
  batterPitchRows: any[],
  savantSplitRows: any[],
  props: any,
  asOfDate: string,
  context: MatrixMatchContext = {},
): MatrixMatch[] {
  if (!matrices.length) return []
  const batSide = effectiveBatSide(bats, pitcherHand)
  const matches: MatrixMatch[] = []
  for (const matrix of matrices) {
    const ok = evaluateMatrix(matrix, (factor: MatrixFactor) => {
      if (factor.category === 'odds') return evaluateOddsFactor(factor, props)
      if (factor.category === 'dugout_specs') return evaluateDugoutSpecsFactor(factor, props, context.fhrAvg, context.saAvg)
      if (factor.category === 'pitchlog_stat') return evaluatePitchlogFactor(factor, batterPitchRows, pitcherHand, asOfDate)
      if (factor.category === 'savant_stat') return evaluateSavantFactor(factor, savantSplitRows, batSide, pitcherHand)
      if (factor.category === 'picks') return evaluatePicksFactor(factor, context.pikkitEntry, context.gameTotalPicksByMarket ?? {})
      return false
    })
    if (ok) matches.push({ id: matrix.id, name: matrix.name, color: matrix.color, priority: matrix.priority })
  }
  return matches
}
