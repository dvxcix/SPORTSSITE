import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { safeApiError } from '@/lib/safeApiError'
import { consumeServerRateLimit } from '@/lib/serverRateLimit'
import { isTrustedPushEndpoint, isValidPushKey } from '@/lib/pushEndpoint'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const rate = await consumeServerRateLimit(user.id, 'push_subscription_mutation', 30, 3600)
  if (!rate.available) return NextResponse.json({ error: 'Notification service is temporarily unavailable' }, { status: 503 })
  if (!rate.allowed) return NextResponse.json({ error: 'Too many notification changes. Try again later.' }, { status: 429 })

  const body = await request.json().catch(() => null)
  const endpoint = body?.endpoint as string | undefined
  const p256dh = body?.keys?.p256dh as string | undefined
  const auth = body?.keys?.auth as string | undefined
  if (!isTrustedPushEndpoint(endpoint) || !isValidPushKey(p256dh, 512) || !isValidPushKey(auth, 256)) {
    return NextResponse.json({ error: 'Malformed subscription' }, { status: 400 })
  }

  // endpoint is globally unique per browser/device subscription — upserting
  // on it means re-subscribing (e.g. after a permission reset) updates the
  // existing row instead of accumulating duplicates.
  const { error } = await createAdminClient().from('push_subscriptions').upsert({
    user_id: user.id,
    endpoint,
    p256dh,
    auth,
  }, { onConflict: 'endpoint' })

  if (error) return safeApiError('push-subscribe', error, 'Could not enable notifications.')
  return NextResponse.json({ ok: true })
}
