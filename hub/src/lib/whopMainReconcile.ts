import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { WHOP_PLANS, TIER_RANK, effectiveTier, type Tier } from '@slipsurge/core/tiers'
import { syncTierBadge } from '@/lib/tierBadges'
import { syncDiscordRoleForUser } from '@/lib/discord'
import { fetchAllWhopMemberships, fetchWhopMembershipById, whopMembershipPlanId, whopMembershipUserId, type WhopMembershipRecord } from '@/lib/whopMembershipsFetch'
import { sendXConversion } from '@/lib/xConversion'
import { shouldRevokeStoredWhopAccess, whopCancellationKeepsAccess, whopMembershipGrantsAccess, whopMembershipPeriodEnd } from '@/lib/whopMembershipAccess'
import { resolveRepricedUltimatePlan } from '@/lib/whopRepricedUltimate'

// Discover active entitlements using provider filters and cursor pagination.
// A separate paced batch verifies ended memberships for local cleanup.
const MAIN_PLAN_IDS = Object.entries(WHOP_PLANS)
  .filter(([, info]) => info.company !== 'addon')
  .map(([id]) => id)

const RECONCILE_JOB_NAME = 'whop-main-memberships'
const RECONCILE_BATCH_SIZE = 24
const OVERDUE_BATCH_RESERVE = 8
const REQUEST_SPACING_MS = 1_200

type ReconcileResult =
  | { error: string }
  | { totalMemberships: number; results: Record<string, unknown>[] }

function sameInstant(left: string | null | undefined, right: string | null | undefined) {
  if (!left || !right) return !left && !right
  const leftMs = Date.parse(left)
  const rightMs = Date.parse(right)
  return Number.isFinite(leftMs) && Number.isFinite(rightMs) ? leftMs === rightMs : left === right
}

