import 'server-only'
import { createAdminClient } from './supabase/admin'
import { getPaintGame } from './nbaPaintData'
import { nbaGameStart } from './nbaOddsMode'
import { nbaSharedCache } from './nbaSharedCache'
import { nbaGameOverviewView } from './nbaGameOverview'
import { getNbaPhaseFrames } from './nbaOddsPhaseData'
import type { PaintGameOdds } from './nbaPaint'
import type { NbaOddsMode } from './nbaOddsMode'

/** Read the existing collector archive. No provider request or capture replay. */
export async function getNbaGameOverview(gameId: number) {
  const game = await getPaintGame(gameId), cutoff = nbaGameStart(game)
  if (game.id !== gameId || cutoff == null) throw new Error('Verified NBA matchup required')
  const now = Date.now()
  return (await nbaSharedCache(`game-overview:v1:${gameId}:${cutoff}:${now >= cutoff ? 'closed' : 'open'}`, 60, 0, async () => {
    const { data, error } = await createAdminClient().from('pikkit_pregame_overviews')
      .select('game_id,observed_at,cutoff_at,snapshot').eq('sport', 'nba').eq('game_id', String(gameId))
      .lt('observed_at', new Date(cutoff).toISOString()).lte('observed_at', new Date(now).toISOString())
      .order('observed_at', { ascending: false }).limit(1).abortSignal(AbortSignal.timeout(12000)).maybeSingle()
    if (error) throw new Error('Game public activity unavailable')
    return nbaGameOverviewView(data, game, cutoff, now)
  }, 25)).value
}

/** Odds Board does not load the heavy player-research board. Its header reads
 * only the selected game's existing phase-safe game-price capture. */
export async function getNbaHeaderPrices(gameId: number, mode: NbaOddsMode) {
  const game = await getPaintGame(gameId)
  const frames = await getNbaPhaseFrames(game, mode, 'game', { selection: 'latest' })
  return (frames[0]?.quotes ?? []) as PaintGameOdds[]
}
