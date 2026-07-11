import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getStripe, PLATFORM_URL } from '@/lib/stripe'

// Independent creator subscription — Stripe Connect destination charge.
// Platform keeps `fee_independent_creator_pct` (default 10%) via application_fee_percent;
// the rest flows to the creator's Connect account automatically on Stripe's own payout schedule.
export async function POST(req: Request) {
  const { tierId } = await req.json().catch(() => ({}))
  if (!tierId) return NextResponse.json({ error: 'tierId is required' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const { data: tier } = await supabase
    .from('creator_tiers')
    .select('id, creator_id, stripe_price_id, is_active')
    .eq('id', tierId)
    .single()
  if (!tier || !tier.is_active) return NextResponse.json({ error: 'Tier not found or inactive' }, { status: 404 })
  if (!tier.stripe_price_id) return NextResponse.json({ error: 'This tier has no Stripe price configured' }, { status: 400 })

  const { data: creator } = await supabase
    .from('users')
    .select('id, username, stripe_account_id, stripe_connect_charges_enabled')
    .eq('id', tier.creator_id)
    .single()
  if (!creator?.stripe_account_id || !creator.stripe_connect_charges_enabled) {
    return NextResponse.json({ error: 'This creator has not finished payout setup yet' }, { status: 400 })
  }

  const { data: settingRow } = await supabase
    .from('platform_settings')
    .select('value')
    .eq('key', 'fee_independent_creator_pct')
    .single()
  const feePct = Number(settingRow?.value ?? 10)

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
    await supabase.from('users').update({ stripe_customer_id: customerId }).eq('id', profile.id)
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: tier.stripe_price_id, quantity: 1 }],
    success_url: `${PLATFORM_URL}/profile/${creator.username}?checkout=success`,
    cancel_url: `${PLATFORM_URL}/profile/${creator.username}?checkout=cancelled`,
    subscription_data: {
      application_fee_percent: feePct,
      transfer_data: { destination: creator.stripe_account_id },
      metadata: { type: 'creator_subscription', creator_id: creator.id, subscriber_id: profile.id, tier_id: tier.id },
    },
    metadata: { type: 'creator_subscription', creator_id: creator.id, subscriber_id: profile.id, tier_id: tier.id },
  })

  return NextResponse.json({ url: session.url })
}
