import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PayoutSetupClient } from './PayoutSetupClient'

export const dynamic = 'force-dynamic'

export default async function CreatorPayoutsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('id, account_type, stripe_account_id, stripe_connect_onboarded, stripe_connect_charges_enabled, stripe_connect_payouts_enabled')
    .eq('id', user.id)
    .single()

  if (profile?.account_type !== 'creator') {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>
        Payouts are available once your creator application is approved. See{' '}
        <a href="/creators/apply" style={{ color: 'var(--accent)' }}>Apply to become a creator</a>.
      </div>
    )
  }

  const { data: recentPayouts } = await supabase
    .from('creator_payouts')
    .select('id, source, gross_amount, platform_fee_amount, creator_amount, status, created_at')
    .eq('creator_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20)

  return (
    <PayoutSetupClient
      profile={profile}
      recentPayouts={recentPayouts ?? []}
    />
  )
}
