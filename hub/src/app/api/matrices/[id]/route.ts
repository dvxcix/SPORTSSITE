import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireTier } from '@/lib/requireTier'

export const revalidate = 0

const MAX_FACTORS_PER_MATRIX = 40
const TIEBREAKER_CATEGORIES = ['odds', 'dugout_specs', 'pitchlog_stat', 'savant_stat', 'picks']
const VALID_BOOKS = ['fanduel', 'caesars', 'betmgm', 'betrivers', 'fanatics']
const MAX_TIEBREAKERS = 5
const PIPELINE_STEP_KINDS = ['filter', 'group', 'rank', 'unless']
const PIPELINE_OPERATORS = ['gte', 'lte', 'eq', 'up', 'down', 'flat', 'up_or_flat', 'down_or_flat', 'positive', 'negative', 'zero', 'is_null', 'is_not_null', 'lt_anchor', 'gt_anchor', 'mm_trend']
const MAX_PIPELINE_STEPS = 50
const FACTOR_OPERATORS = ['gte', 'lte', 'eq', 'up', 'down', 'flat', 'up_or_flat', 'down_or_flat', 'positive', 'negative', 'zero', 'tied', 'is_null', 'is_not_null', 'mm_trend']

// Only meaningful for operator 'mm_trend' (field_key 'mm') — see
// matrixEngine.ts's evaluateMmTrend/MmByWindow.
const MM_WINDOWS = ['l1', 'l3', 'l5', 'l10']
const MM_DIRECTIONS = ['increased', 'decreased', 'moved', 'crossed_positive', 'crossed_negative', 'flat']
function cleanMmBaseWindow(v: unknown): string | null {
  return typeof v === 'string' && MM_WINDOWS.includes(v) ? v : null
}
function cleanMmCompareWindows(v: unknown, base: string | null): string[] | null {
  if (!Array.isArray(v)) return null
  const clean = [...new Set(v.filter((w): w is string => typeof w === 'string' && MM_WINDOWS.includes(w) && w !== base))]
  return clean.length ? clean : null
}
function cleanMmDirection(v: unknown): string | null {
  return typeof v === 'string' && MM_DIRECTIONS.includes(v) ? v : null
}
function cleanMmMatchMode(v: unknown): 'any' | 'all' | null {
  return v === 'all' ? 'all' : v === 'any' ? 'any' : null
}
function cleanMmAmountMode(v: unknown): 'at_least' | 'exactly' | null {
  return v === 'exactly' ? 'exactly' : v === 'at_least' ? 'at_least' : null
}

type CleanTiebreaker = { category: string; field_key: string; recency: string | null; book: string | null; direction: 'highest' | 'lowest' | 'closest_zero' | 'farthest_zero'; tolerance: number | null; zero_eligible: boolean | null; mm_base_window: string | null; mm_compare_windows: string[] | null }
type TiebreakersResult = { ok: true; tiebreakers: CleanTiebreaker[] } | { ok: false; error: string }
function cleanTiebreakers(raw: unknown): TiebreakersResult {
  if (!Array.isArray(raw)) return { ok: true, tiebreakers: [] }
  const clean: CleanTiebreaker[] = []
  for (const t of raw.slice(0, MAX_TIEBREAKERS)) {
    if (!t || typeof t !== 'object') continue
    const { category, field_key, recency, book, direction, tolerance, zero_eligible, mm_base_window, mm_compare_windows } = t as Record<string, unknown>
    if (!TIEBREAKER_CATEGORIES.includes(category as string)) continue
    if (typeof field_key !== 'string' || !field_key) continue
    const cleanBaseWindow = cleanMmBaseWindow(mm_base_window)
    const cleanCompareWindows = cleanMmCompareWindows(mm_compare_windows, cleanBaseWindow)
    if (field_key === 'mm_move' && (!cleanBaseWindow || !cleanCompareWindows?.length)) {
      return { ok: false, error: 'A tiebreaker ranking by MM Movement needs a "from" window and at least one window to compare against.' }
    }
    clean.push({
      category: category as string, field_key,
      recency: typeof recency === 'string' ? recency : null,
      book: typeof book === 'string' && VALID_BOOKS.includes(book) ? book : null,
      direction: direction === 'lowest' ? 'lowest' : direction === 'closest_zero' ? 'closest_zero' : direction === 'farthest_zero' ? 'farthest_zero' : 'highest',
      tolerance: typeof tolerance === 'number' && Number.isFinite(tolerance) && tolerance > 0 ? tolerance : null,
      zero_eligible: zero_eligible === true,
      mm_base_window: cleanBaseWindow,
      mm_compare_windows: cleanCompareWindows,
    })
  }
  return { ok: true, tiebreakers: clean }
}

