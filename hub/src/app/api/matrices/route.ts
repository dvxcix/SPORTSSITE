import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireTier } from '@/lib/requireTier'
import { insertWithUniqueElementCode } from '@/lib/elementCode'

export const revalidate = 0

const MAX_FACTORS_PER_MATRIX = 40

type FactorInput = {
  category: 'odds' | 'dugout_specs' | 'pitchlog_stat' | 'savant_stat' | 'picks'
  field_key: string
  operator: 'gte' | 'lte' | 'eq' | 'up' | 'down' | 'flat' | 'positive' | 'negative' | 'tied'
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
  tiebreakers: TiebreakerInput[]
}

type TiebreakerInput = {
  category: 'odds' | 'dugout_specs' | 'pitchlog_stat' | 'savant_stat' | 'picks'
  field_key: string
  recency: string | null
  book: string | null
  direction: 'highest' | 'lowest'
}

// Pipeline mode — see matrixEngine.ts's MatrixPipelineStep for the full
// step-kind rationale (filter/group/rank). A Matrix is one mode or the
// other (matrix_type); pipeline_steps is only ever populated/read when
// matrix_type === 'pipeline'.
type PipelineStepInput = {
  kind: 'filter' | 'group' | 'rank'
  category: 'odds' | 'dugout_specs' | 'pitchlog_stat' | 'savant_stat' | 'picks'
  field_key: string
  recency: string | null
  book: string | null
  books: string[] | null
  books_min_count: number | null
  operator: string | null
  value: number | null
  direction: 'highest' | 'lowest' | null
}

const VALID_BOOKS = ['fanduel', 'caesars', 'betmgm', 'betrivers', 'fanatics']
const TIEBREAKER_CATEGORIES = ['odds', 'dugout_specs', 'pitchlog_stat', 'savant_stat', 'picks']
// A tiebreaker chain longer than this has no real practical purpose — by
// the time 5 fields haven't disambiguated a tie, the rule is "keep them
// all" anyway (see resolveTiebreakers in matrixEngine.ts).
const MAX_TIEBREAKERS = 5
const PIPELINE_STEP_KINDS = ['filter', 'group', 'rank']
// 'tied' deliberately excluded — a filter step's threshold operator is
// never "tied," that's what a group step is for.
const PIPELINE_OPERATORS = ['gte', 'lte', 'eq', 'up', 'down', 'flat', 'positive', 'negative']
const MAX_PIPELINE_STEPS = 10

function validatePipelineSteps(raw: unknown): PipelineStepInput[] {
  if (!Array.isArray(raw)) return []
  const clean: PipelineStepInput[] = []
  for (const s of raw.slice(0, MAX_PIPELINE_STEPS)) {
    if (!s || typeof s !== 'object') continue
    const { kind, category, field_key, recency, book, books, books_min_count, operator, value, direction } = s as Record<string, unknown>
    if (!PIPELINE_STEP_KINDS.includes(kind as string)) continue
    if (!TIEBREAKER_CATEGORIES.includes(category as string)) continue
    if (typeof field_key !== 'string' || !field_key) continue
    const cleanBooks = Array.isArray(books) ? books.filter((b): b is string => typeof b === 'string' && VALID_BOOKS.includes(b)) : null
    clean.push({
      kind: kind as PipelineStepInput['kind'],
      category: category as PipelineStepInput['category'],
      field_key,
      recency: typeof recency === 'string' ? recency : null,
      book: typeof book === 'string' && VALID_BOOKS.includes(book) ? book : null,
      books: cleanBooks?.length ? cleanBooks : null,
      books_min_count: typeof books_min_count === 'number' ? Math.max(1, Math.round(books_min_count)) : null,
      operator: typeof operator === 'string' && PIPELINE_OPERATORS.includes(operator) ? operator : null,
      value: typeof value === 'number' ? value : null,
      direction: direction === 'lowest' ? 'lowest' : direction === 'highest' ? 'highest' : null,
    })
  }
  return clean
}

