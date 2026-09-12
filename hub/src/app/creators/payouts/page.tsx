import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PayoutSetupClient } from './PayoutSetupClient'
import { hasApprovedCreatorAccess } from '@/lib/creator'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { LockKeyhole } from 'lucide-react'
import styles from './CreatorPayouts.module.css'

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

  if (!profile || !await hasApprovedCreatorAccess(supabase, user.id, profile.account_type)) {
    return (
      <div className={styles.page}><section className={styles.locked}><span className={styles.lockedIcon}><LockKeyhole size={21}/></span><h1>Creator approval required</h1><p>Payout tools unlock after your creator application is approved.</p><Link href="/creators/apply">Apply to become a creator</Link></section></div>
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
      isTestAccount={(profile.username ?? '').toLowerCase() === 'slipsurge'}
      recentPayouts={recentPayouts ?? []}
    />
  )
}
