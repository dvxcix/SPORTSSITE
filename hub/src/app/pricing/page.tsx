import { createClient } from '@/lib/supabase/server'
import type { Tier } from '@/lib/tiers'
import { PricingClient } from './PricingClient'

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const { status } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let currentTier: Tier = 'free'
  if (user) {
    const { data } = await supabase.from('users').select('tier').eq('id', user.id).maybeSingle()
    currentTier = (data?.tier as Tier | undefined) ?? 'free'
  }

  return <PricingClient loggedIn={!!user} currentTier={currentTier} checkoutStatus={status ?? null} />
}
