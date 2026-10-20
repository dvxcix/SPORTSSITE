import { hasNbaAccess } from '@/lib/nbaAccessPolicy'
import { normalizeFavoritePlayers } from '@/lib/sportFavorites'
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
  const { data: profile } = await admin.from('users').select('account_type,tier,discord_advanced_claimed,admin_granted_tier,favorite_sports,favorite_teams,favorite_players,interest_settings').eq('id', user.id).single()

  return <SettingsShell active="/settings/interests" title="Your interests" description="Tune the sports, teams, markets, and conversations that shape your experience.">
    <InterestSettingsForm
      userId={user.id}
      favoriteSports={profile?.favorite_sports ?? []}
      favoriteTeams={profile?.favorite_teams ?? []}
      settings={profile?.interest_settings ?? {}}
      favoritePlayers={normalizeFavoritePlayers(profile?.favorite_players)}
      allowNba={hasNbaAccess(profile)}
    />
  </SettingsShell>
}
