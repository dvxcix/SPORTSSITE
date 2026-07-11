import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PrivacySettingsForm } from '@/components/settings/PrivacySettingsForm'

export default async function PrivacySettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/settings/privacy')
  const { data: profile } = await supabase.from('users').select('is_private, allow_dms').eq('id', user.id).single()
  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-xl font-black text-white mb-6">Privacy Settings</h1>
      <PrivacySettingsForm settings={{ is_private: profile?.is_private ?? false, allow_dms: profile?.allow_dms ?? true }} />
    </div>
  )
}
