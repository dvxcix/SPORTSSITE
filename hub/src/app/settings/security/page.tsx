import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SettingsShell } from '@/components/settings/SettingsShell'
import { SecuritySettingsForm } from '@/components/settings/SecuritySettingsForm'

export default async function SecuritySettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/settings/security')
  return <SettingsShell active="/settings/security" eyebrow="ACCOUNT SECURITY" title="Protect your SlipSurge account" description="Manage two-factor authentication and active sessions."><SecuritySettingsForm /></SettingsShell>
}
