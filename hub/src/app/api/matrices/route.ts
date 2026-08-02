import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireTier } from '@/lib/requireTier'
import { insertWithUniqueElementCode } from '@/lib/elementCode'

export const revalidate = 0

const MAX_FACTORS_PER_MATRIX = 40

type FactorInput = {
  category: 'odds' | 'dugout_specs' | 'pitchlog_stat' | 'savant_stat' | 'picks'
  field_key: string
  operator: 'gte' | 'lte' | 'eq' | 'up' | 'down' | 'flat' | 'up_or_flat' | 'down_or_flat' | 'positive' | 'negative' | 'zero' | 'tied' | 'is_null' | 'is_not_null' | 'mm_trend'
  value: number | null
  recency: string | null
  recency_start: string | null
  recency_end: string | null
  // Only meaningful for the two real multi-book odds fields (fhr, hr) — see
  // matrixEngine.ts's MULTI_BOOK_MARKET. Harmless (just ignored) on every
  // other Factor.
  books: string[] | null
  books_min_count: number | null
  // Only meaningful for operator 'tied' — see matrixEngine.ts's MatrixFactor.
  tie_scope: 'team' | 'game' | null
  tie_direction: 'highest' | 'lowest' | null
  tiebreakers: TiebreakerInput[]
  // Only meaningful for operator 'mm_trend' — see matrixEngine.ts's
  // evaluateMmTrend/MatrixFactor.
  mm_base_window: 'l1' | 'l3' | 'l5' | 'l10' | null
  mm_compare_windows: string[] | null
  mm_direction: 'increased' | 'decreased' | 'moved' | 'crossed_positive' | 'crossed_negative' | 'flat' | null
  mm_match_mode: 'any' | 'all' | null
  // See matrixEngine.ts's MmAmountMode — null/'at_least' = amount is a
  // floor ("moved 2+"); 'exactly' = an exact match ("moved exactly 2").
  mm_amount_mode: 'at_least' | 'exactly' | null
}

type TiebreakerInput = {
  category: 'odds' | 'dugout_specs' | 'pitchlog_stat' | 'savant_stat' | 'picks'
  field_key: string
  recency: string | null
  book: string | null
  direction: 'highest' | 'lowest' | 'closest_zero' | 'farthest_zero'
  tolerance: number | null
  // Only meaningful for direction 'closest_zero' — see matrixEngine.ts's
  // MatrixTiebreaker.zero_eligible.
  zero_eligible: boolean | null
  // Only meaningful for field_key 'mm_move' — see matrixEngine.ts's
  // computeMmMoveValue.
  mm_base_window: 'l1' | 'l3' | 'l5' | 'l10' | null
  mm_compare_windows: string[] | null
}

// Pipeline mode — see matrixEngine.ts's MatrixPipelineStep for the full
// step-kind rationale (filter/group/rank/unless). A Matrix is one mode or
// the other (matrix_type); pipeline_steps is only ever populated/read when
// matrix_type === 'pipeline'.
type PipelineStepInput = {
  kind: 'filter' | 'group' | 'rank' | 'unless'
  category: 'odds' | 'dugout_specs' | 'pitchlog_stat' | 'savant_stat' | 'picks'
  field_key: string
  recency: string | null
  book: string | null
  books: string[] | null
  books_min_count: number | null
  operator: string | null
  value: number | null
  direction: 'highest' | 'lowest' | 'closest_zero' | 'farthest_zero' | null
  // rank only — null/0 keeps exact-match tie resolution; >0 also keeps
  // candidates within that raw distance of the best value. See
  // matrixEngine.ts's MatrixTiebreaker.tolerance.
  tolerance: number | null
  // rank only, direction 'closest_zero' — see MatrixTiebreaker.zero_eligible above.
  zero_eligible: boolean | null
  // unless only — see matrixEngine.ts's MatrixPipelineStep for the full
  // branching rationale. condition_steps/then_steps are themselves
  // PipelineStepInput[] (recursive), capped at one level deep — a nested
  // step's own kind is never 'unless' (validatePipelineSteps enforces this).
  condition_scope: 'team' | 'game' | null
  condition_steps: PipelineStepInput[] | null
  then_steps: PipelineStepInput[] | null
  // unless only — see matrixEngine.ts's MatrixPipelineStep. null/'replace' =
  // original swap-in behavior; 'suppress' wipes the pool; 'add' unions.
  unless_mode: 'replace' | 'suppress' | 'add' | null
  // unless only — null/undefined resolves the anchor (backward-compatible);
  // explicit false skips it.
  uses_anchor: boolean | null
  // filter only, operator 'mm_trend' — see matrixEngine.ts's evaluateMmTrend.
  mm_base_window: 'l1' | 'l3' | 'l5' | 'l10' | null
  mm_compare_windows: string[] | null
  mm_direction: 'increased' | 'decreased' | 'moved' | 'crossed_positive' | 'crossed_negative' | 'flat' | null
  mm_match_mode: 'any' | 'all' | null
  mm_amount_mode: 'at_least' | 'exactly' | null
}

