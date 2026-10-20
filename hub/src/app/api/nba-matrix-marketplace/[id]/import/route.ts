import { randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePaintAccess } from '@/lib/paintAccess'
import { safeApiError } from '@/lib/safeApiError'
import { validateNbaMatrixDefinition } from '@/lib/nbaMatrix'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePaintAccess()
  if (gate.error) return gate.error
  const { id } = await params
  const admin = createAdminClient()
  const { data: listing } = await admin.from('nba_matrix_marketplace_listings').select('id, snapshot').eq('id', id).eq('status', 'published').maybeSingle()
  if (!listing) return NextResponse.json({ error: 'NBA community Matrix not found.' }, { status: 404 })
  const { count } = await admin.from('nba_matrices').select('id', { count: 'exact', head: true }).eq('user_id', gate.userId!)
  if ((count ?? 0) >= 20) return NextResponse.json({ error: 'You can save up to 20 NBA Matrices.' }, { status: 400 })
  const source = listing.snapshot as Record<string, unknown>
  if (!['classic','pipeline'].includes(String(source.matrix_type)) || !validateNbaMatrixDefinition(source.matrix_type as 'classic' | 'pipeline', source.definition)) return NextResponse.json({ error: 'This NBA Matrix needs updating before import.' }, { status: 400 })
  const { data, error } = await admin.from('nba_matrices').insert({
    user_id: gate.userId!, name: source.name, color: source.color, priority: count ?? 0, enabled: true,
    matrix_type: source.matrix_type, match_mode: source.match_mode, match_any_count: source.match_any_count,
    pipeline_scope: source.pipeline_scope, definition: source.definition,
    element_code: `NBA-${randomBytes(4).toString('hex').toUpperCase()}`,
  }).select('id').single()
  if (error) return safeApiError('nba-marketplace-import', error, 'Could not add the NBA Matrix.')
  await admin.from('nba_matrix_marketplace_imports').upsert({ listing_id: listing.id, user_id: gate.userId!, imported_matrix_id: data.id }, { onConflict: 'listing_id,user_id' })
  await admin.rpc('increment_nba_matrix_copy_count', { listing_uuid: listing.id }).then(() => null, () => null)
  return NextResponse.json({ id: data.id }, { status: 201 })
}
