import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { WHOP_PLANS, TIER_RANK, effectiveTier, type Tier } from '@slipsurge/core/tiers'
import { syncTierBadge } from '@/lib/tierBadges'
import { syncDiscordRoleForUser } from '@/lib/discord'
import { fetchAllWhopMemberships } from '@/lib/whopMembershipsFetch'
import { sendXConversion } from '@/lib/xConversion'

// Shared by the admin route (manual/emergency re-run) and the hourly cron
// (see vercel.json) — safety net for the addon Whop business's webhook,
// which was never registered in that business's dashboard (confirmed live:
// zero deliveries ever to /api/webhooks/whop-addon despite real completed
// checkouts). Pulls membership records directly via ADDON_WHOP_KEY instead
// of waiting on a webhook.
export const ADDON_PLAN_ID = 'plan_Q1Ey6RMgjS9XQ'

type ReconcileResult =
  | { error: string }
  | { totalMemberships: number; results: any[] }

export async function reconcileWhopAddon(): Promise<ReconcileResult> {
  const apiKey = process.env.ADDON_WHOP_KEY
  if (!apiKey) return { error: 'ADDON_WHOP_KEY is not configured' }

  const planInfo = WHOP_PLANS[ADDON_PLAN_ID]

  const fetched = await fetchAllWhopMemberships(apiKey, ADDON_PLAN_ID)
  if ('error' in fetched) return fetched
  const memberships = fetched.memberships

  const admin = createAdminClient()
  const results: any[] = []

  for (const m of memberships) {
    // Defensive across a few plausible field shapes — same reasoning as the
    // webhook handler, since this is the same API family with the same
    // undocumented-payload problem.
    const status: string | undefined = m.status ?? m.valid_status
    const isActive = status === 'active' || status === 'valid' || m.valid === true
    const internalUserId: string | undefined = m.metadata?.internal_user_id
    const membershipId: string | undefined = m.id
    const periodEndRaw = m.renewal_period_end ?? m.period_end ?? m.expires_at
    const periodEnd = typeof periodEndRaw === 'number'
      ? new Date(periodEndRaw * 1000).toISOString()
      : typeof periodEndRaw === 'string' ? periodEndRaw : null

    if (!internalUserId) {
      results.push({ membershipId, status, skipped: 'no internal_user_id in metadata' })
      continue
    }
    if (!isActive) {
      results.push({ membershipId, internalUserId, status, skipped: 'not active' })
      continue
    }

    // Only stamp tier_purchased_at when unset — this route re-runs on a
    // schedule and would otherwise bump it to "now" every time it sees the
    // same still-active membership, same reasoning as the webhook handler.
    const { data: existing } = await admin.from('users').select('tier, tier_purchased_at').eq('id', internalUserId).maybeSingle()
    const isFirstPurchase = !existing?.tier_purchased_at

    // Real incident: a user can hold simultaneously active memberships on
    // BOTH the main and addon Whop businesses (e.g. a real paid main-tier
    // subscriber who separately joined Discord and also pays this $10
    // addon). This cron only ever sees the addon business, and
    // whopMainReconcile.ts only ever sees the main business — both run on
    // the identical 15-minute schedule and, before this check, each
    // unconditionally overwrote the same `tier` column with whatever it
    // alone saw. Never let a single-business reconcile silently lower a
    // tier the OTHER business already granted — only raise or hold. Real
    // downgrades still reach the user via the webhook's own membership-
    // specific deactivation path.
    const currentTier = (existing?.tier as Tier | undefined) ?? 'free'
    if (TIER_RANK[planInfo.tier] < TIER_RANK[currentTier]) {
      results.push({ membershipId, internalUserId, skipped: `current tier ${currentTier} already higher (likely granted by the main business)` })
      continue
    }

    const { data: updated, error } = await admin.from('users').update({
      tier: planInfo.tier,
      whop_plan_id: ADDON_PLAN_ID,
      tier_status: 'active',
      tier_current_period_end: periodEnd,
      whop_membership_id: membershipId ?? null,
      tier_purchased_at: existing?.tier_purchased_at ?? new Date().toISOString(),
    }).eq('id', internalUserId).select('username, discord_advanced_claimed, admin_granted_tier, email').single()

    if (error || !updated) {
      results.push({ membershipId, internalUserId, error: error?.message ?? 'user not found' })
      continue
    }

    await syncTierBadge(admin, internalUserId, effectiveTier(planInfo.tier as Tier, updated.discord_advanced_claimed, updated.admin_granted_tier))
    await syncDiscordRoleForUser(admin, internalUserId)
    // Only a genuine first-time purchase, never a still-active membership
    // this cron already saw on a previous run — same fire-and-forget
    // reasoning as whopWebhook.ts, must never delay this reconcile job.
    if (isFirstPurchase && updated.email) {
      const email = updated.email
      after(() => sendXConversion({ eventType: 'purchase', conversionId: `purchase-${internalUserId}`, email }))
    }
    results.push({ membershipId, internalUserId, username: updated.username, status, granted: planInfo.tier })
  }

  // Downgrade side REMOVED — confirmed live it was actively harmful when
  // this route only ever saw page 1 of a paginated response. Now that every
  // page is fetched (see fetchAllWhopMemberships) it would be safe to add
  // back, but the webhook signature bug is also fixed now, so real
  // cancellations already downgrade correctly via
  // membership.deactivated/went_invalid events — no need to re-add
  // grant-then-strip risk here for coverage that already exists elsewhere.

  return { totalMemberships: memberships.length, results }
}
