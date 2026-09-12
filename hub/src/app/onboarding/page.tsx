import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { OnboardingFlow } from '@/components/onboarding/OnboardingFlow'
import { Spotlight } from '@/components/ui/spotlight'

export default async function OnboardingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const admin = createAdminClient()
  const [{ data: profile }, { data: suggested }, { data: nflTeams }] = await Promise.all([
    admin.from('users')
      .select('username, display_name, bio, avatar_url, favorite_teams, account_type, favorite_sports, onboarding_completed_at, is_private, hide_win_rate, notification_settings')
      .eq('id', user.id)
      .single(),
    supabase.from('users')
      .select('id, username, display_name, avatar_url, is_verified, account_type')
      .neq('id', user.id)
      .order('follower_count', { ascending: false })
      .limit(6),
    admin.from('nfl_teams').select('team_abbr,team_name,team_logo_espn').order('team_name'),
  ])

  // The proxy gate sends anyone with onboarding_completed_at still null
  // here — but someone who already finished can still type /onboarding
  // into the address bar manually. Send them on instead of re-showing the
  // wizard for a completed account.
  if (profile?.onboarding_completed_at) redirect('/feed')

  return (
    <div className="ss-onboarding-page">
      <div className="ss-onboarding-glow" aria-hidden="true" />
      <Spotlight className="left-0 top-0" fill="#B4FF4D" />
      <div className="ss-onboarding-content">
        <OnboardingFlow
          userId={user.id}
          initialProfile={profile}
          accountType={profile?.account_type === 'creator' ? 'creator' : 'user'}
          suggestedUsers={suggested ?? []}
          nflTeams={nflTeams ?? []}
        />
      </div>
    </div>
  )
}
