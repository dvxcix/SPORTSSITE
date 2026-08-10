import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { NotificationSettingsForm } from '@/components/settings/NotificationSettingsForm'
import { PushNotificationToggle } from '@/components/settings/PushNotificationToggle'
import { SettingsShell } from '@/components/settings/SettingsShell'

export default async function NotificationSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/settings/notifications')
  const { data: profile } = await supabase.from('users').select('notification_settings').eq('id', user.id).single()
  return <SettingsShell active="/settings/notifications" title="Notification center" description="Choose what reaches you, where it appears, and which alerts deserve your attention.">
    <div className="space-y-4"><PushNotificationToggle /><NotificationSettingsForm settings={profile?.notification_settings ?? {}} /></div>
  </SettingsShell>
}
