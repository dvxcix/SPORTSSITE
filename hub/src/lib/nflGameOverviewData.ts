import 'server-only'
import { unstable_cache } from 'next/cache'
import { createAdminClient } from './supabase/admin'
import { readNflPregameResearch } from './nflPregameResearchData'
import { nflGameOverviewView } from './nflGameOverview'
import { nflKickoffAt } from '@/app/the-sideline/kickoff'
import type { SidelineGame } from '@/app/the-sideline/types'

const readOverview = unstable_cache(async (game: SidelineGame, cutoff: number, at: number | null) => {
  const now = Date.now(), through = Math.min(now, at ?? now)
  const { data, error } = await createAdminClient().from('pikkit_pregame_overviews')
    .select('game_id,observed_at,cutoff_at,snapshot').eq('sport', 'nfl').eq('game_id', game.id)
    .lt('observed_at', new Date(cutoff).toISOString()).lte('observed_at', new Date(through).toISOString())
    .order('observed_at', { ascending: false }).limit(1).abortSignal(AbortSignal.timeout(12000)).maybeSingle()
  if (error) throw new Error('NFL game public activity unavailable')
  return nflGameOverviewView(data, game, cutoff, now, through)
}, ['nfl-game-public-overview-v1'], { revalidate: 30, tags: ['sideline:nfl-picks'] })

/** Read the existing collector archive; never start a capture from page traffic. */
export async function getNflGameOverview(game: SidelineGame, at: string | null = null) {
  const scheduled = nflKickoffAt(game)?.getTime()
  if (scheduled == null || at != null && !Number.isFinite(Date.parse(at))) throw new Error('Verified NFL matchup required')
  const frozen = await readNflPregameResearch(game, 'odds:v1')
  const cutoff = Math.min(scheduled, frozen ? Date.parse(frozen.cutoffAt) : scheduled)
  return readOverview(game, cutoff, at == null ? null : Date.parse(at))
}
