import { randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePaintAccess } from '@/lib/paintAccess'
import { safeApiError } from '@/lib/safeApiError'
import { validateNbaMatrixDefinition } from '@/lib/nbaMatrix'

export const revalidate = 0

function elementCode() {
  return `NBA-${randomBytes(4).toString('hex').toUpperCase()}`
}

export async function GET() {
  const gate = await requirePaintAccess()
  if (gate.error) return gate.error
  const admin = createAdminClient()
  const { data, error } = await admin.from('nba_matrices')
    .select('id, name, color, priority, enabled, matrix_type, match_mode, match_any_count, pipeline_scope, definition, element_code, created_at, updated_at')
    .eq('user_id', gate.userId!).order('priority').order('created_at')
  if (error) return safeApiError('nba-matrices-list', error, 'Could not load NBA Matrices.')
  return NextResponse.json({ matrices: data ?? [] })
}

export async function POST(req: Request) {
  const gate = await requirePaintAccess()
  if (gate.error) return gate.error
  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 80) : ''
  const color = typeof body?.color === 'string' && /^#[0-9a-f]{6}$/i.test(body.color) ? body.color : '#a7ff3f'
  const matrixType = body?.matrix_type === 'pipeline' ? 'pipeline' : 'classic'
  const definition = validateNbaMatrixDefinition(matrixType, body?.definition)
  if (!name || !definition) return NextResponse.json({ error: 'Name and at least one complete NBA condition are required.' }, { status: 400 })
  const matchMode = body?.match_mode === 'any' ? 'any' : 'all'
  const matchAnyCount = matchMode === 'any' && typeof body?.match_any_count === 'number' && Number.isFinite(body.match_any_count) ? Math.min(40, Math.max(1, Math.round(body.match_any_count))) : null
  const pipelineScope = matrixType === 'pipeline' && body?.pipeline_scope === 'game' ? 'game' : matrixType === 'pipeline' ? 'team' : null

  const admin = createAdminClient()
  const { count, error: countError } = await admin.from('nba_matrices').select('id', { count: 'exact', head: true }).eq('user_id', gate.userId!)
  if (countError) return safeApiError('nba-matrix-count', countError, 'Could not save the NBA Matrix.')
  if ((count ?? 0) >= 20) return NextResponse.json({ error: 'You can save up to 20 NBA Matrices.' }, { status: 400 })
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { data, error } = await admin.from('nba_matrices').insert({
      user_id: gate.userId!, name, color, matrix_type: matrixType, match_mode: matchMode,
      match_any_count: matchAnyCount, pipeline_scope: pipelineScope, definition,
      priority: count ?? 0, element_code: elementCode(),
    }).select('id').single()
    if (!error) return NextResponse.json({ id: data.id }, { status: 201 })
    if (error.code !== '23505') return safeApiError('nba-matrix-create', error, 'Could not save the NBA Matrix.')
  }
  return NextResponse.json({ error: 'Could not allocate an NBA Matrix code.' }, { status: 500 })
}
