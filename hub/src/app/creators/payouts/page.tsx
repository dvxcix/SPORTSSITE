import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PayoutSetupClient } from './PayoutSetupClient'
import { hasApprovedCreatorAccess } from '@/lib/creator'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function CreatorPayoutsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('id, username, account_type, whop_connected_company_id, creator_commerce_status')
    .eq('id', user.id)
    .single()

  if (!profile || !await hasApprovedCreatorAccess(supabase, user.id, profile.account_type)) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>
        Payouts are available once your creator application is approved. See{' '}
        <Link href="/creators/apply" style={{ color: 'var(--accent)' }}>Apply to become a creator</Link>.
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
      isTestAccount={profile.username.toLowerCase() === 'slipsurge'}
      recentPayouts={recentPayouts ?? []}
    />
  )
}
