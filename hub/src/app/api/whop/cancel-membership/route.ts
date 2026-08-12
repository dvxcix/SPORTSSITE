import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkoutApiKeyEnvFor } from '@slipsurge/core/tiers'
import { cancelWhopMembership } from '@/lib/whop'
import { createAdminClient } from '@/lib/supabase/admin'
import { consumeServerRateLimit } from '@/lib/serverRateLimit'
import { safeApiError } from '@/lib/safeApiError'

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

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('users')
    .select('whop_membership_id, whop_plan_id, tier, tier_cancel_at_period_end')
    .eq('id', user.id)
    .single()

  if (!profile?.whop_membership_id || !profile?.whop_plan_id) {
    return NextResponse.json({ error: 'No active Whop subscription found on this account' }, { status: 400 })
  }

  // Cancellation is idempotent. A refresh, double-click, or client retry
  // after Whop accepted the first request should return success without
  // spending another rate-limit token or calling Whop again.
  if (profile.tier_cancel_at_period_end) {
    return NextResponse.json({ ok: true, alreadyScheduled: true })
  }

  const apiKeyEnv = checkoutApiKeyEnvFor(profile.whop_plan_id)
  const apiKey = process.env[apiKeyEnv]
  if (!apiKey) return NextResponse.json({ error: 'Cancellation is temporarily unavailable' }, { status: 503 })

  const rate = await consumeServerRateLimit(user.id, 'whop_cancel', 10, 5 * 60)
  if (!rate.available) return NextResponse.json({ error: 'Cancellation is temporarily unavailable' }, { status: 503 })
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Please wait a few minutes before trying cancellation again.' },
      { status: 429, headers: { 'Retry-After': '300' } },
    )
  }

  const result = await cancelWhopMembership(profile.whop_membership_id, apiKey)
  if (!result.ok) {
    return safeApiError('whop-cancel-membership', { status: result.status }, 'Cancellation is temporarily unavailable', 502)
  }

  const { error: updateError } = await admin.from('users').update({ tier_cancel_at_period_end: true }).eq('id', user.id)
  if (updateError) return safeApiError('whop-cancel-membership-state', updateError, 'Cancellation was received, but account status could not be refreshed', 502)
  return NextResponse.json({ ok: true })
}
