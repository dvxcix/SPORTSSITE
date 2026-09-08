import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireTier } from '@/lib/requireTier'
import { safeApiError } from '@/lib/safeApiError'

export const revalidate = 0

export async function GET() {
  const gate = await requireTier('ultimate')
  if (gate.error) return gate.error
  const admin = createAdminClient()
  const { data, error } = await admin.from('nfl_matrix_marketplace_listings')
    .select('id, author_id, source_matrix_id, title, description, tags, matrix_type, color, snapshot, copy_count, published_at, updated_at')
    .eq('status', 'published').order('published_at', { ascending: false }).limit(100)
  if (error) return safeApiError('nfl-matrix-marketplace-list', error, 'Could not load NFL community Matrices.')
  return NextResponse.json({ listings: data ?? [] })
}

export async function POST(req: Request) {
  const gate = await requireTier('ultimate')
  if (gate.error) return gate.error
  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  const matrixId = typeof body?.matrix_id === 'string' ? body.matrix_id : ''
  const admin = createAdminClient()
  const { data: matrix } = await admin.from('nfl_matrices')
    .select('id, name, color, matrix_type, match_mode, match_any_count, pipeline_scope, definition, element_code')
    .eq('id', matrixId).eq('user_id', gate.userId!).maybeSingle()
  if (!matrix) return NextResponse.json({ error: 'NFL Matrix not found.' }, { status: 404 })
  const title = typeof body?.title === 'string' && body.title.trim() ? body.title.trim().slice(0, 100) : matrix.name
  const description = typeof body?.description === 'string' ? body.description.trim().slice(0, 1000) : ''
  const tags = Array.isArray(body?.tags) ? body.tags.filter((tag): tag is string => typeof tag === 'string').map(tag => tag.trim().slice(0, 28)).filter(Boolean).slice(0, 8) : []
  const payload = {
    author_id: gate.userId!, source_matrix_id: matrix.id, title, description, tags,
    matrix_type: matrix.matrix_type, color: matrix.color, snapshot: matrix,
    status: 'published', updated_at: new Date().toISOString(),
  }
  const { data: existing } = await admin.from('nfl_matrix_marketplace_listings').select('id').eq('author_id', gate.userId!).eq('source_matrix_id', matrix.id).maybeSingle()
  const query = existing
    ? admin.from('nfl_matrix_marketplace_listings').update(payload).eq('id', existing.id).select('id').single()
    : admin.from('nfl_matrix_marketplace_listings').insert(payload).select('id').single()
  const { data, error } = await query
  if (error) return safeApiError('nfl-matrix-marketplace-publish', error, 'Could not publish the NFL Matrix.')
  return NextResponse.json({ id: data.id }, { status: existing ? 200 : 201 })
}
