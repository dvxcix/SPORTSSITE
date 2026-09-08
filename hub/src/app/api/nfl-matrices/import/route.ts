import { randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireTier } from '@/lib/requireTier'
import { safeApiError } from '@/lib/safeApiError'

export async function POST(req: Request) {
  const gate = await requireTier('ultimate')
  if (gate.error) return gate.error
  const body = await req.json().catch(() => null) as { element_code?: string } | null
  const code = body?.element_code?.trim().toUpperCase()
  if (!code?.startsWith('NFL-')) return NextResponse.json({ error: 'Enter an NFL Matrix code.' }, { status: 400 })
  const admin = createAdminClient()
  const { data: source } = await admin.from('nfl_matrices').select('name, color, matrix_type, match_mode, match_any_count, pipeline_scope, definition').eq('element_code', code).maybeSingle()
  if (!source) return NextResponse.json({ error: 'NFL Matrix code not found.' }, { status: 404 })
  const { count } = await admin.from('nfl_matrices').select('id', { count: 'exact', head: true }).eq('user_id', gate.userId!)
  if ((count ?? 0) >= 20) return NextResponse.json({ error: 'You can save up to 20 NFL Matrices.' }, { status: 400 })
  const { data, error } = await admin.from('nfl_matrices').insert({ ...source, user_id: gate.userId!, priority: count ?? 0, element_code: `NFL-${randomBytes(4).toString('hex').toUpperCase()}` }).select('id').single()
  if (error) return safeApiError('nfl-matrix-import', error, 'Could not import the NFL Matrix.')
  return NextResponse.json({ id: data.id }, { status: 201 })
}