const VALID_BOOKS = ['fanduel', 'caesars', 'betmgm', 'betrivers', 'fanatics']
const TIEBREAKER_CATEGORIES = ['odds', 'dugout_specs', 'pitchlog_stat', 'savant_stat', 'picks']
// A tiebreaker chain longer than this has no real practical purpose — by
// the time 5 fields haven't disambiguated a tie, the rule is "keep them
// all" anyway (see resolveTiebreakers in matrixEngine.ts).
const MAX_TIEBREAKERS = 5
const PIPELINE_STEP_KINDS = ['filter', 'group', 'rank', 'unless']
// 'tied' deliberately excluded — a filter step's threshold operator is
// never "tied," that's what a group step is for. lt_anchor/gt_anchor are
// only meaningful on a filter step inside an 'unless' step's
// condition_steps, but harmless (evaluates to false) anywhere else — see
// matrixEngine.ts's evaluateFilterStep.
const PIPELINE_OPERATORS = ['gte', 'lte', 'eq', 'up', 'down', 'flat', 'up_or_flat', 'down_or_flat', 'positive', 'negative', 'zero', 'is_null', 'is_not_null', 'lt_anchor', 'gt_anchor', 'mm_trend']
const MAX_PIPELINE_STEPS = 50

// Only meaningful for operator 'mm_trend' (field_key 'mm') — see
// matrixEngine.ts's evaluateMmTrend/MmByWindow.
const MM_WINDOWS = ['l1', 'l3', 'l5', 'l10']
const MM_DIRECTIONS = ['increased', 'decreased', 'moved', 'crossed_positive', 'crossed_negative', 'flat']
function cleanMmBaseWindow(v: unknown): 'l1' | 'l3' | 'l5' | 'l10' | null {
  return typeof v === 'string' && MM_WINDOWS.includes(v) ? v as 'l1' | 'l3' | 'l5' | 'l10' : null
}
function cleanMmCompareWindows(v: unknown, base: string | null): string[] | null {
  if (!Array.isArray(v)) return null
  const clean = [...new Set(v.filter((w): w is string => typeof w === 'string' && MM_WINDOWS.includes(w) && w !== base))]
  return clean.length ? clean : null
}
function cleanMmDirection(v: unknown): 'increased' | 'decreased' | 'moved' | 'crossed_positive' | 'crossed_negative' | 'flat' | null {
  return typeof v === 'string' && MM_DIRECTIONS.includes(v) ? v as 'increased' | 'decreased' | 'moved' | 'crossed_positive' | 'crossed_negative' | 'flat' : null
}
function cleanMmMatchMode(v: unknown): 'any' | 'all' | null {
  return v === 'all' ? 'all' : v === 'any' ? 'any' : null
}
function cleanMmAmountMode(v: unknown): 'at_least' | 'exactly' | null {
  return v === 'exactly' ? 'exactly' : v === 'at_least' ? 'at_least' : null
}

type PipelineStepsResult = { ok: true; steps: PipelineStepInput[] } | { ok: false; error: string }

