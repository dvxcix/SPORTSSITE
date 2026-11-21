import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NBA_ACCESS_COLUMNS, hasNbaAccess } from '@/lib/nbaAccessPolicy'
import { requireNflAccess } from '@/lib/nflAccess'
import { readResearchPreferences } from '@/lib/researchPreferencesServer'
import { SettingsShell } from '@/components/settings/SettingsShell'
import { ResearchPreferencesForm } from '@/components/settings/ResearchPreferencesForm'

export const dynamic = 'force-dynamic'

export default async function ResearchSettingsPage() {
  const { data: { user } } = await (await createClient()).auth.getUser()
  if (!user) redirect('/auth/login?next=/settings/research')
  const [saved, profile, nfl] = await Promise.all([
    readResearchPreferences(user.id),
    createAdminClient().from('users').select(NBA_ACCESS_COLUMNS).eq('id', user.id).maybeSingle(),
    requireNflAccess(),
  ])
  return <SettingsShell active="/settings/research" title="Your workspace" description="Start on your page. See your books first.">
    <ResearchPreferencesForm key={user.id} initial={saved.preferences} available={saved.available} access={{ nba: !profile.error && hasNbaAccess(profile.data), nfl: !nfl.error }}/>
  </SettingsShell>
}
