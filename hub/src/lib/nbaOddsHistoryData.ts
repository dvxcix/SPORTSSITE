import 'server-only'
import { createAdminClient } from './supabase/admin'
import { nbaSharedCache } from './nbaSharedCache'
import type { NbaQuoteOpeningRow } from './nbaOddsHistory'

/** One bounded, shared game read; browsers never issue per-cell history requests. */
export async function getNbaQuoteOpenings(gameId: number): Promise<NbaQuoteOpeningRow[]> {
  const cached = await nbaSharedCache(`quote-openings:v1:${gameId}`, 60, 300, async () => {
    const { data, error } = await createAdminClient().rpc('read_nba_quote_openings', { p_game_id: gameId }).abortSignal(AbortSignal.timeout(12_000))
    if (error || !Array.isArray(data)) throw new Error('NBA price history unavailable')
    return data as NbaQuoteOpeningRow[]
  }, 25)
  return cached.value
}
