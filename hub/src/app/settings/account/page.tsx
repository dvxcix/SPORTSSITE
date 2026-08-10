import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AccountSettingsForm } from '@/components/settings/AccountSettingsForm'
import { SettingsShell } from '@/components/settings/SettingsShell'

export default async function AccountSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/settings/account')

  const { data: profile } = await supabase.from('users').select('*').eq('id', user.id).single()

  return <SettingsShell active="/settings/account" title="Account and security" description="Manage your sign-in details, connected identity, and account-level controls.">
    <AccountSettingsForm profile={{ ...profile, email: user.email ?? '' }} />
  </SettingsShell>
}
