import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireTier } from '@/lib/requireTier'

export const revalidate = 0

const MAX_FACTORS_PER_MATRIX = 40
const TIEBREAKER_CATEGORIES = ['odds', 'dugout_specs', 'pitchlog_stat', 'savant_stat', 'picks']
const VALID_BOOKS = ['fanduel', 'caesars', 'betmgm', 'betrivers', 'fanatics']
const MAX_TIEBREAKERS = 5
const PIPELINE_STEP_KINDS = ['filter', 'group', 'rank', 'unless']
const PIPELINE_OPERATORS = ['gte', 'lte', 'eq', 'up', 'down', 'flat', 'positive', 'negative', 'is_null', 'is_not_null', 'lt_anchor', 'gt_anchor']
const MAX_PIPELINE_STEPS = 10

function cleanTiebreakers(raw: unknown) {
  if (!Array.isArray(raw)) return []
  const clean: { category: string; field_key: string; recency: string | null; book: string | null; direction: 'highest' | 'lowest'; tolerance: number | null }[] = []
  for (const t of raw.slice(0, MAX_TIEBREAKERS)) {
    if (!t || typeof t !== 'object') continue
    const { category, field_key, recency, book, direction, tolerance } = t as Record<string, unknown>
    if (!TIEBREAKER_CATEGORIES.includes(category as string)) continue
    if (typeof field_key !== 'string' || !field_key) continue
    clean.push({
      category: category as string, field_key,
      recency: typeof recency === 'string' ? recency : null,
      book: typeof book === 'string' && VALID_BOOKS.includes(book) ? book : null,
      direction: direction === 'lowest' ? 'lowest' : 'highest',
      tolerance: typeof tolerance === 'number' && Number.isFinite(tolerance) && tolerance > 0 ? tolerance : null,
    })
  }
  return clean
}

