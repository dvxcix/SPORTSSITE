import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { WHOP_PLANS, checkoutApiKeyEnvFor } from '@slipsurge/core/tiers'
import { PLATFORM_URL } from '@/lib/platform'
import { consumeServerRateLimit } from '@/lib/serverRateLimit'
import { safeApiError } from '@/lib/safeApiError'
import { isTrustedWhopUrl } from '@/lib/whopUrl'

export const revalidate = 0

// Creates a Whop Checkout Session server-to-server, attaching the current
// SlipSurge account's id as metadata so the webhook can reliably map a
// completed payment back to the right account (no email-matching guesswork).
// The embed on /pricing renders against the returned sessionId rather than a
// bare planId. See plan doc "Account linking" for why this exists.
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const planId = body?.planId
  if (typeof planId !== 'string' || !WHOP_PLANS[planId]) {
    return NextResponse.json({ error: 'Unknown plan' }, { status: 400 })
  }

  // plan_Q1Ey6RMgjS9XQ (the Discord add-on) lives under a completely
  // separate Whop business from every other plan here — using WHOP_API_KEY
  // for it 404s ("No such Plan found"), confirmed live, since that key only
  // sees plans in the main business.
  const apiKeyEnv = checkoutApiKeyEnvFor(planId)
  const apiKey = process.env[apiKeyEnv]
  if (!apiKey) return NextResponse.json({ error: 'Checkout is temporarily unavailable' }, { status: 503 })

  // A short rolling window prevents checkout-session spam without locking a
  // legitimate member out for an hour after a browser retry or provider
  // interruption.
  const rate = await consumeServerRateLimit(user.id, 'whop_checkout', 12, 5 * 60)
  if (!rate.available) return NextResponse.json({ error: 'Checkout is temporarily unavailable' }, { status: 503 })
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Please wait a few minutes before trying checkout again.' },
      { status: 429, headers: { 'Retry-After': '300' } },
    )
  }

  try {
    const res = await fetch('https://api.whop.com/api/v2/checkout_sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
      plan_id: planId,
      metadata: { internal_user_id: user.id },
      // No ?status= of our own — Whop appends the real outcome itself.
      redirect_url: `${PLATFORM_URL}/pricing`,
      }),
      signal: AbortSignal.timeout(20_000),
    })

    if (!res.ok) return safeApiError('whop-checkout-session', { status: res.status }, 'Checkout is temporarily unavailable', 502)

    const data = await res.json().catch(() => null)
    if (!data || typeof data.id !== 'string' || !isTrustedWhopUrl(data.purchase_url)) {
      return safeApiError('whop-checkout-session-shape', null, 'Checkout is temporarily unavailable', 502)
    }
    return NextResponse.json({ sessionId: data.id, purchaseUrl: data.purchase_url })
  } catch (error) {
    return safeApiError('whop-checkout-session', error, 'Checkout is temporarily unavailable', 502)
  }
}
