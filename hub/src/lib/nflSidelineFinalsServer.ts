import 'server-only'
import { createAdminClient } from './supabase/admin'
import { verifiedNflBoardFinal, type NflFinalFeed } from './nflOddsBoardResults'
import { getNflPublicResults } from './nflPublicResultsServer'
import type { NflPublicResult } from './nflPublicResults'
import type { SidelineGame } from '@/app/the-sideline/types'

/** Current final outcomes stay separate from every saved pregame input. */
export async function readNflVerifiedPlayerResults(game: SidelineGame): Promise<NflPublicResult | null> {
  if (game.awayScore == null || game.homeScore == null) return null
  const { data, error } = await createAdminClient().from('nfl_game_feeds')
    .select('game_id,reconciled,fetched_at,game:payload->game').eq('source', 'bdl_plays')
    .eq('game_id', game.id).limit(2).abortSignal(AbortSignal.timeout(5000))
  if (error || data?.length !== 1) return null
  const feed = data[0] as unknown as NflFinalFeed
  if (!verifiedNflBoardFinal(game, feed)) return null
  const result = await getNflPublicResults(game, feed.game!.id)
  return result.status === 'final' ? result : null
}
