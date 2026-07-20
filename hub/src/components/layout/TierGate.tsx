import { createClient } from '@/lib/supabase/server'
import { hasTierAccess, hasFullAccessOverride, effectiveTier, type Tier } from '@/lib/tiers'
import { TierUpsell } from './TierUpsell'

// Mirrors FeatureGate.tsx's shape exactly, swapping the site_settings flag
// check for a tier-rank comparison. Admins and users with active beta access
// (see hasFullAccessOverride) always pass, same as FeatureGate's admin
// preview treatment.
//
// No explicit redirect for a logged-out user: every route this wraps already
// sits behind the global middleware auth check (hub/src/lib/supabase/middleware.ts),
// so `user` is effectively always present by the time this renders. The
// upsell fallback below is defensive, not a primary code path.
export async function TierGate({ requiredTier, label, children }: {
  requiredTier: Tier
  label: string
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return <TierUpsell requiredTier={requiredTier} label={label} />

  const { data } = await supabase.from('users').select('tier, account_type, beta_access_active, discord_advanced_claimed').eq('id', user.id).maybeSingle()
  const userTier = effectiveTier((data?.tier as Tier | undefined) ?? 'free', data?.discord_advanced_claimed)

  if (hasFullAccessOverride(data?.account_type, data?.beta_access_active) || hasTierAccess(userTier, requiredTier)) {
    return <>{children}</>
  }
  return <TierUpsell requiredTier={requiredTier} label={label} />
}
