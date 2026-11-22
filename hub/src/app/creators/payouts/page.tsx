import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PayoutSetupClient } from './PayoutSetupClient'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export default async function CreatorPayoutsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/creators/payouts')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('users')
    .select('id, username, account_type, whop_connected_company_id, creator_commerce_status')
    .eq('id', user.id)
    .single()

  if (!profile) throw new Error('Your payout account could not be loaded.')

  const { data: recentPayouts } = await supabase
    .from('creator_commerce_events')
    .select('id, event_type, amount, currency, status, created_at')
    .eq('creator_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20)

  return (
    <PayoutSetupClient
      profile={{ connected: Boolean(profile.whop_connected_company_id) }}
      isTestAccount={(profile.username ?? '').toLowerCase() === 'slipsurge'}
      recentPayouts={recentPayouts ?? []}
    />
  )
}
