import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { OnboardingFlow } from '@/components/onboarding/OnboardingFlow'

export default async function OnboardingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase.from('users').select('username, display_name, bio, favorite_sports').eq('id', user.id).single()

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-zinc-950">
      <OnboardingFlow userId={user.id} initialProfile={profile} />
    </div>
  )
}
