import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { cancelWhopMembership } from '@/lib/whop'
import { effectiveTier } from '@slipsurge/core/tiers'
import { syncTierBadge } from '@/lib/tierBadges'
import { syncDiscordRoleForUser } from '@/lib/discord'
import { safeApiError } from '@/lib/safeApiError'
import { writeAdminAudit } from '@/lib/adminAudit'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) }
  const { data: profile } = await supabase.from('users').select('account_type').eq('id', user.id).single()
  if (profile?.account_type !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { adminId: user.id }
}

// Admin-only, immediate-only counterpart to the member-initiated
// /api/whop/cancel-membership route (which respects an already-paid-for
// period except for the trial-charge bug that one already works around) —
// for the rare case an admin needs to shut a membership off right now (ToS
// violation, chargeback, fraud), by raw Whop membership ID rather than a
// SlipSurge account (the two businesses' memberships aren't all necessarily
// tied to an account row here — e.g. an abandoned checkout, or a purchase
// made before the buyer ever created a SlipSurge account).
export async function POST(req: Request) {
  const { error, adminId } = await requireAdmin()
  if (error) return error

  const { membershipId } = await req.json().catch(() => ({}))
  if (!membershipId || typeof membershipId !== 'string' || membershipId.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(membershipId)) {
    return NextResponse.json({ error: 'membershipId is required' }, { status: 400 })
  }

  // Two separate Whop businesses share this codebase (see whopAddonReconcile
  // vs whopMainReconcile) — this membership ID could belong to either one,
  // and there's no way to tell which just from the ID's shape. Try the main
  // business first, fall back to the add-on business only on a real
  // not-found, so a genuine failure on the right business doesn't get masked
  // by a misleading second attempt against the wrong one.
  const keys: { label: string; key: string }[] = []
  if (process.env.WHOP_API_KEY) keys.push({ label: 'main', key: process.env.WHOP_API_KEY })
  if (process.env.ADDON_WHOP_KEY) keys.push({ label: 'addon', key: process.env.ADDON_WHOP_KEY })
  if (!keys.length) return NextResponse.json({ error: 'No Whop API key configured' }, { status: 500 })

  let result: { ok: true } | { ok: false; status: number; error: string } | null = null
  let usedBusiness = ''
  for (const { label, key } of keys) {
    result = await cancelWhopMembership(membershipId, key, { forceImmediate: true })
    usedBusiness = label
    if (result.ok || result.status !== 404) break
  }
  if (!result?.ok) {
    return safeApiError('admin-whop-terminate', { status: result?.status }, 'Membership cancellation failed', 502)
  }

  // Best-effort: if this membership is the one actually on file for a
  // SlipSurge account, reflect the loss immediately instead of waiting on a
  // Whop webhook that may not even fire the same way for an admin-initiated
  // API cancel — same downgrade shape as the payment.failed/deactivated/
  // went_invalid webhook handler.
  const admin = createAdminClient()
  const { data: matched } = await admin.from('users')
    .select('id, discord_advanced_claimed, admin_granted_tier')
    .eq('whop_membership_id', membershipId)
    .maybeSingle()
  if (matched) {
    await admin.from('users').update({
      tier: 'free',
      tier_status: 'admin_terminated',
      tier_purchased_at: null,
      tier_cancel_at_period_end: false,
    }).eq('id', matched.id)
    await syncTierBadge(admin, matched.id, effectiveTier('free', matched.discord_advanced_claimed, matched.admin_granted_tier))
    await syncDiscordRoleForUser(admin, matched.id)
  }

  await writeAdminAudit(admin, {
    actorUserId: adminId!,
    action: 'whop.membership_terminated',
    targetType: 'whop_membership',
    targetId: membershipId,
    details: { business: usedBusiness, matched_account: Boolean(matched) },
    request: req,
  })

  return NextResponse.json({ ok: true, business: usedBusiness, matchedAccountId: matched?.id ?? null })
}
