import type { SupabaseClient } from '@supabase/supabase-js'

export const MATRIX_FACTOR_SELECT = 'position, category, field_key, operator, value, recency, recency_start, recency_end, books, books_min_count, tie_scope, tie_direction, tiebreakers, mm_base_window, mm_compare_windows, mm_direction, mm_match_mode, mm_amount_mode'
export const MATRIX_STEP_SELECT = 'position, kind, join_mode, category, field_key, recency, book, books, books_min_count, operator, value, direction, tolerance, zero_eligible, condition_scope, condition_steps, then_steps, unless_mode, uses_anchor, mm_base_window, mm_compare_windows, mm_direction, mm_match_mode, mm_amount_mode'

export type MarketplaceMatrixSnapshot = {
  version: 1
  name: string
  color: string
  element_code: string
  matrix_type: 'classic' | 'pipeline'
  match_mode: string
  match_any_count: number | null
  pipeline_scope: string | null
  factors: Record<string, unknown>[]
  pipeline_steps: Record<string, unknown>[]
}

export async function snapshotOwnedMatrix(admin: SupabaseClient, matrixId: string, userId: string) {
  const { data: matrix, error } = await admin
    .from('matrices')
    .select('id, user_id, name, color, element_code, match_mode, match_any_count, matrix_type, pipeline_scope')
    .eq('id', matrixId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error || !matrix) return { error: 'Matrix not found.' } as const

  const isPipeline = matrix.matrix_type === 'pipeline'
  const childResult = isPipeline
    ? await admin.from('matrix_pipeline_steps').select(MATRIX_STEP_SELECT).eq('matrix_id', matrix.id).order('position')
    : await admin.from('matrix_factors').select(MATRIX_FACTOR_SELECT).eq('matrix_id', matrix.id).order('position')

  if (childResult.error) return { error: 'Could not prepare this Matrix for sharing.' } as const
  if (!childResult.data?.length) return { error: `This ${isPipeline ? 'Pipeline' : 'Matrix'} has no ${isPipeline ? 'steps' : 'Elements'} to share.` } as const

  const snapshot: MarketplaceMatrixSnapshot = {
    version: 1,
    name: matrix.name,
    color: matrix.color,
    element_code: matrix.element_code,
    matrix_type: isPipeline ? 'pipeline' : 'classic',
    match_mode: matrix.match_mode,
    match_any_count: matrix.match_any_count,
    pipeline_scope: matrix.pipeline_scope,
    factors: isPipeline ? [] : childResult.data,
    pipeline_steps: isPipeline ? childResult.data : [],
  }

  return { matrix, snapshot } as const
}

export function readMarketplaceSnapshot(value: unknown): MarketplaceMatrixSnapshot | null {
  if (!value || typeof value !== 'object') return null
  const snapshot = value as Partial<MarketplaceMatrixSnapshot>
  if (snapshot.version !== 1 || !snapshot.name || !snapshot.color || !snapshot.element_code) return null
  if (snapshot.matrix_type !== 'classic' && snapshot.matrix_type !== 'pipeline') return null
  if (!Array.isArray(snapshot.factors) || !Array.isArray(snapshot.pipeline_steps)) return null
  if (snapshot.matrix_type === 'classic' && snapshot.factors.length === 0) return null
  if (snapshot.matrix_type === 'pipeline' && snapshot.pipeline_steps.length === 0) return null
  return snapshot as MarketplaceMatrixSnapshot
}

export function cleanMarketplaceTags(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value
    .filter((tag): tag is string => typeof tag === 'string')
    .map(tag => tag.trim().toLowerCase().replace(/[^a-z0-9 -]/g, '').replace(/\s+/g, '-'))
    .filter(Boolean))].slice(0, 5)
}
