import { randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireTier } from '@/lib/requireTier'
import { safeApiError } from '@/lib/safeApiError'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireTier('ultimate')
  if (gate.error) return gate.error
  const { id } = await params
  const admin = createAdminClient()
  const { data: listing } = await admin.from('nfl_matrix_marketplace_listings').select('id, snapshot').eq('id', id).eq('status', 'published').maybeSingle()
  if (!listing) return NextResponse.json({ error: 'NFL community Matrix not found.' }, { status: 404 })
  const { count } = await admin.from('nfl_matrices').select('id', { count: 'exact', head: true }).eq('user_id', gate.userId!)
  if ((count ?? 0) >= 20) return NextResponse.json({ error: 'You can save up to 20 NFL Matrices.' }, { status: 400 })
  const source = listing.snapshot as Record<string, unknown>
  const { data, error } = await admin.from('nfl_matrices').insert({
    user_id: gate.userId!, name: source.name, color: source.color, priority: count ?? 0, enabled: true,
    matrix_type: source.matrix_type, match_mode: source.match_mode, match_any_count: source.match_any_count,
    pipeline_scope: source.pipeline_scope, definition: source.definition,
    element_code: `NFL-${randomBytes(4).toString('hex').toUpperCase()}`,
  }).select('id').single()
  if (error) return safeApiError('nfl-marketplace-import', error, 'Could not add the NFL Matrix.')
  await admin.from('nfl_matrix_marketplace_imports').upsert({ listing_id: listing.id, user_id: gate.userId!, imported_matrix_id: data.id }, { onConflict: 'listing_id,user_id' })
  await admin.rpc('increment_nfl_matrix_copy_count', { listing_uuid: listing.id }).then(() => null, () => null)
  return NextResponse.json({ id: data.id }, { status: 201 })
}
