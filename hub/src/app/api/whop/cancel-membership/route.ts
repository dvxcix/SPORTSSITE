import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkoutApiKeyEnvFor } from '@/lib/tiers'
import { cancelWhopMembership } from '@/lib/whop'

export const revalidate = 0

// Mirrors checkout-session/route.ts's shape: auth gate, then look up the
// CALLING user's own Whop fields server-side (never accept a membership id
// from the request body) so this can never touch another account's billing.
//
// Deliberately doesn't flip tier/tier_status here — Whop's cancellation
// leaves access active until period end, and the existing webhook
// (membership.deactivated/went_invalid) already handles the real downgrade
// once Whop actually ends the membership. This only sets the optimistic
// tier_cancel_at_period_end flag so the UI can reflect "cancellation
// scheduled" immediately instead of waiting on that webhook.
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users')
    .select('whop_membership_id, whop_plan_id, tier')
    .eq('id', user.id)
    .single()

  if (!profile?.whop_membership_id || !profile?.whop_plan_id) {
    return NextResponse.json({ error: 'No active Whop subscription found on this account' }, { status: 400 })
  }

  const apiKeyEnv = checkoutApiKeyEnvFor(profile.whop_plan_id)
  const apiKey = process.env[apiKeyEnv]
  if (!apiKey) return NextResponse.json({ error: `${apiKeyEnv} is not configured` }, { status: 500 })

  const result = await cancelWhopMembership(profile.whop_membership_id, apiKey)
  if (!result.ok) {
    return NextResponse.json({ error: `Whop cancellation failed: ${result.status} ${result.error}` }, { status: 502 })
  }

  await supabase.from('users').update({ tier_cancel_at_period_end: true }).eq('id', user.id)
  return NextResponse.json({ ok: true })
}
