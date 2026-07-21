import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { OnboardingFlow } from '@/components/onboarding/OnboardingFlow'
import { Spotlight } from '@/components/ui/spotlight'

export default async function OnboardingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('users')
    .select('username, display_name, bio, avatar_url, favorite_teams, account_type, favorite_sports, onboarding_completed_at, is_private, hide_win_rate')
    .eq('id', user.id)
    .single()

  // The proxy gate sends anyone with onboarding_completed_at still null
  // here — but someone who already finished can still type /onboarding
  // into the address bar manually. Send them on instead of re-showing the
  // wizard for a completed account.
  if (profile?.onboarding_completed_at) redirect('/feed')

  // Suggested accounts to follow — same shape/ranking as RightSidebar's own
  // query (top follower_count, excluding self), reused as a server-side
  // fetch here so the onboarding "Who to follow" step has no loading state.
  const { data: suggested } = await supabase
    .from('users')
    .select('id, username, display_name, avatar_url, is_verified, account_type')
    .neq('id', user.id)
    .order('follower_count', { ascending: false })
    .limit(6)

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', background: 'var(--bg)', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: '15%', left: '50%', transform: 'translateX(-50%)', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle, rgba(180,255,77,0.07) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <Spotlight className="left-0 top-0" fill="#B4FF4D" />
      <div style={{ position: 'relative', zIndex: 1, width: '100%', display: 'flex', justifyContent: 'center' }}>
        <OnboardingFlow
          userId={user.id}
          initialProfile={profile}
          accountType={profile?.account_type === 'creator' ? 'creator' : 'user'}
          suggestedUsers={suggested ?? []}
        />
      </div>
    </div>
  )
}
