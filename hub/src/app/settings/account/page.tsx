import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AccountSettingsForm } from '@/components/settings/AccountSettingsForm'
import { SettingsShell } from '@/components/settings/SettingsShell'
import { createAdminClient } from '@/lib/supabase/admin'
import { PRIVATE_ACCOUNT_COLUMNS } from '@/lib/supabase/userColumns'

export default async function AccountSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/settings/account')

  const admin = createAdminClient()
  const { data: profile } = await admin.from('users').select(PRIVATE_ACCOUNT_COLUMNS).eq('id', user.id).single()
  const accountProfile = (profile ?? {}) as unknown as Record<string, unknown>

  return <SettingsShell active="/settings/account" title="Account and security" description="Manage your sign-in details, connected identity, and account-level controls.">
    <AccountSettingsForm profile={{ ...accountProfile, email: user.email ?? '' }} />
  </SettingsShell>
}
