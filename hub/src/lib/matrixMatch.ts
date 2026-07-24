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

// Bulk-fetch every pitch this SPECIFIC set of batters has seen all season,
// grouped by batter_id — one paginated query total instead of one query per
// batter (which is what fetchPlayerPitchRows in pitchLogFetch.ts does, and
// is fine for a single player's own page but would be a real N+1 across an
// entire slate here). Caller is expected to wrap this in unstable_cache
// keyed by date, since the result is identical for every member viewing the
// same date — only the per-member Matrix evaluation below differs.
export async function fetchBulkBatterPitchRows(admin: AdminClient, batterIds: number[]): Promise<Record<number, any[]>> {
  const byBatter: Record<number, any[]> = {}
  if (!batterIds.length) return byBatter
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from('player_pitch_log')
      .select(BULK_PITCHLOG_SELECT)
      .in('batter_id', batterIds)
      .order('batter_id', { ascending: true })
      .order('game_date', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw error
    if (!data?.length) break
    for (const r of data as any[]) {
      const row = {
        game_date: r.game_date, batter_id: r.batter_id, events: r.events, description: r.description,
        is_in_play: r.is_in_play, is_swing: r.is_swing, is_whiff: r.is_whiff,
        launch_speed: numOrNull(r.launch_speed), launch_angle: numOrNull(r.launch_angle),
        xwoba: numOrNull(r.xwoba), run_value: numOrNull(r.run_value), bat_speed: numOrNull(r.bat_speed),
        p_throws: r.p_throws,
        attack_angle: numOrNull(r.attack_angle), swing_length: numOrNull(r.swing_length),
        swing_path_tilt: numOrNull(r.swing_path_tilt), attack_direction: numOrNull(r.attack_direction),
        launch_speed_angle: numOrNull(r.launch_speed_angle),
      }
      ;(byBatter[r.batter_id] ??= []).push(row)
    }
    if (data.length < PAGE) break
  }
  return byBatter
}

// Bulk-fetch player_statcast_splits rows for exactly the (mlb_id, category)
// pairs the caller's Matrices actually reference — scoped narrower than "every
// category for every batter" since a member with zero Savant-model Factors
// (Hard-Swing%/Squared-Up%/Blast%/Ideal-Attack-Angle%/pull-air/fly-ball rate)
// shouldn't pay for this query at all.
export async function fetchBulkSavantSplits(admin: AdminClient, mlbIds: number[], categories: string[]): Promise<Record<number, any[]>> {
  const byId: Record<number, any[]> = {}
  if (!mlbIds.length || !categories.length) return byId
  const { data, error } = await admin
    .from('player_statcast_splits')
    .select('mlb_id, category, window_type, dims, metrics')
    .eq('role', 'batter')
    .in('mlb_id', mlbIds)
    .in('category', categories)
  if (error) throw error
  for (const r of data ?? []) {
    (byId[r.mlb_id as number] ??= []).push(r)
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
