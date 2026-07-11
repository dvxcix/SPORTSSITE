import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AccountSettingsForm } from '@/components/settings/AccountSettingsForm'

export default async function AccountSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/settings/account')

  const { data: profile } = await supabase.from('users').select('*').eq('id', user.id).single()

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-xl font-black text-white mb-6">Account Settings</h1>
      <AccountSettingsForm profile={{ ...profile, email: user.email ?? '' }} />
    </div>
  )
}
