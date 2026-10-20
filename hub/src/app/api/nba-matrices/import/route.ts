import { randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePaintAccess } from '@/lib/paintAccess'
import { safeApiError } from '@/lib/safeApiError'
import { validateNbaMatrixDefinition } from '@/lib/nbaMatrix'

export async function POST(req: Request) {
  const gate = await requirePaintAccess()
  if (gate.error) return gate.error
  const body = await req.json().catch(() => null) as { element_code?: string } | null
  const code = typeof body?.element_code === 'string' ? body.element_code.trim().toUpperCase() : ''
  if (!/^NBA-[A-F0-9]{8}$/.test(code)) return NextResponse.json({ error: 'Enter an NBA Matrix code.' }, { status: 400 })
  const admin = createAdminClient()
  const { data: source } = await admin.from('nba_matrices').select('name, color, matrix_type, match_mode, match_any_count, pipeline_scope, definition').eq('element_code', code).maybeSingle()
  if (!source) return NextResponse.json({ error: 'NBA Matrix code not found.' }, { status: 404 })
  if (!validateNbaMatrixDefinition(source.matrix_type, source.definition)) return NextResponse.json({ error: 'This NBA Matrix needs updating before import.' }, { status: 400 })
  const { count } = await admin.from('nba_matrices').select('id', { count: 'exact', head: true }).eq('user_id', gate.userId!)
  if ((count ?? 0) >= 20) return NextResponse.json({ error: 'You can save up to 20 NBA Matrices.' }, { status: 400 })
  const { data, error } = await admin.from('nba_matrices').insert({ ...source, user_id: gate.userId!, priority: count ?? 0, element_code: `NBA-${randomBytes(4).toString('hex').toUpperCase()}` }).select('id').single()
  if (error) return safeApiError('nba-matrix-import', error, 'Could not import the NBA Matrix.')
  return NextResponse.json({ id: data.id }, { status: 201 })
}
