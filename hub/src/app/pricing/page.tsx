import { createClient } from '@/lib/supabase/server'
import { effectiveTier, type Tier } from '@/lib/tiers'
import { PricingClient } from './PricingClient'

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const { status } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Raw `tier` alone would show "Free — Current" and an active "Get
  // Advanced" buy button to someone who already has Advanced free through
  // the Discord plan — effectiveTier() is the same fold-in used everywhere
  // else access is actually checked (TierGate, requireTier), so this page
  // can't show a different answer than what's really enforced.
  let currentTier: Tier = 'free'
  let rawTier: Tier = 'free'
  let discordAdvancedClaimed = false
  let adminGrantedTier: Tier | null = null
  // Admin/beta full access bypasses every tier gate regardless of what's
  // actually purchased or claimed (see hasFullAccessOverride) — showing
  // "Advanced — Current" and a live "Get Ultimate" buy button to an admin
  // account would both undersell what it already has and invite a pointless
  // purchase. fullAccessReason drives a page-level banner instead of any
  // per-card state.
  let fullAccessReason: 'admin' | 'beta' | null = null
  if (user) {
    const { data } = await supabase.from('users').select('tier, discord_advanced_claimed, admin_granted_tier, account_type, beta_access_active').eq('id', user.id).maybeSingle()
    rawTier = (data?.tier as Tier | undefined) ?? 'free'
    discordAdvancedClaimed = !!data?.discord_advanced_claimed
    adminGrantedTier = (data?.admin_granted_tier as Tier | null) ?? null
    currentTier = effectiveTier(rawTier, discordAdvancedClaimed, adminGrantedTier)
    fullAccessReason = data?.account_type === 'admin' ? 'admin' : data?.beta_access_active ? 'beta' : null
  }

  return (
    <PricingClient
      loggedIn={!!user}
      currentTier={currentTier}
      rawTier={rawTier}
      discordAdvancedClaimed={discordAdvancedClaimed}
      adminGrantedTier={adminGrantedTier}
      fullAccessReason={fullAccessReason}
      checkoutStatus={status ?? null}
    />
  )
}
