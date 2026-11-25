import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireNativeAccount } from '@/lib/supabase/nativeAccount'
import { NBA_ACCESS_COLUMNS, hasNbaAccess } from '@/lib/nbaAccessPolicy'
import { requireNflAccess } from '@/lib/nflAccess'
import { DEFAULT_RESEARCH_PREFERENCES, LAUNCH_PAGES, RESEARCH_BOOKS } from '@/lib/researchPreferences'
import { readResearchPreferences } from '@/lib/researchPreferencesServer'

const headers = { 'Cache-Control': 'private, no-store' }

export async function GET(request: Request) {
  const account = await requireNativeAccount(request)
  if (account.error) return account.error
  const { userId } = account
  try {
    const [saved, profile, nfl] = await Promise.all([
      readResearchPreferences(userId),
      createAdminClient().from('users').select(NBA_ACCESS_COLUMNS).eq('id', userId).maybeSingle(),
      requireNflAccess(),
    ])
    if (!saved.available || profile.error || nfl.error?.status === 503) throw Error()
    const nba = hasNbaAccess(profile.data)
    const football = !nfl.error && nfl.userId === userId
    const launchPages = LAUNCH_PAGES.map(page => ({
      ...page,
      eligible: page.group === 'NBA' ? nba : page.group === 'NFL' ? football : true,
    }))
    return NextResponse.json({
      preferences: saved.preferences,
      defaults: DEFAULT_RESEARCH_PREFERENCES,
      launchPages,
      books: RESEARCH_BOOKS.map(([id, label]) => ({ id, label })),
    }, { headers })
  } catch {
    return NextResponse.json({ error: 'Research preferences unavailable' }, { status: 503, headers })
  }
}
