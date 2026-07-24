import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireTier } from '@/lib/requireTier'
import { insertWithUniqueElementCode } from '@/lib/elementCode'

export const revalidate = 0

const MAX_FACTORS_PER_MATRIX = 40

type FactorInput = {
  category: 'odds' | 'pitchlog_stat' | 'savant_stat' | 'picks'
  field_key: string
  operator: 'gte' | 'lte' | 'eq' | 'up' | 'down' | 'flat'
  value: number | null
  recency: string | null
  recency_start: string | null
  recency_end: string | null
}

function validateFactors(factors: unknown): { ok: true; factors: FactorInput[] } | { ok: false; error: string } {
  if (!Array.isArray(factors) || !factors.length) return { ok: false, error: 'A Matrix needs at least one Factor.' }
  if (factors.length > MAX_FACTORS_PER_MATRIX) return { ok: false, error: `A Matrix can hold at most ${MAX_FACTORS_PER_MATRIX} Factors.` }
  const clean: FactorInput[] = []
  for (const f of factors) {
    if (!f || typeof f !== 'object') return { ok: false, error: 'Malformed Factor.' }
    const { category, field_key, operator, value, recency, recency_start, recency_end } = f as Record<string, unknown>
    if (!['odds', 'pitchlog_stat', 'savant_stat', 'picks'].includes(category as string)) return { ok: false, error: 'Invalid Factor category.' }
    if (typeof field_key !== 'string' || !field_key) return { ok: false, error: 'Invalid Factor field.' }
    if (!['gte', 'lte', 'eq', 'up', 'down', 'flat'].includes(operator as string)) return { ok: false, error: 'Invalid Factor condition.' }
    clean.push({
      category: category as FactorInput['category'],
      field_key,
      operator: operator as FactorInput['operator'],
      value: typeof value === 'number' ? value : null,
      recency: typeof recency === 'string' ? recency : null,
      recency_start: typeof recency_start === 'string' ? recency_start : null,
      recency_end: typeof recency_end === 'string' ? recency_end : null,
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
    .select('id, name, color, priority, match_mode, match_any_count, element_code, created_at, updated_at')
    .eq('user_id', gate.userId!)
    .order('priority', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!matrices?.length) return NextResponse.json({ matrices: [] })

  const { data: factors, error: factorsError } = await admin
    .from('matrix_factors')
    .select('id, matrix_id, position, category, field_key, operator, value, recency, recency_start, recency_end')
    .in('matrix_id', matrices.map(m => m.id))
    .order('position', { ascending: true })
  if (factorsError) return NextResponse.json({ error: factorsError.message }, { status: 500 })

  const factorsByMatrix = new Map<string, typeof factors>()
  for (const f of factors ?? []) factorsByMatrix.set(f.matrix_id, [...(factorsByMatrix.get(f.matrix_id) ?? []), f])

  return NextResponse.json({
    matrices: matrices.map(m => ({ ...m, factors: factorsByMatrix.get(m.id) ?? [] })),
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

  if (!name) return NextResponse.json({ error: 'Give this Matrix a name.' }, { status: 400 })
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return NextResponse.json({ error: 'Pick a valid color.' }, { status: 400 })

  const validated = validateFactors(body?.factors)
  if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 })

  const admin = createAdminClient()
  const inserted = await insertWithUniqueElementCode(admin, 'matrices', elementCode => ({
    user_id: gate.userId!, name, color, priority, match_mode: matchMode, match_any_count: matchAnyCount, element_code: elementCode,
  }))
  if (inserted.error || !inserted.data) {
    // The cap trigger raises a plain exception, not a Postgres error code —
    // surfaced to the member as the real reason, not a generic 500.
    const message = inserted.error ?? 'Could not save this Matrix.'
    const capHit = message.includes('MATRIX_CAP_REACHED')
    return NextResponse.json({ error: capHit ? 'You can save up to 10 Matrices — delete one to make room.' : message }, { status: capHit ? 400 : 500 })
  }

  const matrixId = inserted.data.id as string
  const { error: factorsError } = await admin.from('matrix_factors').insert(
    validated.factors.map((f, i) => ({ ...f, matrix_id: matrixId, position: i }))
  )
  if (factorsError) {
    await admin.from('matrices').delete().eq('id', matrixId) // don't leave a Factor-less Matrix behind
    return NextResponse.json({ error: factorsError.message }, { status: 500 })
  }

  return NextResponse.json({ matrix: inserted.data })
}