// Pipeline mode's Factor-list equivalent — see matrixEngine.ts's
// MatrixPipelineStep. matrix_type itself is never editable here (a Matrix
// is created as Classic or Pipeline and stays that way — see
// api/matrices/route.ts POST), only pipeline_scope + the step list.
type CleanPipelineStep = {
  kind: string; category: string; field_key: string; recency: string | null; book: string | null
  books: string[] | null; books_min_count: number | null; operator: string | null; value: number | null
  direction: 'highest' | 'lowest' | 'closest_zero' | 'farthest_zero' | null; tolerance: number | null; zero_eligible: boolean | null
  condition_scope: 'team' | 'game' | null; condition_steps: CleanPipelineStep[] | null; then_steps: CleanPipelineStep[] | null
  unless_mode: 'replace' | 'suppress' | 'add' | null; uses_anchor: boolean | null
  mm_base_window: string | null; mm_compare_windows: string[] | null; mm_direction: string | null; mm_match_mode: 'any' | 'all' | null
  mm_amount_mode: 'at_least' | 'exactly' | null
}
type PipelineStepsResult = { ok: true; steps: CleanPipelineStep[] } | { ok: false; error: string }

// `allowUnless` caps nesting at one level — same rationale as
// api/matrices/route.ts's own validatePipelineSteps (kept as two separate
// small validators rather than a shared import, matching this file's
// existing precedent of a self-contained "clean" pass distinct from the
// POST route's "validate" pass). Real gap, reported live (2026-07-27): a
// well-formed but structurally dead step (blank threshold value, MM field
// missing its window config, an anchor comparison outside an Unless
// condition, an Unless with no condition at all) used to save silently —
// see api/matrices/route.ts's own validatePipelineSteps for the full
// rationale and the live audit that found this. `anchorAvailable` mirrors
// runPipelineStep's backward-compatible default (matrixEngine.ts:
// `step.uses_anchor !== false` resolves the anchor).
function cleanPipelineSteps(raw: unknown, allowUnless = true, anchorAvailable = false): PipelineStepsResult {
  if (!Array.isArray(raw)) return { ok: true, steps: [] }
  const clean: CleanPipelineStep[] = []
  for (const s of raw.slice(0, MAX_PIPELINE_STEPS)) {
    if (!s || typeof s !== 'object') continue
    const { kind, category, field_key, recency, book, books, books_min_count, operator, value, direction, tolerance, zero_eligible, condition_scope, condition_steps, then_steps, unless_mode, uses_anchor, mm_base_window, mm_compare_windows, mm_direction, mm_match_mode, mm_amount_mode } = s as Record<string, unknown>
    if (!PIPELINE_STEP_KINDS.includes(kind as string)) continue
    if (kind === 'unless' && !allowUnless) continue
    if (!TIEBREAKER_CATEGORIES.includes(category as string)) continue
    if (typeof field_key !== 'string' || !field_key) continue
    const cleanOperator = typeof operator === 'string' && PIPELINE_OPERATORS.includes(operator) ? operator : null
    const cleanBaseWindow = cleanMmBaseWindow(mm_base_window)
    const cleanCompareWindows = cleanMmCompareWindows(mm_compare_windows, cleanBaseWindow)
    const cleanValue = typeof value === 'number' ? value : null

    if (kind === 'filter') {
      if (['gte', 'lte', 'eq'].includes(cleanOperator as string) && cleanValue == null) {
        return { ok: false, error: `A Filter step on ${field_key} needs a value — it can never match anyone left blank.` }
      }
      if (cleanOperator === 'mm_trend' && (!cleanBaseWindow || !cleanCompareWindows?.length)) {
        return { ok: false, error: `A Filter step's MM Trend needs a "from" window and at least one window to compare against.` }
      }
      if ((cleanOperator === 'lt_anchor' || cleanOperator === 'gt_anchor') && !anchorAvailable) {
        return { ok: false, error: `A Filter step compares against the tied value, but isn't inside an Unless condition with "Compare against a value" turned on.` }
      }
    }
    if (field_key === 'mm_move' && (!cleanBaseWindow || !cleanCompareWindows?.length)) {
      return { ok: false, error: `MM Movement needs a "from" window and at least one window to compare against.` }
    }

    let cleanConditionSteps: CleanPipelineStep[] | null = null
    let cleanThenSteps: CleanPipelineStep[] | null = null
    const cleanUsesAnchor = uses_anchor === false ? false : uses_anchor === true ? true : null
    if (kind === 'unless') {
      const condResult = cleanPipelineSteps(condition_steps, false, cleanUsesAnchor !== false)
      if (!condResult.ok) return condResult
      if (!condResult.steps.length) return { ok: false, error: 'An Unless step needs at least one condition step — an empty condition always triggers against everyone in scope.' }
      cleanConditionSteps = condResult.steps
      const thenResult = cleanPipelineSteps(then_steps, false, cleanUsesAnchor !== false)
      if (!thenResult.ok) return thenResult
      cleanThenSteps = thenResult.steps
    }

    clean.push({
      kind: kind as string, category: category as string, field_key,
      recency: typeof recency === 'string' ? recency : null,
      book: typeof book === 'string' && VALID_BOOKS.includes(book) ? book : null,
      books: Array.isArray(books) && books.length ? books.filter(b => typeof b === 'string' && VALID_BOOKS.includes(b)) : null,
      books_min_count: typeof books_min_count === 'number' ? Math.max(1, Math.round(books_min_count)) : null,
      operator: cleanOperator,
      value: cleanValue,
      direction: direction === 'lowest' ? 'lowest' : direction === 'highest' ? 'highest' : direction === 'closest_zero' ? 'closest_zero' : direction === 'farthest_zero' ? 'farthest_zero' : null,
      tolerance: typeof tolerance === 'number' && Number.isFinite(tolerance) && tolerance > 0 ? tolerance : null,
      zero_eligible: zero_eligible === true,
      condition_scope: condition_scope === 'game' ? 'game' : condition_scope === 'team' ? 'team' : null,
      condition_steps: cleanConditionSteps,
      then_steps: cleanThenSteps,
      unless_mode: unless_mode === 'suppress' ? 'suppress' : unless_mode === 'add' ? 'add' : unless_mode === 'replace' ? 'replace' : null,
      uses_anchor: cleanUsesAnchor,
      mm_base_window: cleanBaseWindow,
      mm_compare_windows: cleanCompareWindows,
      mm_direction: cleanMmDirection(mm_direction),
      mm_match_mode: cleanMmMatchMode(mm_match_mode),
      mm_amount_mode: cleanMmAmountMode(mm_amount_mode),
    })
  }
  return { ok: true, steps: clean }
}