export async function reconcileWhopMain(options: { userId?: string; dryRun?: boolean } = {}): Promise<ReconcileResult> {
  const apiKey = process.env.WHOP_API_KEY
  if (!apiKey) return { error: 'WHOP_API_KEY is not configured' }

  const admin = createAdminClient()
  const results: Record<string, unknown>[] = []
  let totalMemberships = 0

  // Load every locally stored membership owned by this Whop business, not
  // just users found in today's active provider set. The latter can grant or
  // refresh access but can never discover a canceled membership that needs
  // removing, which is how ended trials remained Ultimate indefinitely.
  const target = options.userId ? await admin.from('users')
    .select('id, whop_membership_id, whop_plan_id, whop_user_id, tier_current_period_end, tier').eq('id', options.userId).maybeSingle() : null
  if (target && (target.error || !target.data)) return { error: 'Selected member could not be loaded' }
  const tracked = target ?? await admin
    .from('users')
    .select('id, whop_membership_id, whop_plan_id, tier_current_period_end, tier')
    .in('whop_plan_id', MAIN_PLAN_IDS)
    .neq('tier', 'free')
  const trackedOwners = target ? [target.data!] : tracked.data as Array<{ id: string; tier: string; whop_membership_id: string | null; whop_plan_id: string | null; tier_current_period_end: string | null }> | null
  const trackedOwnersError = tracked.error
  if (trackedOwnersError) return { error: `Could not load tracked memberships: ${trackedOwnersError.message}` }
  const ownersWithMembership = (trackedOwners ?? []).filter(user => user.whop_membership_id && user.whop_plan_id)
  const linkedOwnerByMembershipId = new Map(ownersWithMembership
    .map(user => [user.whop_membership_id as string, user.id as string]))

  // A user can end up with more than one simultaneously active membership
  // across different plans — confirmed live: a customer with a real,
  // currently-active paid Basic subscription also held an active Advanced
  // trial at the same time (nothing in Whop's checkout or this app stops
  // subscribing to more than one plan under this product). Collecting the
  // best (highest-tier) active membership per user before writing anything
  // avoids letting whichever plan happens to be iterated last silently win
  // regardless of its actual rank.
  const bestByUser = new Map<string, { planId: string; tier: Tier; membershipId?: string; periodEnd: string | null; cancelAtPeriodEnd: boolean }>()

  const now = Date.now()
  const overdueOwners = ownersWithMembership
    .filter(owner => {
      const periodEnd = owner.tier_current_period_end ? Date.parse(owner.tier_current_period_end as string) : Number.NaN
      return Number.isFinite(periodEnd) && periodEnd <= now
    })
    .sort(compareMembershipOwners)
    .slice(0, OVERDUE_BATCH_RESERVE)
  const overdueMembershipIds = new Set(overdueOwners.map(owner => owner.whop_membership_id as string))
  const rotationOwners = ownersWithMembership
    .filter(owner => !overdueMembershipIds.has(owner.whop_membership_id as string))
    .sort(compareMembershipOwners)

  const { data: reconcileState, error: reconcileStateError } = options.userId ? { data: null, error: null } : await admin
    .from('integration_reconcile_state')
    .select('cursor')
    .eq('job_name', RECONCILE_JOB_NAME)
    .maybeSingle()
  if (reconcileStateError) return { error: `Could not load Whop reconciliation cursor: ${reconcileStateError.message}` }
  const rotationCapacity = RECONCILE_BATCH_SIZE - overdueOwners.length
  const rotatingBatch = options.userId ? [] : takeAfterCursor(rotationOwners, reconcileState?.cursor ?? null, rotationCapacity)
  const ownersToCheck = options.userId ? ownersWithMembership : [...overdueOwners, ...rotatingBatch]

  const membershipFetches: Array<{
    owner: (typeof ownersWithMembership)[number]
    fetched: Awaited<ReturnType<typeof fetchWhopMembershipById>>
  }> = []
  for (const [index, owner] of ownersToCheck.entries()) {
    membershipFetches.push({
      owner,
      fetched: await fetchWhopMembershipById(WHOP_PLANS[owner.whop_plan_id!]?.company === 'addon'
        ? process.env.ADDON_WHOP_KEY ?? '' : apiKey, owner.whop_membership_id as string),
    })
    if (index < ownersToCheck.length - 1) await wait(REQUEST_SPACING_MS)
  }

  const failedFetches = membershipFetches.filter(entry => 'error' in entry.fetched)
  if (failedFetches.length) {
    return {
      error: `Whop reconciliation stopped before writes because ${failedFetches.length} membership lookup${failedFetches.length === 1 ? '' : 's'} failed`,
    }
  }

  const direct = membershipFetches.flatMap(entry => 'membership' in entry.fetched ? [entry.fetched.membership] : [])
  const whopUserId = target?.data?.whop_user_id ?? (options.userId && direct[0] ? whopMembershipUserId(direct[0]) : undefined)
  if (options.userId && direct.some(member => member.metadata?.internal_user_id && member.metadata.internal_user_id !== options.userId ||
    whopUserId && whopMembershipUserId(member) && whopMembershipUserId(member) !== whopUserId)) return { error: 'Stored Whop membership owner could not be verified' }
  const discovery = new Map(direct.map(member => [member.id, member]))
  const businesses = options.userId ? [false, true] : [false]
  for (const addon of businesses) {
    if (options.userId && !whopUserId) continue
    const key = addon ? process.env.ADDON_WHOP_KEY : apiKey
    if (!key) return { error: 'Whop business credentials are not configured' }
    const plans = Object.entries(WHOP_PLANS).filter(([, info]) => (info.company === 'addon') === addon).map(([id]) => id)
    const fetched = await fetchAllWhopMemberships(key, plans, {
      userId: options.userId ? whopUserId : undefined,
      statuses: ['active', 'trialing', 'past_due', 'canceling', 'completed'],
    })
    if ('error' in fetched) return fetched
    for (const member of fetched.memberships) discovery.set(member.id, member)
  }
  const providerMembershipById = new Map(direct.map(member => [member.id, member]))
  const memberships = [...discovery.values()]
  // Include locally free owners and older checkout records when resolving
  // stable membership links. Never infer ownership from matching emails.
  for (let offset = 0; offset < memberships.length; offset += 100) {
    const ids = memberships.slice(offset, offset + 100).map(member => member.id)
    const linked = await admin.from('users').select('id, whop_membership_id').in('whop_membership_id', ids)
    if (linked.error) return { error: 'Whop membership owners could not be loaded' }
    for (const owner of linked.data ?? []) {
      const prior = linkedOwnerByMembershipId.get(owner.whop_membership_id)
      if (prior && prior !== owner.id) return { error: 'Whop membership has conflicting local owners' }
      linkedOwnerByMembershipId.set(owner.whop_membership_id, owner.id)
    }
  }
  for (const m of memberships) {
    let planId = whopMembershipPlanId(m)
    if (planId && !WHOP_PLANS[planId] && whopMembershipGrantsAccess(m)) {
      const owner = ownersToCheck.find(candidate => candidate.whop_membership_id === m.id)
      if (owner) {
        try {
          const resolved = await resolveRepricedUltimatePlan({ source: 'main', planId, membershipId: m.id, stored: owner }, apiKey)
          if (resolved) planId = resolved.canonicalPlanId
        } catch { return { error: 'Whop membership’s customized plan could not be verified' } }
      }
    }
    if (!planId) continue
    const planInfo = WHOP_PLANS[planId]
    if (!planInfo && options.userId && whopMembershipGrantsAccess(m)) return { error: 'Active Whop membership uses a plan that needs verification' }
    if (!planInfo || !options.userId && planInfo.company === 'addon') continue
    totalMemberships += 1
    providerMembershipById.set(m.id, m)
    const status: string | undefined = m.status ?? m.valid_status
    const isActive = whopMembershipGrantsAccess(m)
    const membershipId: string | undefined = m.id
    const linked = linkedOwnerByMembershipId.get(m.id)
    if (linked && m.metadata?.internal_user_id && linked !== m.metadata.internal_user_id) return { error: 'Whop membership has conflicting provider and local owners' }
    const internalUserId: string | undefined = m.metadata?.internal_user_id
      ?? linked
      ?? (options.userId && whopUserId && whopMembershipUserId(m) === whopUserId ? options.userId : undefined)
    if (options.userId && internalUserId !== options.userId) continue
    const periodEnd = whopMembershipPeriodEnd(m)
    const cancelAtPeriodEnd = whopCancellationKeepsAccess(m)

    if (!internalUserId) {
      results.push({ planId, membershipId, status, skipped: 'no metadata or linked membership owner' })
      continue
    }
    if (!isActive) continue

    const current = bestByUser.get(internalUserId)
    const candidateEnd = periodEnd ? Date.parse(periodEnd) : 0
    const currentEnd = current?.periodEnd ? Date.parse(current.periodEnd) : 0
    const hasHigherTier = !current || TIER_RANK[planInfo.tier] > TIER_RANK[current.tier]
    const hasLaterSameTier = current
      && TIER_RANK[planInfo.tier] === TIER_RANK[current.tier]
      && candidateEnd > currentEnd
    if (hasHigherTier || hasLaterSameTier) {
      bestByUser.set(internalUserId, { planId, tier: planInfo.tier, membershipId, periodEnd, cancelAtPeriodEnd })
    }
  }

  const relevantUserIds = [...new Set([...bestByUser.keys(), ...ownersToCheck.map(user => user.id as string), ...(options.userId ? [options.userId] : [])])]
  const existingUsers = []
  for (let offset = 0; offset < relevantUserIds.length; offset += 100) {
    const users = await admin.from('users').select('id, tier, tier_purchased_at, tier_cancel_at_period_end, whop_plan_id, tier_status, tier_current_period_end, whop_membership_id, discord_advanced_claimed, admin_granted_tier, email, username').in('id', relevantUserIds.slice(offset, offset + 100))
    if (users.error) return { error: 'Whop member accounts could not be loaded' }
    existingUsers.push(...users.data ?? [])
  }
  const existingById = new Map((existingUsers ?? []).map(user => [user.id as string, user]))

  for (const [internalUserId, best] of bestByUser) {
    // Only stamp tier_purchased_at when unset — this route re-runs on a
    // schedule and would otherwise bump it to "now" every time it sees
    // the same still-active membership, same reasoning as the webhook.
    const existing = existingById.get(internalUserId)
    if (!existing) {
      results.push({ planId: best.planId, membershipId: best.membershipId, internalUserId, error: 'user not found' })
      continue
    }
    const isFirstPurchase = !existing?.tier_purchased_at

    // Real incident: a user can hold simultaneously active memberships on
    // BOTH the main and addon Whop businesses (e.g. a free-Advanced-via-
    // Discord member who also pays the $10 addon for Ultimate). This cron
    // only ever sees the main business, and whopAddonReconcile.ts only
    // ever sees the addon business — both run on the identical 15-minute
    // schedule and, before this check, each unconditionally overwrote the
    // same `tier` column with whatever it alone saw, so the addon's
    // Ultimate grant flapped back down to Advanced every time this cron's
    // tick landed after the addon's (confirmed live: a paying addon
    // customer's tier visibly flapping between the two). Never let a
    // single-business reconcile silently lower a tier the OTHER business
    // already granted — only raise or hold. Real downgrades (an actual
    // cancellation) still reach the user via the webhook's own
    // membership-specific deactivation path, which IS scoped correctly.
    const currentTier = (existing?.tier as Tier | undefined) ?? 'free'
    const currentPlan = existing.whop_plan_id ? WHOP_PLANS[existing.whop_plan_id] : undefined
    const currentTierComesFromOtherBusiness = currentPlan?.company === 'addon'
    if (TIER_RANK[best.tier] < TIER_RANK[currentTier] && currentTierComesFromOtherBusiness) {
      results.push({ planId: best.planId, membershipId: best.membershipId, internalUserId, skipped: `current tier ${currentTier} already higher (likely granted by the addon business)` })
      continue
    }

    const samePeriodEnd = sameInstant(existing.tier_current_period_end, best.periodEnd)
    const unchanged = currentTier === best.tier
      && existing.whop_plan_id === best.planId
      && existing.tier_status === (best.cancelAtPeriodEnd ? 'canceling' : 'active')
      && existing.tier_cancel_at_period_end === best.cancelAtPeriodEnd
      && (existing.whop_membership_id ?? null) === (best.membershipId ?? null)
      && samePeriodEnd
    if (unchanged) {
      if (options.userId) results.push({ internalUserId, checked: true, active: true, tier: best.tier })
      continue
    }
    if (options.dryRun) {
      results.push({ internalUserId, wouldGrant: best.tier, active: true, periodEnd: best.periodEnd })
      continue
    }

    const previousEffectiveTier = effectiveTier(currentTier, existing.discord_advanced_claimed, existing.admin_granted_tier)
    const nextEffectiveTier = effectiveTier(best.tier, existing.discord_advanced_claimed, existing.admin_granted_tier)
    const accessChanged = previousEffectiveTier !== nextEffectiveTier

    const { data: updated, error } = await admin.from('users').update({
      tier: best.tier,
      whop_plan_id: best.planId,
      tier_status: best.cancelAtPeriodEnd ? 'canceling' : 'active',
      tier_current_period_end: best.periodEnd,
      whop_membership_id: best.membershipId ?? null,
      tier_purchased_at: existing?.tier_purchased_at ?? new Date().toISOString(),
      tier_cancel_at_period_end: best.cancelAtPeriodEnd,
    }).eq('id', internalUserId).select('username, discord_advanced_claimed, admin_granted_tier, email').single()

    if (error || !updated) {
      results.push({ planId: best.planId, membershipId: best.membershipId, internalUserId, error: error?.message ?? 'user not found' })
      continue
    }

    // A renewal timestamp can change without changing access. Avoid badge
    // writes and Discord calls unless the member's effective tier changed.
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
    results.push({ planId: best.planId, membershipId: best.membershipId, internalUserId, username: updated.username, granted: best.tier })
  }

  for (const existing of existingUsers ?? []) {
    if (existing.tier === 'free') continue
    if (!existing.whop_membership_id || !MAIN_PLAN_IDS.includes(existing.whop_plan_id ?? '')) continue
    if (bestByUser.has(existing.id as string)) continue
    const providerRecord = providerMembershipById.get(existing.whop_membership_id)
    if (!shouldRevokeStoredWhopAccess(providerRecord, {
      cancelAtPeriodEnd: existing.tier_cancel_at_period_end,
      periodEnd: existing.tier_current_period_end,
    })) continue
    if (options.dryRun) {
      results.push({ internalUserId: existing.id, wouldRevoke: existing.tier, active: false })
      continue
    }

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

  const lastRotatedMembershipId = rotatingBatch.at(-1)?.whop_membership_id as string | undefined
  if (lastRotatedMembershipId && !options.dryRun) {
    const state = await admin.from('integration_reconcile_state').upsert({
      job_name: RECONCILE_JOB_NAME, cursor: lastRotatedMembershipId, updated_at: new Date().toISOString(),
    }, { onConflict: 'job_name' })
    if (state.error) return { error: 'Could not advance Whop reconciliation cursor' }
  }
  if (options.userId && !results.some(result => result.internalUserId === options.userId)) {
    results.push({ internalUserId: options.userId, checked: true, active: false })
  }
  return {
    totalMemberships,
    results: [{
      checked: ownersToCheck.length,
      overdueChecked: overdueOwners.length,
      tracked: ownersWithMembership.length,
      cursor: lastRotatedMembershipId ?? reconcileState?.cursor ?? null,
    }, ...results],
  }
}

function compareMembershipOwners(left: { whop_membership_id: unknown }, right: { whop_membership_id: unknown }) {
  return String(left.whop_membership_id).localeCompare(String(right.whop_membership_id))
}

function takeAfterCursor<T extends { whop_membership_id: unknown }>(owners: T[], cursor: string | null, count: number): T[] {
  if (!owners.length || count <= 0) return []
  const start = cursor
    ? Math.max(0, owners.findIndex(owner => String(owner.whop_membership_id) > cursor))
    : 0
  const ordered = [...owners.slice(start), ...owners.slice(0, start)]
  return ordered.slice(0, Math.min(count, owners.length))
}

function wait(delayMs: number) {
  return new Promise(resolve => setTimeout(resolve, delayMs))
}