// Pipeline mode's Factor-list equivalent — see matrixEngine.ts's
// MatrixPipelineStep. matrix_type itself is never editable here (a Matrix
// is created as Classic or Pipeline and stays that way — see
// api/matrices/route.ts POST), only pipeline_scope + the step list.
type CleanPipelineStep = {
  kind: string; category: string; field_key: string; recency: string | null; book: string | null
  books: string[] | null; books_min_count: number | null; operator: string | null; value: number | null
  direction: 'highest' | 'lowest' | null; tolerance: number | null
  condition_scope: 'team' | 'game' | null; condition_steps: CleanPipelineStep[] | null; then_steps: CleanPipelineStep[] | null
}
// `allowUnless` caps nesting at one level — same rationale as
// api/matrices/route.ts's own validatePipelineSteps (kept as two separate
// small validators rather than a shared import, matching this file's
// existing precedent of a self-contained "clean" pass distinct from the
// POST route's "validate" pass).
function cleanPipelineSteps(raw: unknown, allowUnless = true): CleanPipelineStep[] {
  if (!Array.isArray(raw)) return []
  const clean: CleanPipelineStep[] = []
  for (const s of raw.slice(0, MAX_PIPELINE_STEPS)) {
    if (!s || typeof s !== 'object') continue
    const { kind, category, field_key, recency, book, books, books_min_count, operator, value, direction, tolerance, condition_scope, condition_steps, then_steps } = s as Record<string, unknown>
    if (!PIPELINE_STEP_KINDS.includes(kind as string)) continue
    if (kind === 'unless' && !allowUnless) continue
    if (!TIEBREAKER_CATEGORIES.includes(category as string)) continue
    if (typeof field_key !== 'string' || !field_key) continue
    clean.push({
      kind: kind as string, category: category as string, field_key,
      recency: typeof recency === 'string' ? recency : null,
      book: typeof book === 'string' && VALID_BOOKS.includes(book) ? book : null,
      books: Array.isArray(books) && books.length ? books.filter(b => typeof b === 'string' && VALID_BOOKS.includes(b)) : null,
      books_min_count: typeof books_min_count === 'number' ? Math.max(1, Math.round(books_min_count)) : null,
      operator: typeof operator === 'string' && PIPELINE_OPERATORS.includes(operator) ? operator : null,
      value: typeof value === 'number' ? value : null,
      direction: direction === 'lowest' ? 'lowest' : direction === 'highest' ? 'highest' : null,
      tolerance: typeof tolerance === 'number' && Number.isFinite(tolerance) && tolerance > 0 ? tolerance : null,
      condition_scope: condition_scope === 'game' ? 'game' : condition_scope === 'team' ? 'team' : null,
      condition_steps: kind === 'unless' ? cleanPipelineSteps(condition_steps, false) : null,
      then_steps: kind === 'unless' ? cleanPipelineSteps(then_steps, false) : null,
    })
  }
  return clean
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireTier('ultimate')
  if (gate.error) return gate.error
  const { id } = await params

  const admin = createAdminClient()
  const { data: owned } = await admin.from('matrices').select('id').eq('id', id).eq('user_id', gate.userId!).maybeSingle()
  if (!owned) return NextResponse.json({ error: 'Matrix not found.' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const updates: Record<string, unknown> = {}
  if (typeof body?.name === 'string' && body.name.trim()) updates.name = body.name.trim().slice(0, 60)
  if (typeof body?.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(body.color)) updates.color = body.color
  if (Number.isFinite(body?.priority)) updates.priority = Math.max(1, Math.round(body.priority))
  if (body?.match_mode === 'all' || body?.match_mode === 'any') updates.match_mode = body.match_mode
  if (Number.isFinite(body?.match_any_count)) updates.match_any_count = Math.max(1, Math.round(body.match_any_count))
  if (typeof body?.enabled === 'boolean') updates.enabled = body.enabled
  if (body?.pipeline_scope === 'game' || body?.pipeline_scope === 'team') updates.pipeline_scope = body.pipeline_scope
  updates.updated_at = new Date().toISOString()

  const { error: updateError } = await admin.from('matrices').update(updates).eq('id', id)
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  // A full editor save replaces the whole Factor list rather than diffing —
  // Factors have no independent identity a member would reference outside
  // this Matrix (no Factor-level share/edit-in-place elsewhere), so
  // delete-and-reinsert is simpler and can't drift out of sync with what
  // was actually submitted.
  if (Array.isArray(body?.factors)) {
    if (!body.factors.length) return NextResponse.json({ error: 'A Matrix needs at least one Factor.' }, { status: 400 })
    if (body.factors.length > MAX_FACTORS_PER_MATRIX) return NextResponse.json({ error: `A Matrix can hold at most ${MAX_FACTORS_PER_MATRIX} Factors.` }, { status: 400 })
    const { error: deleteError } = await admin.from('matrix_factors').delete().eq('matrix_id', id)
    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })
    const { error: insertError } = await admin.from('matrix_factors').insert(
      body.factors.map((f: Record<string, unknown>, i: number) => ({
        matrix_id: id, position: i,
        category: f.category, field_key: f.field_key, operator: f.operator,
        value: typeof f.value === 'number' ? f.value : null,
        recency: typeof f.recency === 'string' ? f.recency : null,
        recency_start: typeof f.recency_start === 'string' ? f.recency_start : null,
        recency_end: typeof f.recency_end === 'string' ? f.recency_end : null,
        books: Array.isArray(f.books) && f.books.length ? f.books.filter(b => typeof b === 'string') : null,
        books_min_count: typeof f.books_min_count === 'number' ? Math.max(1, Math.round(f.books_min_count)) : null,
        tie_scope: f.tie_scope === 'game' ? 'game' : f.tie_scope === 'team' ? 'team' : null,
        tie_direction: f.tie_direction === 'highest' ? 'highest' : f.tie_direction === 'lowest' ? 'lowest' : null,
        tiebreakers: cleanTiebreakers(f.tiebreakers),
      }))
    )
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  // Same delete-and-reinsert shape as the Factor list above, for Pipeline
  // mode's step list.
  if (Array.isArray(body?.pipeline_steps)) {
    if (!body.pipeline_steps.length) return NextResponse.json({ error: 'A Pipeline needs at least one step.' }, { status: 400 })
    if (body.pipeline_steps.length > MAX_PIPELINE_STEPS) return NextResponse.json({ error: `A Pipeline can hold at most ${MAX_PIPELINE_STEPS} steps.` }, { status: 400 })
    const { error: deleteStepsError } = await admin.from('matrix_pipeline_steps').delete().eq('matrix_id', id)
    if (deleteStepsError) return NextResponse.json({ error: deleteStepsError.message }, { status: 500 })
    const { error: insertStepsError } = await admin.from('matrix_pipeline_steps').insert(
      cleanPipelineSteps(body.pipeline_steps).map((s, i) => ({ ...s, matrix_id: id, position: i }))
    )
    if (insertStepsError) return NextResponse.json({ error: insertStepsError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireTier('ultimate')
  if (gate.error) return gate.error
  const { id } = await params

  const admin = createAdminClient()
  const { error } = await admin.from('matrices').delete().eq('id', id).eq('user_id', gate.userId!)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
