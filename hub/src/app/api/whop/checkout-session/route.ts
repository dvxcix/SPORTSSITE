import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { WHOP_PLANS } from '@/lib/tiers'
import { PLATFORM_URL } from '@/lib/stripe'

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

  const apiKey = process.env.WHOP_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'WHOP_API_KEY is not configured' }, { status: 500 })

  const res = await fetch('https://api.whop.com/api/v2/checkout_sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      plan_id: planId,
      metadata: { internal_user_id: user.id },
      redirect_url: `${PLATFORM_URL}/pricing?status=success`,
    }),
  })

  if (!res.ok) {
    const errBody = await res.text().catch(() => '')
    return NextResponse.json({ error: `Whop checkout session creation failed: ${res.status} ${errBody}` }, { status: 502 })
  }

  const data = await res.json()
  return NextResponse.json({ sessionId: data.id, purchaseUrl: data.purchase_url })
}
