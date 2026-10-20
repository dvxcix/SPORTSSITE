import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePaintAccess } from '@/lib/paintAccess'
import { safeApiError } from '@/lib/safeApiError'
import { validateNbaMatrixDefinition } from '@/lib/nbaMatrix'

export const revalidate = 0

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePaintAccess()
  if (gate.error) return gate.error
  const { id } = await params
  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  const admin = createAdminClient()
  const { data: owned } = await admin.from('nba_matrices').select('id, matrix_type').eq('id', id).eq('user_id', gate.userId!).maybeSingle()
  if (!owned) return NextResponse.json({ error: 'NBA Matrix not found.' }, { status: 404 })
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  const matrixType = body?.matrix_type === 'pipeline' || body?.matrix_type === 'classic' ? body.matrix_type : owned.matrix_type
  if (matrixType !== owned.matrix_type && body?.definition == null) return NextResponse.json({ error: 'A complete definition is required when changing Matrix type.' }, { status: 400 })
  if (matrixType !== owned.matrix_type) updates.matrix_type = matrixType
  if (typeof body?.name === 'string' && body.name.trim()) updates.name = body.name.trim().slice(0, 80)
  if (typeof body?.color === 'string' && /^#[0-9a-f]{6}$/i.test(body.color)) updates.color = body.color
  if (typeof body?.enabled === 'boolean') updates.enabled = body.enabled
  if (typeof body?.priority === 'number' && Number.isFinite(body.priority)) updates.priority = Math.min(100, Math.max(0, Math.round(body.priority)))
  if (body?.match_mode === 'all' || body?.match_mode === 'any') updates.match_mode = body.match_mode
  if (typeof body?.match_any_count === 'number' && Number.isFinite(body.match_any_count)) updates.match_any_count = Math.min(40, Math.max(1, Math.round(body.match_any_count)))
  if (body?.pipeline_scope === 'team' || body?.pipeline_scope === 'game') updates.pipeline_scope = body.pipeline_scope
  if (body?.definition != null) {
    const definition = validateNbaMatrixDefinition(matrixType, body.definition)
    if (!definition) return NextResponse.json({ error: 'The NBA Matrix contains an incomplete condition.' }, { status: 400 })
    updates.definition = definition
  }
  const { error } = await admin.from('nba_matrices').update(updates).eq('id', id).eq('user_id', gate.userId!)
  if (error) return safeApiError('nba-matrix-update', error, 'Could not update the NBA Matrix.')
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePaintAccess()
  if (gate.error) return gate.error
  const { id } = await params
  const admin = createAdminClient()
  const { error } = await admin.from('nba_matrices').delete().eq('id', id).eq('user_id', gate.userId!)
  if (error) return safeApiError('nba-matrix-delete', error, 'Could not delete the NBA Matrix.')
  return NextResponse.json({ ok: true })
}
