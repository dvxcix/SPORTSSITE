import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { NotificationSettingsForm } from '@/components/settings/NotificationSettingsForm'

export default async function NotificationSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/settings/notifications')
  const { data: profile } = await supabase.from('users').select('notification_settings').eq('id', user.id).single()
  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-xl font-black text-white mb-6">Notification Settings</h1>
      <NotificationSettingsForm settings={profile?.notification_settings ?? {}} />
    </div>
  )
}
