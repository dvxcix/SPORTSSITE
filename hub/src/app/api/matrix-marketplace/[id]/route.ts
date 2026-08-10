import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireTier } from '@/lib/requireTier'

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireTier('ultimate')
  if (gate.error) return gate.error
  const { id } = await params
  const { data, error } = await createAdminClient()
    .from('matrix_marketplace_listings')
    .update({ status: 'unlisted' })
    .eq('id', id)
    .eq('author_id', gate.userId!)
    .eq('status', 'published')
    .select('id')
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Listing not found.' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