function validateTiebreakers(raw: unknown): TiebreakerInput[] {
  if (!Array.isArray(raw)) return []
  const clean: TiebreakerInput[] = []
  for (const t of raw.slice(0, MAX_TIEBREAKERS)) {
    if (!t || typeof t !== 'object') continue
    const { category, field_key, recency, book, direction } = t as Record<string, unknown>
    if (!TIEBREAKER_CATEGORIES.includes(category as string)) continue
    if (typeof field_key !== 'string' || !field_key) continue
    clean.push({
      category: category as TiebreakerInput['category'],
      field_key,
      recency: typeof recency === 'string' ? recency : null,
      book: typeof book === 'string' && VALID_BOOKS.includes(book) ? book : null,
      direction: direction === 'lowest' ? 'lowest' : 'highest',
    })
  }
  return clean
}

function validateFactors(factors: unknown): { ok: true; factors: FactorInput[] } | { ok: false; error: string } {
  if (!Array.isArray(factors) || !factors.length) return { ok: false, error: 'A Matrix needs at least one Factor.' }
  if (factors.length > MAX_FACTORS_PER_MATRIX) return { ok: false, error: `A Matrix can hold at most ${MAX_FACTORS_PER_MATRIX} Factors.` }
  const clean: FactorInput[] = []
  for (const f of factors) {
    if (!f || typeof f !== 'object') return { ok: false, error: 'Malformed Factor.' }
    const { category, field_key, operator, value, recency, recency_start, recency_end, books, books_min_count, tie_scope, tiebreakers } = f as Record<string, unknown>
    if (!['odds', 'dugout_specs', 'pitchlog_stat', 'savant_stat', 'picks'].includes(category as string)) return { ok: false, error: 'Invalid Factor category.' }
    if (typeof field_key !== 'string' || !field_key) return { ok: false, error: 'Invalid Factor field.' }
    if (!['gte', 'lte', 'eq', 'up', 'down', 'flat', 'positive', 'negative', 'tied'].includes(operator as string)) return { ok: false, error: 'Invalid Factor condition.' }
    const cleanBooks = Array.isArray(books) ? books.filter((b): b is string => typeof b === 'string' && VALID_BOOKS.includes(b)) : null
    clean.push({
      category: category as FactorInput['category'],
      field_key,
      operator: operator as FactorInput['operator'],
      value: typeof value === 'number' ? value : null,
      recency: typeof recency === 'string' ? recency : null,
      recency_start: typeof recency_start === 'string' ? recency_start : null,
      recency_end: typeof recency_end === 'string' ? recency_end : null,
      books: cleanBooks?.length ? cleanBooks : null,
      books_min_count: typeof books_min_count === 'number' ? Math.max(1, Math.round(books_min_count)) : null,
      tie_scope: tie_scope === 'game' ? 'game' : tie_scope === 'team' ? 'team' : null,
      tiebreakers: validateTiebreakers(tiebreakers),
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
    .select('id, matrix_id, position, category, field_key, operator, value, recency, recency_start, recency_end, books, books_min_count, tie_scope, tiebreakers')
    .in('matrix_id', matrices.map(m => m.id))
    .order('position', { ascending: true })
  if (factorsError) return NextResponse.json({ error: factorsError.message }, { status: 500 })

  const { data: pipelineSteps, error: stepsError } = await admin
    .from('matrix_pipeline_steps')
    .select('id, matrix_id, position, kind, category, field_key, recency, book, books, books_min_count, operator, value, direction')
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
    validatedSteps = validatePipelineSteps(body?.pipeline_steps)
    if (!validatedSteps.length) return NextResponse.json({ error: 'A Pipeline needs at least one step.' }, { status: 400 })
  } else {
    const validated = validateFactors(body?.factors)
    if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 })
    validatedFactors = validated.factors
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
