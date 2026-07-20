import { createAdminClient } from '@/lib/supabase/admin'
import { WHOP_PLANS, effectiveTier, type Tier } from '@/lib/tiers'
import { syncTierBadge } from '@/lib/tierBadges'

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
  const activeUserIds = new Set<string>()
  let totalMemberships = 0

  for (const planId of MAIN_PLAN_IDS) {
    const planInfo = WHOP_PLANS[planId]

    // Same candidate-path fallback already proven necessary for the addon
    // business's identical undocumented endpoint.
    const candidates = [
      `https://api.whop.com/api/v2/memberships?plan_id=${planId}`,
      `https://api.whop.com/api/v2/memberships?plan=${planId}`,
      `https://api.whop.com/api/v1/memberships?plan_id=${planId}`,
    ]
    let res: Response | null = null
    let lastErr = ''
    for (const url of candidates) {
      const attempt = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } })
      if (attempt.ok) { res = attempt; break }
      lastErr = `${url} -> ${attempt.status} ${await attempt.text().catch(() => '')}`
    }
    if (!res) {
      results.push({ planId, error: `Whop memberships lookup failed on every candidate path. Last: ${lastErr}` })
      continue
    }
    const body = await res.json().catch(() => null)
    const memberships: any[] = body?.data ?? body?.memberships ?? (Array.isArray(body) ? body : [])
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

      activeUserIds.add(internalUserId)

      const { data: updated, error } = await admin.from('users').update({
        tier: planInfo.tier,
        whop_plan_id: planId,
        tier_status: 'active',
        tier_current_period_end: periodEnd,
        whop_membership_id: membershipId ?? null,
      }).eq('id', internalUserId).select('username, discord_advanced_claimed').single()

      if (error || !updated) {
        results.push({ planId, membershipId, internalUserId, error: error?.message ?? 'user not found' })
        continue
      }

      await syncTierBadge(admin, internalUserId, effectiveTier(planInfo.tier as Tier, updated.discord_advanced_claimed))
      results.push({ planId, membershipId, internalUserId, username: updated.username, status, granted: planInfo.tier })
    }
  }

  // Downgrade side — mirrors whopAddonReconcile.ts. Scoped to accounts we
  // ourselves last marked 'active' on one of the 5 MAIN plan ids, so it never
  // touches an account whose whop_plan_id points at the addon business's
  // plan instead.
  const { data: staleHolders } = await admin
    .from('users')
    .select('id, username, discord_advanced_claimed')
    .in('whop_plan_id', MAIN_PLAN_IDS)
    .eq('tier_status', 'active')

  for (const holder of staleHolders ?? []) {
    if (activeUserIds.has(holder.id)) continue
    await admin.from('users').update({
      tier: 'free',
      tier_status: 'membership.went_invalid',
    }).eq('id', holder.id)
    await syncTierBadge(admin, holder.id, effectiveTier('free', holder.discord_advanced_claimed))
    results.push({ internalUserId: holder.id, username: holder.username, downgraded: true })
  }

  return { totalMemberships, results }
}
