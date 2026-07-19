import { createClient } from '@/lib/supabase/server'
import { hasTierAccess, hasFullAccessOverride, type Tier } from '@/lib/tiers'
import { TierUpsell } from './TierUpsell'

// Mirrors FeatureGate.tsx's shape exactly, swapping the site_settings flag
// check for a tier-rank comparison. Admins and current beta-badge holders
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

  const { data } = await supabase.from('users').select('tier, account_type').eq('id', user.id).maybeSingle()
  const userTier = (data?.tier as Tier | undefined) ?? 'free'

  if ((await hasFullAccessOverride(supabase, user.id, data?.account_type)) || hasTierAccess(userTier, requiredTier)) {
    return <>{children}</>
  }
  return <TierUpsell requiredTier={requiredTier} label={label} />
}
