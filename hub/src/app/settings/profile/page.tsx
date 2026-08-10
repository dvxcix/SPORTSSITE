import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ProfileForm } from '@/components/settings/ProfileForm'
import { SettingsShell } from '@/components/settings/SettingsShell'
import { createAdminClient } from '@/lib/supabase/admin'
import { PRIVATE_ACCOUNT_COLUMNS } from '@/lib/supabase/userColumns'

export default async function ProfileSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/settings/profile')

  const admin = createAdminClient()
  const { data: profile } = await admin.from('users').select(PRIVATE_ACCOUNT_COLUMNS).eq('id', user.id).single()

  return <SettingsShell active="/settings/profile" title="Your public profile" description="Shape how the SlipSurge community sees you, from your identity and bio to teams, players, links, and connected accounts.">
    <div className="ss-settings-card"><ProfileForm profile={profile} /></div>
  </SettingsShell>
}
