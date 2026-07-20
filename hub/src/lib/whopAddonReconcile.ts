import { createAdminClient } from '@/lib/supabase/admin'
import { WHOP_PLANS, effectiveTier, type Tier } from '@/lib/tiers'
import { syncTierBadge } from '@/lib/tierBadges'

// Shared by the admin route (manual/emergency re-run) and the hourly cron
// (see vercel.json) — safety net for the addon Whop business's webhook,
// which was never registered in that business's dashboard (confirmed live:
// zero deliveries ever to /api/webhooks/whop-addon despite real completed
// checkouts). Pulls membership records directly via ADDON_WHOP_KEY instead
// of waiting on a webhook, granting AND downgrading to match.
export const ADDON_PLAN_ID = 'plan_Q1Ey6RMgjS9XQ'

type ReconcileResult =
  | { error: string }
  | { totalMemberships: number; results: any[] }

export async function reconcileWhopAddon(): Promise<ReconcileResult> {
  const apiKey = process.env.ADDON_WHOP_KEY
  if (!apiKey) return { error: 'ADDON_WHOP_KEY is not configured' }

  const planInfo = WHOP_PLANS[ADDON_PLAN_ID]

  // v2 with ?plan_id= is the one confirmed working live against this key —
  // the other two stay as fallbacks since Whop's docs disagree with
  // themselves on membership-listing paths (same undocumented-API problem
  // as everywhere else Whop is touched in this codebase).
  const candidates = [
    `https://api.whop.com/api/v2/memberships?plan_id=${ADDON_PLAN_ID}`,
    `https://api.whop.com/api/v2/memberships?plan=${ADDON_PLAN_ID}`,
    `https://api.whop.com/api/v1/memberships?plan_id=${ADDON_PLAN_ID}`,
  ]
  let res: Response | null = null
  let lastErr = ''
  for (const url of candidates) {
    const attempt = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } })
    if (attempt.ok) { res = attempt; break }
    lastErr = `${url} -> ${attempt.status} ${await attempt.text().catch(() => '')}`
  }
  if (!res) {
    return { error: `Whop memberships lookup failed on every candidate path. Last: ${lastErr}` }
  }
  const body = await res.json().catch(() => null)
  const memberships: any[] = body?.data ?? body?.memberships ?? (Array.isArray(body) ? body : [])

  const admin = createAdminClient()
  const results: any[] = []
  const activeUserIds = new Set<string>()

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

    activeUserIds.add(internalUserId)

    const { data: updated, error } = await admin.from('users').update({
      tier: planInfo.tier,
      whop_plan_id: ADDON_PLAN_ID,
      tier_status: 'active',
      tier_current_period_end: periodEnd,
      whop_membership_id: membershipId ?? null,
    }).eq('id', internalUserId).select('username, discord_advanced_claimed').single()

    if (error || !updated) {
      results.push({ membershipId, internalUserId, error: error?.message ?? 'user not found' })
      continue
    }

    await syncTierBadge(admin, internalUserId, effectiveTier(planInfo.tier as Tier, updated.discord_advanced_claimed))
    results.push({ membershipId, internalUserId, username: updated.username, status, granted: planInfo.tier })
  }

  // Downgrade side REMOVED — confirmed live it was actively harmful: this
  // call returned totalMemberships=10 while real active customers whose
  // records just didn't happen to be in that batch (the endpoint is almost
  // certainly paginated and this code never handled a next-page cursor)
  // got treated as "no longer active" and stripped of Ultimate they were
  // still legitimately paying for — including several already confirmed
  // paying customers. Reverted by hand in the DB once caught.
  // Now that the webhook signature bug is fixed (see whopWebhook.ts),
  // membership.deactivated/went_invalid events downgrade correctly on
  // their own — this route only needs to keep granting what a webhook
  // might still miss, never take access away based on an unconfirmed-complete
  // membership list.

  return { totalMemberships: memberships.length, results }
}
