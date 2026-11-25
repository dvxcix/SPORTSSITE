import { NextResponse } from 'next/server'
import { effectiveTier, hasFullAccessOverride, type Tier } from '@slipsurge/core/tiers'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireNativeAccount } from '@/lib/supabase/nativeAccount'
import { hasApprovedCreatorAccess } from '@/lib/creator'

const headers = { 'Cache-Control': 'private, no-store' }

export async function GET(request: Request) {
  const account = await requireNativeAccount(request)
  if (account.error) return account.error

  const { data, error } = await createAdminClient().from('users')
    .select('id,username,display_name,avatar_url,is_verified,account_type,beta_access_active,tier,discord_advanced_claimed,admin_granted_tier,tier_status,tier_current_period_end,tier_cancel_at_period_end,whop_membership_id')
    .eq('id', account.userId).maybeSingle()

  if (error || !data) {
    return NextResponse.json({ error: 'Account details unavailable' }, { status: 503, headers })
  }
  const tier = effectiveTier((data.tier ?? 'free') as Tier, data.discord_advanced_claimed, data.admin_granted_tier as Tier | null)
  let canOpenStudio = await hasApprovedCreatorAccess(account.supabase, account.userId, data.account_type).catch(() => false)
  if (!canOpenStudio) {
    const { data: ownedGroup } = await account.supabase.from('groups').select('id').eq('owner_id', account.userId).limit(1).maybeSingle()
    canOpenStudio = Boolean(ownedGroup)
  }
  return NextResponse.json({
    id: data.id,
    username: data.username,
    displayName: data.display_name,
    avatar: data.avatar_url,
    verified: data.is_verified,
    role: data.account_type,
    canOpenStudio,
    accessTier: hasFullAccessOverride(data.account_type, data.beta_access_active) ? 'ultimate' : tier,
    membership: {
      discordClaim: data.discord_advanced_claimed === true,
      purchasedTier: data.tier ?? 'free',
      status: data.tier_status,
      currentPeriodEnd: data.tier_current_period_end,
      cancelAtPeriodEnd: data.tier_cancel_at_period_end === true,
      provider: data.whop_membership_id ? 'whop' : null,
    },
  }, { headers })
}
