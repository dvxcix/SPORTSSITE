import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ProfileForm } from '@/components/settings/ProfileForm'
import { SettingsShell } from '@/components/settings/SettingsShell'
import { createAdminClient } from '@/lib/supabase/admin'
import { PRIVATE_ACCOUNT_COLUMNS } from '@/lib/supabase/userColumns'
import { visibleFavorites } from '@/lib/visibleFavorites'
import { MLB_HIBERNATING } from '@/lib/mlbOffseason'
import type { User } from '@/lib/supabase/types'

export default async function ProfileSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/settings/profile')

  const admin = createAdminClient()
  const { data: profile } = await admin.from('users').select(PRIVATE_ACCOUNT_COLUMNS).eq('id', user.id).single()
  const accountProfile = profile as unknown as User | null

  return <SettingsShell active="/settings/profile" title="Your public profile" description="Shape how the SlipSurge community sees you, from your identity and bio to teams, players, and public links.">
    <div className="ss-settings-card"><ProfileForm profile={accountProfile ? visibleFavorites(accountProfile, !MLB_HIBERNATING || accountProfile.account_type === 'admin') : accountProfile} /></div>
  </SettingsShell>
}
