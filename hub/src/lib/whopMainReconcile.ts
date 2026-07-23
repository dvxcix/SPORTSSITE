import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { WHOP_PLANS, TIER_RANK, effectiveTier, type Tier } from '@/lib/tiers'
import { syncTierBadge } from '@/lib/tierBadges'
import { fetchAllWhopMemberships } from '@/lib/whopMembershipsFetch'
import { sendXConversion } from '@/lib/xConversion'

// Same safety-net reasoning as whopAddonReconcile.ts, for the MAIN
// tier-payments business — confirmed live that its webhook (/api/webhooks/whop)
// has never actually been received (the runtime-log hits that looked like it
// were a false match on /api/whop/checkout-session, not the webhook route
// itself), the same root cause already found and worked around for the addon
// business. A real customer (plan purchased, no tier change) is why this
// exists now instead of waiting on the webhook to get fixed first.
const MAIN_PLAN_IDS = Object.entries(WHOP_PLANS)
  .filter(([, info]) => info.company !== 'addon')
  .map(([id]) => id)

type ReconcileResult =
  | { error: string }
  | { totalMemberships: number; results: any[] }

export async function reconcileWhopMain(): Promise<ReconcileResult> {
  const apiKey = process.env.WHOP_API_KEY
  if (!apiKey) return { error: 'WHOP_API_KEY is not configured' }

  const admin = createAdminClient()
  const results: any[] = []
  let totalMemberships = 0

  // A user can end up with more than one simultaneously active membership
  // across different plans — confirmed live: a customer with a real,
  // currently-active paid Basic subscription also held an active Advanced
  // trial at the same time (nothing in Whop's checkout or this app stops
  // subscribing to more than one plan under this product). Collecting the
  // best (highest-tier) active membership per user before writing anything
  // avoids letting whichever plan happens to be iterated last silently win
  // regardless of its actual rank.
  const bestByUser = new Map<string, { planId: string; tier: Tier; membershipId?: string; periodEnd: string | null }>()

  for (const planId of MAIN_PLAN_IDS) {
    const planInfo = WHOP_PLANS[planId]

    const fetched = await fetchAllWhopMemberships(apiKey, planId)
    if ('error' in fetched) {
      results.push({ planId, error: fetched.error })
      continue
    }
    const memberships = fetched.memberships
    totalMemberships += memberships.length

    for (const m of memberships) {
      const status: string | undefined = m.status ?? m.valid_status
      const isActive = status === 'active' || status === 'valid' || m.valid === true
      const internalUserId: string | undefined = m.metadata?.internal_user_id
      const membershipId: string | undefined = m.id
      const periodEndRaw = m.renewal_period_end ?? m.period_end ?? m.expires_at
      const periodEnd = typeof periodEndRaw === 'number'
        ? new Date(periodEndRaw * 1000).toISOString()
        : typeof periodEndRaw === 'string' ? periodEndRaw : null

      if (!internalUserId) {
        results.push({ planId, membershipId, status, skipped: 'no internal_user_id in metadata' })
        continue
      }
      if (!isActive) {
        results.push({ planId, membershipId, internalUserId, status, skipped: 'not active' })
        continue
      }

      const current = bestByUser.get(internalUserId)
      if (!current || TIER_RANK[planInfo.tier] > TIER_RANK[current.tier]) {
        bestByUser.set(internalUserId, { planId, tier: planInfo.tier, membershipId, periodEnd })
      } else {
        results.push({ planId, membershipId, internalUserId, status, skipped: `lower tier than existing active ${current.tier}` })
      }
    }
  }

  for (const [internalUserId, best] of bestByUser) {
    // Only stamp tier_purchased_at when unset — this route re-runs on a
    // schedule and would otherwise bump it to "now" every time it sees
    // the same still-active membership, same reasoning as the webhook.
    const { data: existing } = await admin.from('users').select('tier_purchased_at').eq('id', internalUserId).maybeSingle()
    const isFirstPurchase = !existing?.tier_purchased_at
    const { data: updated, error } = await admin.from('users').update({
      tier: best.tier,
      whop_plan_id: best.planId,
      tier_status: 'active',
      tier_current_period_end: best.periodEnd,
      whop_membership_id: best.membershipId ?? null,
      tier_purchased_at: existing?.tier_purchased_at ?? new Date().toISOString(),
    }).eq('id', internalUserId).select('username, discord_advanced_claimed, admin_granted_tier, email').single()

    if (error || !updated) {
      results.push({ planId: best.planId, membershipId: best.membershipId, internalUserId, error: error?.message ?? 'user not found' })
      continue
    }

    await syncTierBadge(admin, internalUserId, effectiveTier(best.tier, updated.discord_advanced_claimed, updated.admin_granted_tier))
    // Only a genuine first-time purchase, never a still-active membership
    // this cron already saw on a previous run — same fire-and-forget
    // reasoning as whopWebhook.ts, must never delay this reconcile job.
    if (isFirstPurchase && updated.email) {
      const email = updated.email
      after(() => sendXConversion({ conversionId: `purchase-${internalUserId}`, email }))
    }
    results.push({ planId: best.planId, membershipId: best.membershipId, internalUserId, username: updated.username, granted: best.tier })
  }

  // Downgrade side REMOVED — same reasoning as whopAddonReconcile.ts. Every
  // page is now fetched (see fetchAllWhopMemberships), but the webhook fix
  // already covers real cancellations, so there's no need to reintroduce
  // grant-then-strip risk here.

  return { totalMemberships, results }
}
