import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { DEFAULT_RESEARCH_PREFERENCES, LAUNCH_PAGES, launchDestination, validResearchPreferences, type ResearchPreferences } from './researchPreferences'
import { NBA_ACCESS_COLUMNS, hasNbaAccess } from './nbaAccessPolicy'
import { requireNflAccess } from './nflAccess'

// Callers must pass the ID obtained from their verified session. Never accept a request user_id.
export async function readResearchPreferences(userId: string): Promise<{ preferences: ResearchPreferences; available: boolean }> {
  try {
    const { data, error } = await createAdminClient().from('member_research_preferences').select('preferences').eq('user_id', userId).abortSignal(AbortSignal.timeout(3000)).maybeSingle()
    if (error || (data && !validResearchPreferences(data.preferences))) throw new Error('Preferences unavailable')
    return { preferences: data?.preferences ?? structuredClone(DEFAULT_RESEARCH_PREFERENCES), available: true }
  } catch {
    console.error('[research-preferences] private defaults unavailable')
    return { preferences: structuredClone(DEFAULT_RESEARCH_PREFERENCES), available: false }
  }
}

export async function memberLaunchDestination(userId: string): Promise<string> {
  const { preferences } = await readResearchPreferences(userId)
  const page = LAUNCH_PAGES.find(item => item.id === preferences.launchPage)
  if (page?.group === 'NBA') {
    const { data, error } = await createAdminClient().from('users').select(NBA_ACCESS_COLUMNS).eq('id', userId).maybeSingle()
    return launchDestination(preferences, { nba: !error && hasNbaAccess(data), nfl: false })
  }
  if (page?.group === 'NFL') {
    const gate = await requireNflAccess()
    return launchDestination(preferences, { nba: false, nfl: !gate.error && gate.userId === userId })
  }
  return launchDestination(preferences, { nba: false, nfl: false })
}
