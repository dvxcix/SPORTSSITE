import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { effectiveTier, type Tier } from '@slipsurge/core/tiers'
import { syncTierBadge } from '@/lib/tierBadges'
import { syncDiscordRoleForUser } from '@/lib/discord'
import { writeAdminAudit } from '@/lib/adminAudit'
import { safeApiError } from '@/lib/safeApiError'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) }
  const { data: profile } = await supabase.from('users').select('account_type').eq('id', user.id).single()
  if (profile?.account_type !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { adminId: user.id }
}

// users.UPDATE/DELETE RLS only allows auth.uid() = id (self-only) — so
// every admin action here on ANOTHER user (verify, change account_type,
// delete) was silently no-op-ing under RLS via the browser client with no
// error surfaced, same root cause "Ban" already worked around by routing
// through the service-role Admin API. This does the same for the rest.
export async function POST(req: Request) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const { userId, action, value } = await req.json().catch(() => ({}))
  if (!userId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId) || !action) {
    return NextResponse.json({ error: 'userId and action are required' }, { status: 400 })
  }

  const admin = createAdminClient()

  if (action === 'verify') {
    const { error } = await admin.from('users').update({ is_verified: !!value }).eq('id', userId)
    if (error) return safeApiError('admin-user-verify', error)
    await writeAdminAudit(admin, { actorUserId: auth.adminId, action: 'user.verification_changed', targetType: 'user', targetId: userId, details: { verified: !!value }, request: req })
    return NextResponse.json({ ok: true })
  }

  if (action === 'setType') {
    if (!['user', 'creator', 'admin'].includes(value)) {
      return NextResponse.json({ error: 'value must be user, creator, or admin' }, { status: 400 })
    }
    const { error } = await admin.from('users').update({ account_type: value }).eq('id', userId)
    if (error) return safeApiError('admin-user-type', error)
    await writeAdminAudit(admin, { actorUserId: auth.adminId, action: 'user.account_type_changed', targetType: 'user', targetId: userId, details: { account_type: value }, request: req })
    return NextResponse.json({ ok: true })
  }

  // Deliberately a separate column from `tier` (which only the Whop
  // webhook/reconcile crons write) — a manual grant can never be silently
  // overwritten by a real Whop event for that account, and effectiveTier()
  // only ever raises the floor with it, never substitutes for a real
  // purchase. Re-syncs the profile badge immediately (same as every other
  // place tier can change) instead of leaving it stale until next login/
  // webhook.
  if (action === 'grantTier') {
    if (!['basic', 'advanced', 'ultimate'].includes(value)) {
      return NextResponse.json({ error: 'value must be basic, advanced, or ultimate' }, { status: 400 })
    }
    const { data: updated, error } = await admin.from('users').update({
      admin_granted_tier: value,
      admin_granted_tier_by: auth.adminId,
      admin_granted_tier_at: new Date().toISOString(),
    }).eq('id', userId).select('tier, discord_advanced_claimed').single()
    if (error) return safeApiError('admin-user-tier-grant', error)
    if (!updated) return NextResponse.json({ error: 'User not found' }, { status: 404 })
    await syncTierBadge(admin, userId, effectiveTier((updated.tier as Tier) ?? 'free', updated.discord_advanced_claimed, value as Tier))
    await syncDiscordRoleForUser(admin, userId)
    await writeAdminAudit(admin, { actorUserId: auth.adminId, action: 'user.tier_granted', targetType: 'user', targetId: userId, details: { tier: value }, request: req })
    return NextResponse.json({ ok: true })
  }

  if (action === 'revokeGrantedTier') {
    const { data: updated, error } = await admin.from('users').update({
      admin_granted_tier: null,
      admin_granted_tier_by: null,
      admin_granted_tier_at: null,
      admin_granted_tier_note: null,
    }).eq('id', userId).select('tier, discord_advanced_claimed').single()
    if (error) return safeApiError('admin-user-tier-revoke', error)
    if (!updated) return NextResponse.json({ error: 'User not found' }, { status: 404 })
    await syncTierBadge(admin, userId, effectiveTier((updated.tier as Tier) ?? 'free', updated.discord_advanced_claimed, null))
    await syncDiscordRoleForUser(admin, userId)
    await writeAdminAudit(admin, { actorUserId: auth.adminId, action: 'user.tier_grant_revoked', targetType: 'user', targetId: userId, request: req })
    return NextResponse.json({ ok: true })
  }

  if (action === 'delete') {
    if (userId === auth.adminId) {
      return NextResponse.json({ error: "Can't delete your own account" }, { status: 400 })
    }
    const { error } = await admin.from('users').delete().eq('id', userId)
    if (error) return safeApiError('admin-user-delete', error)
    await writeAdminAudit(admin, { actorUserId: auth.adminId, action: 'user.deleted', targetType: 'user', targetId: userId, request: req })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
