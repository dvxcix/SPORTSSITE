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
  | { totalMemberships: number; results: Record<string, unknown>[] }

type ActiveMembership = {
  membershipId?: string
  internalUserId: string
  periodEnd: string | null
  status?: string
}

function sameInstant(left: string | null | undefined, right: string | null | undefined) {
  if (!left || !right) return !left && !right
  const leftMs = Date.parse(left)
  const rightMs = Date.parse(right)
  return Number.isFinite(leftMs) && Number.isFinite(rightMs) ? leftMs === rightMs : left === right
}

export async function reconcileWhopAddon(): Promise<ReconcileResult> {
  const apiKey = process.env.ADDON_WHOP_KEY
  if (!apiKey) return { error: 'ADDON_WHOP_KEY is not configured' }

  const planInfo = WHOP_PLANS[ADDON_PLAN_ID]

  const fetched = await fetchAllWhopMemberships(apiKey, ADDON_PLAN_ID)
  if ('error' in fetched) return fetched
  const memberships = fetched.memberships

  const admin = createAdminClient()
  // Older memberships predate checkout metadata. Preserve their stable
  // account link through users.whop_membership_id so an email change cannot
  // make a paying member invisible to reconciliation.
  const legacyMembershipIds = [...new Set(memberships
    .filter(membership => !membership.metadata?.internal_user_id && membership.id)
    .map(membership => membership.id as string))]
  const { data: linkedUsers, error: linkedUsersError } = legacyMembershipIds.length
    ? await admin.from('users').select('id, whop_membership_id').in('whop_membership_id', legacyMembershipIds)
    : { data: [], error: null }
  if (linkedUsersError) return { error: `Could not resolve linked memberships: ${linkedUsersError.message}` }
  const linkedOwnerByMembershipId = new Map((linkedUsers ?? [])
    .filter(user => user.whop_membership_id)
    .map(user => [user.whop_membership_id as string, user.id as string]))

  const results: Record<string, unknown>[] = []
  const bestByUser = new Map<string, ActiveMembership>()
  for (const m of memberships) {
    const status: string | undefined = m.status ?? m.valid_status
    const isActive = status === 'active' || status === 'valid' || m.valid === true
    const internalUserId: string | undefined = m.metadata?.internal_user_id
      ?? (m.id ? linkedOwnerByMembershipId.get(m.id) : undefined)
    if (!internalUserId) {
      results.push({ membershipId: m.id, status, skipped: 'no metadata or linked membership owner' })
      continue
    }
    if (!isActive) continue
    const periodEndRaw = m.renewal_period_end ?? m.period_end ?? m.expires_at
    const periodEnd = typeof periodEndRaw === 'number'
      ? new Date(periodEndRaw * 1000).toISOString()
      : typeof periodEndRaw === 'string' ? periodEndRaw : null
    const candidate = { membershipId: m.id as string | undefined, internalUserId, periodEnd, status }
    const current = bestByUser.get(internalUserId)
    const candidateEnd = periodEnd ? Date.parse(periodEnd) : 0
    const currentEnd = current?.periodEnd ? Date.parse(current.periodEnd) : 0
    if (!current || candidateEnd > currentEnd) bestByUser.set(internalUserId, candidate)
  }
  const activeUserIds = [...bestByUser.keys()]
  const { data: existingUsers, error: existingUsersError } = activeUserIds.length
    ? await admin.from('users').select('id, tier, tier_purchased_at, whop_plan_id, tier_status, tier_current_period_end, whop_membership_id, discord_advanced_claimed, admin_granted_tier, email, username').in('id', activeUserIds)
    : { data: [], error: null }
  if (existingUsersError) return { error: `Could not load existing users: ${existingUsersError.message}` }
  const existingById = new Map((existingUsers ?? []).map(user => [user.id as string, user]))

  for (const m of bestByUser.values()) {
    // Defensive across a few plausible field shapes — same reasoning as the
    // webhook handler, since this is the same API family with the same
    // undocumented-payload problem.
    const { status, internalUserId, membershipId, periodEnd } = m

    // Only stamp tier_purchased_at when unset — this route re-runs on a
    // schedule and would otherwise bump it to "now" every time it sees the
    // same still-active membership, same reasoning as the webhook handler.
    const existing = existingById.get(internalUserId)
    if (!existing) {
      results.push({ membershipId, internalUserId, error: 'user not found' })
      continue
    }
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

    const unchanged = currentTier === planInfo.tier
      && existing.whop_plan_id === ADDON_PLAN_ID
      && existing.tier_status === 'active'
      && (existing.whop_membership_id ?? null) === (membershipId ?? null)
      && sameInstant(existing.tier_current_period_end, periodEnd)
    if (unchanged) continue

    const previousEffectiveTier = effectiveTier(currentTier, existing.discord_advanced_claimed, existing.admin_granted_tier)
    const nextEffectiveTier = effectiveTier(planInfo.tier as Tier, existing.discord_advanced_claimed, existing.admin_granted_tier)
    const accessChanged = previousEffectiveTier !== nextEffectiveTier

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

    if (accessChanged) {
      await syncTierBadge(admin, internalUserId, nextEffectiveTier)
      await syncDiscordRoleForUser(admin, internalUserId)
    }
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
