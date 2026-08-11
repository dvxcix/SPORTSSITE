import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { safeApiError } from '@/lib/safeApiError'
import { consumeServerRateLimit } from '@/lib/serverRateLimit'
import { isTrustedPushEndpoint } from '@/lib/pushEndpoint'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const rate = await consumeServerRateLimit(user.id, 'push_subscription_mutation', 30, 3600)
  if (!rate.available) return NextResponse.json({ error: 'Notification service is temporarily unavailable' }, { status: 503 })
  if (!rate.allowed) return NextResponse.json({ error: 'Too many notification changes. Try again later.' }, { status: 429 })

  const body = await request.json().catch(() => null)
  const endpoint = body?.endpoint as string | undefined
  if (!isTrustedPushEndpoint(endpoint)) return NextResponse.json({ error: 'Malformed endpoint' }, { status: 400 })

  const { error } = await createAdminClient().from('push_subscriptions').delete().eq('endpoint', endpoint).eq('user_id', user.id)
  if (error) return safeApiError('push-unsubscribe', error, 'Could not disable notifications.')
  return NextResponse.json({ ok: true })
}
