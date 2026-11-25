import { NextResponse } from 'next/server'
import { creatorRouteAccount } from '@/lib/creatorRouteAccount'
import { createAdminClient } from '@/lib/supabase/admin'
import { restoreCreatorAccess } from '@/lib/creatorAccessRestore'
import { consumeServerRateLimit } from '@/lib/serverRateLimit'
import { safeApiError } from '@/lib/safeApiError'

export async function POST(request: Request, context: { params: Promise<{ productId: string }> }) {
  const account = await creatorRouteAccount(request, 'Sign in to link your membership.')
  if (account.error) return account.error
  const { userId } = account
  const { productId } = await context.params
  if (!/^[0-9a-f-]{36}$/i.test(productId)) return NextResponse.json({ error: 'Offer not found.' }, { status: 404 })
  const limit = await consumeServerRateLimit(userId, 'creator_access_restore', 10, 3600)
  if (!limit.available || !limit.allowed) return NextResponse.json({ error: 'Please wait before checking again.' }, { status: limit.available ? 429 : 503 })
  try { return NextResponse.json(await restoreCreatorAccess(createAdminClient(), userId, productId), { headers: { 'Cache-Control': 'private, no-store' } }) }
  catch (cause) { return safeApiError('creator-access-restore', cause, 'Whop access could not be checked. Your existing access has not been changed.', 502) }
}