// `allowUnless` caps nesting at one level — condition_steps/then_steps are
// validated with allowUnless=false, so a nested step whose own kind is
// 'unless' is silently dropped rather than erroring the whole save (same
// lenient-drop precedent every other malformed-item case here already uses
// for genuinely malformed SHAPE — a bad kind/category/field_key). Real gap,
// reported live (2026-07-27): a well-FORMED step that's still structurally
// guaranteed to never do anything (a threshold with no value, an MM field
// missing its window config, an anchor comparison outside an Unless
// condition, an Unless with no condition at all) used to save silently —
// confirmed live across an audit of every saved Matrix, several members had
// built Factors/steps exactly like this with zero indication anything was
// wrong. Those cases now HARD-REJECT the save with a specific error instead
// of silently persisting a dead condition. `anchorAvailable` mirrors
// runPipelineStep's own backward-compatible default (matrixEngine.ts:
// `step.uses_anchor !== false` resolves the anchor) — true for both an
// explicit uses_anchor:true and the old/unset null case.
function validatePipelineSteps(raw: unknown, allowUnless = true, anchorAvailable = false): PipelineStepsResult {
  if (!Array.isArray(raw)) return { ok: true, steps: [] }
  const clean: PipelineStepInput[] = []
  for (const s of raw.slice(0, MAX_PIPELINE_STEPS)) {
    if (!s || typeof s !== 'object') continue
    const { kind, category, field_key, recency, book, books, books_min_count, operator, value, direction, tolerance, zero_eligible, condition_scope, condition_steps, then_steps, unless_mode, uses_anchor, mm_base_window, mm_compare_windows, mm_direction, mm_match_mode, mm_amount_mode } = s as Record<string, unknown>
    if (!PIPELINE_STEP_KINDS.includes(kind as string)) continue
    if (kind === 'unless' && !allowUnless) continue
    if (!TIEBREAKER_CATEGORIES.includes(category as string)) continue
    if (typeof field_key !== 'string' || !field_key) continue
    const cleanOperator = typeof operator === 'string' && PIPELINE_OPERATORS.includes(operator) ? operator : null
    const cleanBooks = Array.isArray(books) ? books.filter((b): b is string => typeof b === 'string' && VALID_BOOKS.includes(b)) : null
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

    let cleanConditionSteps: PipelineStepInput[] | null = null
    let cleanThenSteps: PipelineStepInput[] | null = null
    const cleanUsesAnchor = uses_anchor === false ? false : uses_anchor === true ? true : null
    if (kind === 'unless') {
      const condResult = validatePipelineSteps(condition_steps, false, cleanUsesAnchor !== false)
      if (!condResult.ok) return condResult
      if (!condResult.steps.length) return { ok: false, error: 'An Unless step needs at least one condition step — an empty condition always triggers against everyone in scope.' }
      cleanConditionSteps = condResult.steps
      const thenResult = validatePipelineSteps(then_steps, false, cleanUsesAnchor !== false)
      if (!thenResult.ok) return thenResult
      cleanThenSteps = thenResult.steps
    }

    clean.push({
      kind: kind as PipelineStepInput['kind'],
      category: category as PipelineStepInput['category'],
      field_key,
      recency: typeof recency === 'string' ? recency : null,
      book: typeof book === 'string' && VALID_BOOKS.includes(book) ? book : null,
      books: cleanBooks?.length ? cleanBooks : null,
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

function validateTiebreakers(raw: unknown): { ok: true; tiebreakers: TiebreakerInput[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: true, tiebreakers: [] }
  const clean: TiebreakerInput[] = []
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
      category: category as TiebreakerInput['category'],
      field_key,
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

// Real gap, reported live (2026-07-27): a Factor with operator gte/lte/eq
// and no typed-in value ALWAYS evaluates false (see compareThreshold,
// matrixEngine.ts) — confirmed live across an audit of every saved Matrix,
// 15+ members had exactly this: a Factor that looks configured but can
// never match anyone. Same for 'mm_trend'/'mm_move' missing their window
// config. These now hard-reject the save instead of silently persisting.
function validateFactors(factors: unknown): { ok: true; factors: FactorInput[] } | { ok: false; error: string } {
  if (!Array.isArray(factors) || !factors.length) return { ok: false, error: 'A Matrix needs at least one Factor.' }
  if (factors.length > MAX_FACTORS_PER_MATRIX) return { ok: false, error: `A Matrix can hold at most ${MAX_FACTORS_PER_MATRIX} Factors.` }
  const clean: FactorInput[] = []
  for (const f of factors) {
    if (!f || typeof f !== 'object') return { ok: false, error: 'Malformed Factor.' }
    const { category, field_key, operator, value, recency, recency_start, recency_end, books, books_min_count, tie_scope, tie_direction, tiebreakers, mm_base_window, mm_compare_windows, mm_direction, mm_match_mode, mm_amount_mode } = f as Record<string, unknown>
    if (!['odds', 'dugout_specs', 'pitchlog_stat', 'savant_stat', 'picks'].includes(category as string)) return { ok: false, error: 'Invalid Factor category.' }
    if (typeof field_key !== 'string' || !field_key) return { ok: false, error: 'Invalid Factor field.' }
    if (!['gte', 'lte', 'eq', 'up', 'down', 'flat', 'up_or_flat', 'down_or_flat', 'positive', 'negative', 'zero', 'tied', 'is_null', 'is_not_null', 'mm_trend'].includes(operator as string)) return { ok: false, error: 'Invalid Factor condition.' }
    const cleanValue = typeof value === 'number' ? value : null
    if (['gte', 'lte', 'eq'].includes(operator as string) && cleanValue == null) {
      return { ok: false, error: `A Factor on ${field_key} needs a value — it can never match anyone left blank.` }
    }
    const cleanBooks = Array.isArray(books) ? books.filter((b): b is string => typeof b === 'string' && VALID_BOOKS.includes(b)) : null
    const cleanBaseWindow = cleanMmBaseWindow(mm_base_window)
    const cleanCompareWindows = cleanMmCompareWindows(mm_compare_windows, cleanBaseWindow)
    if (operator === 'mm_trend' && (!cleanBaseWindow || !cleanCompareWindows?.length)) {
      return { ok: false, error: `A Factor's MM Trend needs a "from" window and at least one window to compare against.` }
    }
    if (field_key === 'mm_move' && (!cleanBaseWindow || !cleanCompareWindows?.length)) {
      return { ok: false, error: `A Factor on MM Movement needs a "from" window and at least one window to compare against.` }
    }
    const tbResult = validateTiebreakers(tiebreakers)
    if (!tbResult.ok) return tbResult
    clean.push({
      category: category as FactorInput['category'],
      field_key,
      operator: operator as FactorInput['operator'],
      value: cleanValue,
      recency: typeof recency === 'string' ? recency : null,
      recency_start: typeof recency_start === 'string' ? recency_start : null,
      recency_end: typeof recency_end === 'string' ? recency_end : null,
      books: cleanBooks?.length ? cleanBooks : null,
      books_min_count: typeof books_min_count === 'number' ? Math.max(1, Math.round(books_min_count)) : null,
      tie_scope: tie_scope === 'game' ? 'game' : tie_scope === 'team' ? 'team' : null,
      tie_direction: tie_direction === 'highest' ? 'highest' : tie_direction === 'lowest' ? 'lowest' : null,
      tiebreakers: tbResult.tiebreakers,
      mm_base_window: cleanBaseWindow,
      mm_compare_windows: cleanCompareWindows,
      mm_direction: cleanMmDirection(mm_direction),
      mm_match_mode: cleanMmMatchMode(mm_match_mode),
      mm_amount_mode: cleanMmAmountMode(mm_amount_mode),
    })
  }
  return { ok: true, factors: clean }
}

export async function GET() {
  const gate = await requireTier('ultimate')
  if (gate.error) return gate.error

  const admin = createAdminClient()
  const { data: matrices, error } = await admin
    .from('matrices')
    .select('id, name, color, priority, match_mode, match_any_count, matrix_type, pipeline_scope, element_code, enabled, created_at, updated_at')
    .eq('user_id', gate.userId!)
    .order('priority', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!matrices?.length) return NextResponse.json({ matrices: [] })

  const { data: factors, error: factorsError } = await admin
    .from('matrix_factors')
    .select('id, matrix_id, position, category, field_key, operator, value, recency, recency_start, recency_end, books, books_min_count, tie_scope, tie_direction, tiebreakers, mm_base_window, mm_compare_windows, mm_direction, mm_match_mode, mm_amount_mode')
    .in('matrix_id', matrices.map(m => m.id))
    .order('position', { ascending: true })
  if (factorsError) return NextResponse.json({ error: factorsError.message }, { status: 500 })

  const { data: pipelineSteps, error: stepsError } = await admin
    .from('matrix_pipeline_steps')
    .select('id, matrix_id, position, kind, category, field_key, recency, book, books, books_min_count, operator, value, direction, tolerance, zero_eligible, condition_scope, condition_steps, then_steps, unless_mode, uses_anchor, mm_base_window, mm_compare_windows, mm_direction, mm_match_mode, mm_amount_mode')
    .in('matrix_id', matrices.map(m => m.id))
    .order('position', { ascending: true })
  if (stepsError) return NextResponse.json({ error: stepsError.message }, { status: 500 })

  const factorsByMatrix = new Map<string, typeof factors>()
  for (const f of factors ?? []) factorsByMatrix.set(f.matrix_id, [...(factorsByMatrix.get(f.matrix_id) ?? []), f])
  const stepsByMatrix = new Map<string, typeof pipelineSteps>()
  for (const s of pipelineSteps ?? []) stepsByMatrix.set(s.matrix_id, [...(stepsByMatrix.get(s.matrix_id) ?? []), s])

  return NextResponse.json({
    matrices: matrices.map(m => ({ ...m, factors: factorsByMatrix.get(m.id) ?? [], pipeline_steps: stepsByMatrix.get(m.id) ?? [] })),
  })
}

export async function POST(req: Request) {
  const gate = await requireTier('ultimate')
  if (gate.error) return gate.error

  const body = await req.json().catch(() => null)
  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 60) : ''
  const color = typeof body?.color === 'string' ? body.color : ''
  const priority = Number.isFinite(body?.priority) ? Math.max(1, Math.round(body.priority)) : 1
  const matchMode = body?.match_mode === 'any' ? 'any' : 'all'
  const matchAnyCount = matchMode === 'any' && Number.isFinite(body?.match_any_count) ? Math.max(1, Math.round(body.match_any_count)) : null
  const matrixType = body?.matrix_type === 'pipeline' ? 'pipeline' : 'classic'
  const pipelineScope = body?.pipeline_scope === 'game' ? 'game' : 'team'

  if (!name) return NextResponse.json({ error: 'Give this Matrix a name.' }, { status: 400 })
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return NextResponse.json({ error: 'Pick a valid color.' }, { status: 400 })

  // Classic and Pipeline are two independent modes — a Matrix has EITHER
  // Factors (matrix_factors) OR pipeline steps (matrix_pipeline_steps),
  // never both, so only the relevant side gets validated/required here.
  let validatedFactors: FactorInput[] = []
  let validatedSteps: PipelineStepInput[] = []
  if (matrixType === 'pipeline') {
    const stepsResult = validatePipelineSteps(body?.pipeline_steps)
    if (!stepsResult.ok) return NextResponse.json({ error: stepsResult.error }, { status: 400 })
    validatedSteps = stepsResult.steps
    if (!validatedSteps.length) return NextResponse.json({ error: 'A Pipeline needs at least one step.' }, { status: 400 })
  } else {
    const validated = validateFactors(body?.factors)
    if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 })
    validatedFactors = validated.factors
    // Real gap, reported live (2026-07-27): "match at least N of these
    // Factors" with N > the actual Factor count can never be satisfied —
    // confirmed live, 2 saved Matrices had exactly this (e.g. "at least 10
    // of 1 Factor").
    if (matchMode === 'any' && matchAnyCount != null && matchAnyCount > validatedFactors.length) {
      return NextResponse.json({ error: `"At least ${matchAnyCount}" needs that many Factors — this Matrix only has ${validatedFactors.length}.` }, { status: 400 })
    }
  }

  const admin = createAdminClient()
  const inserted = await insertWithUniqueElementCode(admin, 'matrices', elementCode => ({
    user_id: gate.userId!, name, color, priority, match_mode: matchMode, match_any_count: matchAnyCount,
    matrix_type: matrixType, pipeline_scope: matrixType === 'pipeline' ? pipelineScope : null,
    element_code: elementCode,
  }))
  if (inserted.error || !inserted.data) {
    // The cap trigger raises a plain exception, not a Postgres error code —
    // surfaced to the member as the real reason, not a generic 500.
    const message = inserted.error ?? 'Could not save this Matrix.'
    const capHit = message.includes('MATRIX_CAP_REACHED')
    return NextResponse.json({ error: capHit ? 'You can save up to 10 Matrices — delete one to make room.' : message }, { status: capHit ? 400 : 500 })
  }

  const matrixId = inserted.data.id as string
  const { error: childError } = matrixType === 'pipeline'
    ? await admin.from('matrix_pipeline_steps').insert(validatedSteps.map((s, i) => ({ ...s, matrix_id: matrixId, position: i })))
    : await admin.from('matrix_factors').insert(validatedFactors.map((f, i) => ({ ...f, matrix_id: matrixId, position: i })))
  if (childError) {
    await admin.from('matrices').delete().eq('id', matrixId) // don't leave a childless Matrix behind
    return NextResponse.json({ error: childError.message }, { status: 500 })
  }

  return NextResponse.json({ matrix: inserted.data })
}
