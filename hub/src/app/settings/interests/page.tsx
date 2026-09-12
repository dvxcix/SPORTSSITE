import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { SettingsShell } from '@/components/settings/SettingsShell'
import { InterestSettingsForm } from '@/components/settings/InterestSettingsForm'

export default async function InterestSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/settings/interests')

  const admin = createAdminClient()
  const [{ data: profile }, { data: nflTeams }] = await Promise.all([
    admin.from('users').select('favorite_sports,favorite_teams,interest_settings').eq('id', user.id).single(),
    admin.from('nfl_teams').select('team_abbr,team_name,team_logo_espn').order('team_name'),
  ])

  return <SettingsShell active="/settings/interests" title="Your interests" description="Tune the sports, teams, markets, and conversations that shape your experience.">
    <InterestSettingsForm
      userId={user.id}
      favoriteSports={profile?.favorite_sports ?? []}
      favoriteTeams={profile?.favorite_teams ?? []}
      settings={profile?.interest_settings ?? {}}
      nflTeams={nflTeams ?? []}
    />
  </SettingsShell>
}
