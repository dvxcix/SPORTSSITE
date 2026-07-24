import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireTier } from '@/lib/requireTier'

export const revalidate = 0

const MAX_FACTORS_PER_MATRIX = 40

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
      }))
    )
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })
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
