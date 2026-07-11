import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ProfileForm } from '@/components/settings/ProfileForm'

export default async function ProfileSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/settings/profile')

  const { data: profile } = await supabase.from('users').select('*').eq('id', user.id).single()

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-black text-white mb-6">Edit Profile</h1>
      <ProfileForm profile={profile} />
    </div>
  )
}