// Classic Factor equivalent of buildPipelineStep's own validation — real gap,
// reported live (2026-07-27): this PATCH path used to pass `f.operator`
// straight through with NO whitelist check at all (relying solely on the DB
// CHECK constraint to reject garbage), and never checked for a blank value
// on gte/lte/eq (which ALWAYS evaluates false — see compareThreshold,
// matrixEngine.ts) or a misconfigured mm_trend/mm_move. Confirmed live
// across an audit of every saved Matrix: 15+ members had a blank-value
// Factor that silently could never match anyone. See api/matrices/route.ts's
// own validateFactors for the matching POST-side rationale.
type CleanFactor = {
  category: unknown; field_key: unknown; operator: unknown; value: number | null
  recency: string | null; recency_start: string | null; recency_end: string | null
  books: string[] | null; books_min_count: number | null
  tie_scope: 'team' | 'game' | null; tie_direction: 'highest' | 'lowest' | null
  tiebreakers: CleanTiebreaker[]
  mm_base_window: string | null; mm_compare_windows: string[] | null; mm_direction: string | null; mm_match_mode: 'any' | 'all' | null
  mm_amount_mode: 'at_least' | 'exactly' | null
}
function buildFactorInsert(f: Record<string, unknown>): { ok: true; value: CleanFactor } | { ok: false; error: string } {
  if (!TIEBREAKER_CATEGORIES.includes(f.category as string)) return { ok: false, error: 'Invalid Factor category.' }
  if (typeof f.field_key !== 'string' || !f.field_key) return { ok: false, error: 'Invalid Factor field.' }
  if (!FACTOR_OPERATORS.includes(f.operator as string)) return { ok: false, error: 'Invalid Factor condition.' }
  const cleanValue = typeof f.value === 'number' ? f.value : null
  if (['gte', 'lte', 'eq'].includes(f.operator as string) && cleanValue == null) {
    return { ok: false, error: `A Factor on ${f.field_key} needs a value — it can never match anyone left blank.` }
  }
  const baseWindow = cleanMmBaseWindow(f.mm_base_window)
  const compareWindows = cleanMmCompareWindows(f.mm_compare_windows, baseWindow)
  if (f.operator === 'mm_trend' && (!baseWindow || !compareWindows?.length)) {
    return { ok: false, error: `A Factor's MM Trend needs a "from" window and at least one window to compare against.` }
  }
  if (f.field_key === 'mm_move' && (!baseWindow || !compareWindows?.length)) {
    return { ok: false, error: `A Factor on MM Movement needs a "from" window and at least one window to compare against.` }
  }
  const tbResult = cleanTiebreakers(f.tiebreakers)
  if (!tbResult.ok) return tbResult
  return {
    ok: true,
    value: {
      category: f.category, field_key: f.field_key, operator: f.operator,
      value: cleanValue,
      recency: typeof f.recency === 'string' ? f.recency : null,
      recency_start: typeof f.recency_start === 'string' ? f.recency_start : null,
      recency_end: typeof f.recency_end === 'string' ? f.recency_end : null,
      books: Array.isArray(f.books) && f.books.length ? f.books.filter((b): b is string => typeof b === 'string') : null,
      books_min_count: typeof f.books_min_count === 'number' ? Math.max(1, Math.round(f.books_min_count)) : null,
      tie_scope: f.tie_scope === 'game' ? 'game' : f.tie_scope === 'team' ? 'team' : null,
      tie_direction: f.tie_direction === 'highest' ? 'highest' : f.tie_direction === 'lowest' ? 'lowest' : null,
      tiebreakers: tbResult.tiebreakers,
      mm_base_window: baseWindow,
      mm_compare_windows: compareWindows,
      mm_direction: cleanMmDirection(f.mm_direction),
      mm_match_mode: cleanMmMatchMode(f.mm_match_mode),
      mm_amount_mode: cleanMmAmountMode(f.mm_amount_mode),
    },
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireTier('ultimate')
  if (gate.error) return gate.error
  const { id } = await params

  const admin = createAdminClient()
  const { data: owned } = await admin.from('matrices').select('id, match_mode, match_any_count').eq('id', id).eq('user_id', gate.userId!).maybeSingle()
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

  // A full editor save replaces the whole Factor list rather than diffing —
  // Factors have no independent identity a member would reference outside
  // this Matrix (no Factor-level share/edit-in-place elsewhere), so
  // delete-and-reinsert is simpler and can't drift out of sync with what
  // was actually submitted. Validated BEFORE any DB write below so a
  // rejected save never touches the matrices row or leaves a half-updated
  // Matrix behind.
  let cleanFactors: CleanFactor[] | null = null
  if (Array.isArray(body?.factors)) {
    if (!body.factors.length) return NextResponse.json({ error: 'A Matrix needs at least one Factor.' }, { status: 400 })
    if (body.factors.length > MAX_FACTORS_PER_MATRIX) return NextResponse.json({ error: `A Matrix can hold at most ${MAX_FACTORS_PER_MATRIX} Factors.` }, { status: 400 })
    const built: CleanFactor[] = []
    for (const f of body.factors as Record<string, unknown>[]) {
      const result = buildFactorInsert(f)
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
      built.push(result.value)
    }
    // Real gap, reported live (2026-07-27): "match at least N of these
    // Factors" with N greater than the Factor count can never be satisfied.
    // finalMatchMode/finalMatchAnyCount fold in this same request's own
    // match_mode/match_any_count updates (if present) so a member who
    // shrinks their Factor list AND raises the count in the same save is
    // checked against what the Matrix will actually look like afterward.
    const finalMatchMode = (updates.match_mode as string | undefined) ?? owned.match_mode
    const finalMatchAnyCount = (updates.match_any_count as number | undefined) ?? owned.match_any_count
    if (finalMatchMode === 'any' && finalMatchAnyCount != null && finalMatchAnyCount > built.length) {
      return NextResponse.json({ error: `"At least ${finalMatchAnyCount}" needs that many Factors — this Matrix only has ${built.length}.` }, { status: 400 })
    }
    cleanFactors = built
  }

  let cleanSteps: CleanPipelineStep[] | null = null
  if (Array.isArray(body?.pipeline_steps)) {
    if (!body.pipeline_steps.length) return NextResponse.json({ error: 'A Pipeline needs at least one step.' }, { status: 400 })
    if (body.pipeline_steps.length > MAX_PIPELINE_STEPS) return NextResponse.json({ error: `A Pipeline can hold at most ${MAX_PIPELINE_STEPS} steps.` }, { status: 400 })
    const stepsResult = cleanPipelineSteps(body.pipeline_steps)
    if (!stepsResult.ok) return NextResponse.json({ error: stepsResult.error }, { status: 400 })
    cleanSteps = stepsResult.steps
  }

  const { error: updateError } = await admin.from('matrices').update(updates).eq('id', id)
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  if (cleanFactors) {
    const { error: deleteError } = await admin.from('matrix_factors').delete().eq('matrix_id', id)
    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })
    const { error: insertError } = await admin.from('matrix_factors').insert(
      cleanFactors.map((f, i) => ({ ...f, matrix_id: id, position: i }))
    )
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  // Same delete-and-reinsert shape as the Factor list above, for Pipeline
  // mode's step list.
  if (cleanSteps) {
    const { error: deleteStepsError } = await admin.from('matrix_pipeline_steps').delete().eq('matrix_id', id)
    if (deleteStepsError) return NextResponse.json({ error: deleteStepsError.message }, { status: 500 })
    const { error: insertStepsError } = await admin.from('matrix_pipeline_steps').insert(
      cleanSteps.map((s, i) => ({ ...s, matrix_id: id, position: i }))
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
