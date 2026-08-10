import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { effectiveTier, hasFullAccessOverride, hasTierAccess, type Tier } from '@slipsurge/core/tiers'

export const dynamic = 'force-dynamic'

export default async function MarketplaceLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/marketplace')

  const { data: profile } = await createAdminClient()
    .from('users')
    .select('tier, account_type, beta_access_active, discord_advanced_claimed, admin_granted_tier')
    .eq('id', user.id)
    .single()
  const tier = effectiveTier((profile?.tier as Tier | undefined) ?? 'free', profile?.discord_advanced_claimed, profile?.admin_granted_tier as Tier | null)
  if (!hasFullAccessOverride(profile?.account_type, profile?.beta_access_active) && !hasTierAccess(tier, 'ultimate')) notFound()
  return children
}
