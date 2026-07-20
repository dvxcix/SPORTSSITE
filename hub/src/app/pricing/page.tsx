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
  if (user) {
    const { data } = await supabase.from('users').select('tier, discord_advanced_claimed').eq('id', user.id).maybeSingle()
    currentTier = effectiveTier((data?.tier as Tier | undefined) ?? 'free', data?.discord_advanced_claimed)
  }

  return <PricingClient loggedIn={!!user} currentTier={currentTier} checkoutStatus={status ?? null} />
}
