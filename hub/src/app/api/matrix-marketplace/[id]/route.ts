import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireTier } from '@/lib/requireTier'
import { safeApiError } from '@/lib/safeApiError'

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireTier('ultimate')
  if (gate.error) return gate.error
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Listing not found.' }, { status: 404 })
  const { data, error } = await createAdminClient()
    .from('matrix_marketplace_listings')
    .update({ status: 'unlisted' })
    .eq('id', id)
    .eq('author_id', gate.userId!)
    .eq('status', 'published')
    .select('id')
    .maybeSingle()
  if (error) return safeApiError('matrix-marketplace-unlist', error, 'Could not unlist this Matrix.')
  if (!data) return NextResponse.json({ error: 'Listing not found.' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
