import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { restoreCreatorAccess } from '@/lib/creatorAccessRestore'
import { consumeServerRateLimit } from '@/lib/serverRateLimit'
import { safeApiError } from '@/lib/safeApiError'

export async function POST(_request: Request, context: { params: Promise<{ productId: string }> }) {
  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in to link your membership.' }, { status: 401 })
  const { productId } = await context.params
  if (!/^[0-9a-f-]{36}$/i.test(productId)) return NextResponse.json({ error: 'Offer not found.' }, { status: 404 })
  const limit = await consumeServerRateLimit(user.id, 'creator_access_restore', 10, 3600)
  if (!limit.available || !limit.allowed) return NextResponse.json({ error: 'Please wait before checking again.' }, { status: limit.available ? 429 : 503 })
  try { return NextResponse.json(await restoreCreatorAccess(createAdminClient(), user.id, productId), { headers: { 'Cache-Control': 'private, no-store' } }) }
  catch (cause) { return safeApiError('creator-access-restore', cause, 'Whop access could not be checked. Your existing access has not been changed.', 502) }
}
