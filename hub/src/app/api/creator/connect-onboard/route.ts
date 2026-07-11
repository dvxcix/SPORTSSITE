import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getStripe, PLATFORM_URL } from '@/lib/stripe'

// Creates (or resumes) a Stripe Connect Express account for the signed-in creator
// and returns a hosted onboarding link.
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users')
    .select('id, email, username, stripe_account_id, account_type')
    .eq('id', user.id)
    .single()

  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  if (profile.account_type !== 'creator') {
    return NextResponse.json({ error: 'Only approved creators can set up payouts' }, { status: 403 })
  }

  const stripe = getStripe()
  let accountId = profile.stripe_account_id as string | null

  if (!accountId) {
    const account = await stripe.accounts.create({
      type: 'express',
      email: profile.email,
      capabilities: { transfers: { requested: true }, card_payments: { requested: true } },
      metadata: { slipsurge_user_id: profile.id, username: profile.username ?? '' },
    })
    accountId = account.id

    const { error: updErr } = await supabase
      .from('users')
      .update({ stripe_account_id: accountId })
      .eq('id', profile.id)
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })
  }

  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${PLATFORM_URL}/creators/payouts?refresh=1`,
    return_url: `${PLATFORM_URL}/creators/payouts?onboarded=1`,
    type: 'account_onboarding',
  })

  return NextResponse.json({ url: link.url })
}
