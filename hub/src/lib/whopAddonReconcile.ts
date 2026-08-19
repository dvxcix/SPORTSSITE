import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { WHOP_PLANS, TIER_RANK, effectiveTier, type Tier } from '@slipsurge/core/tiers'
import { syncTierBadge } from '@/lib/tierBadges'
import { syncDiscordRoleForUser } from '@/lib/discord'
import { fetchAllWhopMemberships } from '@/lib/whopMembershipsFetch'
import { sendXConversion } from '@/lib/xConversion'
import { shouldRevokeStoredWhopAccess, whopCancellationKeepsAccess, whopMembershipGrantsAccess, whopMembershipPeriodEnd } from '@/lib/whopMembershipAccess'

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
  cancelAtPeriodEnd: boolean
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
  const { data: trackedOwners, error: trackedOwnersError } = await admin
    .from('users')
    .select('id, whop_membership_id')
    .eq('whop_plan_id', ADDON_PLAN_ID)
    .neq('tier', 'free')
  if (trackedOwnersError) return { error: `Could not load tracked memberships: ${trackedOwnersError.message}` }
  // Older memberships predate checkout metadata. Preserve their stable
  // account link through users.whop_membership_id so an email change cannot
  // make a paying member invisible to reconciliation.
  const linkedOwnerByMembershipId = new Map((trackedOwners ?? [])
    .filter(user => user.whop_membership_id)
    .map(user => [user.whop_membership_id as string, user.id as string]))
  const providerMembershipById = new Map(memberships
    .filter(membership => membership.id)
    .map(membership => [membership.id as string, membership]))

  const results: Record<string, unknown>[] = []
  const bestByUser = new Map<string, ActiveMembership>()
  for (const m of memberships) {
    const status: string | undefined = m.status ?? m.valid_status
    const isActive = whopMembershipGrantsAccess(m)
    const internalUserId: string | undefined = m.metadata?.internal_user_id
      ?? (m.id ? linkedOwnerByMembershipId.get(m.id) : undefined)
    if (!internalUserId) {
      results.push({ membershipId: m.id, status, skipped: 'no metadata or linked membership owner' })
      continue
    }
    if (!isActive) continue
    const periodEnd = whopMembershipPeriodEnd(m)
    const cancelAtPeriodEnd = whopCancellationKeepsAccess(m)
    const candidate = { membershipId: m.id as string | undefined, internalUserId, periodEnd, status, cancelAtPeriodEnd }
    const current = bestByUser.get(internalUserId)
    const candidateEnd = periodEnd ? Date.parse(periodEnd) : 0
    const currentEnd = current?.periodEnd ? Date.parse(current.periodEnd) : 0
    if (!current || candidateEnd > currentEnd) bestByUser.set(internalUserId, candidate)
  }
  const relevantUserIds = [...new Set([...bestByUser.keys(), ...(trackedOwners ?? []).map(user => user.id as string)])]
  const { data: existingUsers, error: existingUsersError } = relevantUserIds.length
    ? await admin.from('users').select('id, tier, tier_purchased_at, tier_cancel_at_period_end, whop_plan_id, tier_status, tier_current_period_end, whop_membership_id, discord_advanced_claimed, admin_granted_tier, email, username').in('id', relevantUserIds)
    : { data: [], error: null }
  if (existingUsersError) return { error: `Could not load existing users: ${existingUsersError.message}` }
  const existingById = new Map((existingUsers ?? []).map(user => [user.id as string, user]))

  for (const m of bestByUser.values()) {
    // Defensive across a few plausible field shapes — same reasoning as the
    // webhook handler, since this is the same API family with the same
    // undocumented-payload problem.
    const { status, internalUserId, membershipId, periodEnd, cancelAtPeriodEnd } = m

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
      && existing.tier_status === (cancelAtPeriodEnd ? 'canceling' : 'active')
      && existing.tier_cancel_at_period_end === cancelAtPeriodEnd
      && (existing.whop_membership_id ?? null) === (membershipId ?? null)
      && sameInstant(existing.tier_current_period_end, periodEnd)
    if (unchanged) continue

    const previousEffectiveTier = effectiveTier(currentTier, existing.discord_advanced_claimed, existing.admin_granted_tier)
    const nextEffectiveTier = effectiveTier(planInfo.tier as Tier, existing.discord_advanced_claimed, existing.admin_granted_tier)
    const accessChanged = previousEffectiveTier !== nextEffectiveTier

    const { data: updated, error } = await admin.from('users').update({
      tier: planInfo.tier,
      whop_plan_id: ADDON_PLAN_ID,
      tier_status: cancelAtPeriodEnd ? 'canceling' : 'active',
      tier_current_period_end: periodEnd,
      whop_membership_id: membershipId ?? null,
      tier_purchased_at: existing?.tier_purchased_at ?? new Date().toISOString(),
      tier_cancel_at_period_end: cancelAtPeriodEnd,
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

  for (const existing of existingUsers ?? []) {
    if (existing.whop_plan_id !== ADDON_PLAN_ID || !existing.whop_membership_id) continue
    if (bestByUser.has(existing.id as string)) continue
    const providerRecord = providerMembershipById.get(existing.whop_membership_id)
    if (!shouldRevokeStoredWhopAccess(providerRecord, {
      cancelAtPeriodEnd: existing.tier_cancel_at_period_end,
      periodEnd: existing.tier_current_period_end,
    })) continue

    const currentTier = (existing.tier as Tier | undefined) ?? 'free'
    const previousEffectiveTier = effectiveTier(currentTier, existing.discord_advanced_claimed, existing.admin_granted_tier)
    const nextEffectiveTier = effectiveTier('free', existing.discord_advanced_claimed, existing.admin_granted_tier)
    const { error } = await admin.from('users').update({
      tier: 'free',
      tier_status: 'membership.reconciled_inactive',
      tier_purchased_at: null,
      tier_cancel_at_period_end: false,
    }).eq('id', existing.id).eq('whop_membership_id', existing.whop_membership_id)
    if (error) {
      results.push({ internalUserId: existing.id, error: error.message })
      continue
    }
    if (previousEffectiveTier !== nextEffectiveTier) {
      await syncTierBadge(admin, existing.id as string, nextEffectiveTier)
      await syncDiscordRoleForUser(admin, existing.id as string)
    }
    results.push({ internalUserId: existing.id, membershipId: existing.whop_membership_id, revoked: currentTier })
  }

  return { totalMemberships: memberships.length, results }
}
