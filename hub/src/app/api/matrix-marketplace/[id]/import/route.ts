import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireTier } from '@/lib/requireTier'
import { insertWithUniqueElementCode } from '@/lib/elementCode'
import { readMarketplaceSnapshot } from '@/lib/matrixMarketplace'
import { safeApiError } from '@/lib/safeApiError'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireTier('ultimate')
  if (gate.error) return gate.error
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'This Matrix is no longer available.' }, { status: 404 })
  const admin = createAdminClient()
  const { data: listing } = await admin
    .from('matrix_marketplace_listings')
    .select('id, snapshot, status')
    .eq('id', id)
    .eq('status', 'published')
    .maybeSingle()
  if (!listing) return NextResponse.json({ error: 'This Matrix is no longer available.' }, { status: 404 })

  const snapshot = readMarketplaceSnapshot(listing.snapshot)
  if (!snapshot) return NextResponse.json({ error: 'This Matrix snapshot is invalid.' }, { status: 409 })
  const { count } = await admin.from('matrices').select('id', { count: 'exact', head: true }).eq('user_id', gate.userId!)
  if ((count ?? 0) >= 10) return NextResponse.json({ error: 'You can save up to 10 Matrices. Remove one before adding this.' }, { status: 400 })

  const inserted = await insertWithUniqueElementCode(admin, 'matrices', elementCode => ({
    user_id: gate.userId!,
    name: snapshot.name,
    color: snapshot.color,
    priority: 1,
    match_mode: snapshot.match_mode,
    match_any_count: snapshot.match_any_count,
    matrix_type: snapshot.matrix_type,
    pipeline_scope: snapshot.pipeline_scope,
    element_code: elementCode,
  }))
  if (inserted.error || !inserted.data) return safeApiError('marketplace-matrix-create', inserted.error, 'Could not add this Matrix.')

  const matrixId = inserted.data.id as string
  const childError = snapshot.matrix_type === 'pipeline'
    ? (await admin.from('matrix_pipeline_steps').insert(snapshot.pipeline_steps.map(step => ({ ...step, matrix_id: matrixId })))).error
    : (await admin.from('matrix_factors').insert(snapshot.factors.map(factor => ({ ...factor, matrix_id: matrixId })))).error

  if (childError) {
    await admin.from('matrices').delete().eq('id', matrixId)
    return safeApiError('marketplace-matrix-clone', childError, 'Could not add this Matrix.')
  }

  await admin.from('matrix_marketplace_imports').insert({ listing_id: listing.id, user_id: gate.userId!, imported_matrix_id: matrixId })
  return NextResponse.json({ matrix: inserted.data })
}
