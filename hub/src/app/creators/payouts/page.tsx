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
    .select('id, account_type, whop_connected_company_id, creator_commerce_status')
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
    .from('creator_commerce_events')
    .select('id, event_type, amount, currency, status, created_at')
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
