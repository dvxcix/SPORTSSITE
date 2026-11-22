import 'server-only'
import { createAdminClient } from './supabase/admin'
import { getNflPublicResults } from './nflPublicResultsServer'
import { verifiedNflBoardFinal, nflBoardFinalValues, type NflFinalFeed, type NflBoardResultQuote, type NflBoardFinal } from './nflOddsBoardResults'
import type { SidelineGame } from '@/app/the-sideline/types'

export async function readNflBoardFinals(games: SidelineGame[], quotes: readonly NflBoardResultQuote[]): Promise<{finals:NflBoardFinal[];finalGames:string[];resultsUnavailable:string[]}> {
  const priced = new Set(quotes.map(q => q[0]))
  const candidates = games.filter(game => priced.has(game.id) && game.awayScore != null && game.homeScore != null)
  if (!candidates.length) return { finals: [], finalGames: [], resultsUnavailable: [] }
  const { data, error } = await createAdminClient().from('nfl_game_feeds')
    .select('game_id,reconciled,fetched_at,game:payload->game').eq('source', 'bdl_plays')
    .in('game_id', candidates.map(game => game.id)).limit(25).abortSignal(AbortSignal.timeout(5000))
  if (error || !data || new Set(data.map(row => row.game_id)).size !== data.length) return { finals: [], finalGames: [], resultsUnavailable: candidates.map(game => game.id) }
  const feeds = data as unknown as NflFinalFeed[]
  const entries: Array<{ gameId: string; values: ReturnType<typeof nflBoardFinalValues> } | null> = []
  for (let offset = 0; offset < candidates.length; offset += 3) {
    entries.push(...await Promise.all(candidates.slice(offset, offset + 3).map(async game => {
      const feed = feeds.find(row => row.game_id === game.id)
      if (!feed || !verifiedNflBoardFinal(game, feed)) return null
      try {
        const result = await getNflPublicResults(game, feed.game!.id)
        return result.status === 'final' ? { gameId: game.id, values: nflBoardFinalValues(game.id, quotes, result) } : null
      } catch { return null }
    })))
  }
  return { finals: entries.flatMap(entry => entry?.values ?? []), finalGames: entries.flatMap(entry => entry ? [entry.gameId] : []), resultsUnavailable: candidates.filter((_, index) => !entries[index]).map(game => game.id) }
}
