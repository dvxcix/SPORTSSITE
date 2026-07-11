import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ProPlanClient } from './ProPlanClient'

export const dynamic = 'force-dynamic'

export default async function ProPlanPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>
}) {
  const { checkout } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/pro')

  const { data: profile } = await supabase
    .from('users')
    .select('membership_expires_at')
    .eq('id', user.id)
    .single()

  const { data: settingsRows } = await supabase
    .from('platform_settings')
    .select('key, value')
    .in('key', ['pro_plan_price_monthly', 'pro_plan_stripe_price_id'])

  const settingsMap: Record<string, any> = {}
  for (const r of settingsRows ?? []) settingsMap[r.key] = r.value

  const priceMonthly = Number(settingsMap.pro_plan_price_monthly ?? 9.99)
  const priceConfigured = !!settingsMap.pro_plan_stripe_price_id

  const isActive = !!profile?.membership_expires_at && new Date(profile.membership_expires_at) > new Date()

  return (
    <ProPlanClient
      priceMonthly={priceMonthly}
      priceConfigured={priceConfigured}
      isActive={isActive}
      expiresAt={profile?.membership_expires_at ?? null}
      checkoutStatus={checkout ?? null}
    />
  )
}
