import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ProfileForm } from '@/components/settings/ProfileForm'
import { SettingsShell } from '@/components/settings/SettingsShell'

export default async function ProfileSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/settings/profile')

  const { data: profile } = await supabase.from('users').select('*').eq('id', user.id).single()

  return <SettingsShell active="/settings/profile" title="Your public profile" description="Shape how the SlipSurge community sees you, from your identity and bio to teams, players, links, and connected accounts.">
    <div className="ss-settings-card"><ProfileForm profile={profile} /></div>
  </SettingsShell>
}
