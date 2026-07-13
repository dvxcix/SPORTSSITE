import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getStripe, PLATFORM_URL } from '@/lib/stripe'

// SlipSurge Pro — direct platform subscription, 100% to platform (minus Stripe fees).
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const { data: settingRow } = await supabase
    .from('platform_settings')
    .select('value')
    .eq('key', 'pro_plan_stripe_price_id')
    .single()
  const priceId = settingRow?.value as string | null

  if (!priceId) {
    return NextResponse.json({ error: 'Pro Plan price is not configured yet — set it in Admin → Monetization' }, { status: 400 })
  }

  const { data: profile } = await supabase
    .from('users')
    .select('id, email, stripe_customer_id')
    .eq('id', user.id)
    .single()
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const stripe = getStripe()
  let customerId = profile.stripe_customer_id as string | null
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: profile.email,
      metadata: { slipsurge_user_id: profile.id },
    })
    customerId = customer.id
    const { error: backfillErr } = await supabase.from('users').update({ stripe_customer_id: customerId }).eq('id', profile.id)
    if (backfillErr) console.error('[checkout/pro-plan] failed to backfill stripe_customer_id', backfillErr)
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${PLATFORM_URL}/pro?checkout=success`,
    cancel_url: `${PLATFORM_URL}/pro?checkout=cancelled`,
    metadata: { type: 'pro_plan', slipsurge_user_id: profile.id },
    subscription_data: { metadata: { type: 'pro_plan', slipsurge_user_id: profile.id } },
  })

  return NextResponse.json({ url: session.url })
}
