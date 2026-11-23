import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PayoutSetupClient } from './PayoutSetupClient'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

function requestClock() { return Date.now() }

export default async function CreatorPayoutsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/creators/payouts')

  const admin = createAdminClient()
  const now = requestClock()
  const { data: profile } = await admin
    .from('users')
    .select('id, username, account_type, whop_connected_company_id, creator_commerce_status')
    .eq('id', user.id)
    .single()

  if (!profile) throw new Error('Your payout account could not be loaded.')

  const { data: recentPayouts, error: revenueError } = await supabase
    .from('creator_commerce_events')
    .select('id, event_type, amount, currency, status, created_at')
    .eq('creator_id', user.id)
    .gte('created_at', new Date(now - 90 * 86400_000).toISOString())
    .order('created_at', { ascending: false })
    .limit(1001)

  return (
    <PayoutSetupClient
      profile={{ connected: Boolean(profile.whop_connected_company_id) }}
      isTestAccount={(profile.username ?? '').toLowerCase() === 'slipsurge'}
      recentPayouts={(recentPayouts ?? []).slice(0, 1000)}
      revenueAvailable={!revenueError}
      revenueLimited={(recentPayouts?.length ?? 0) > 1000}
      now={now}
    />
  )
}
