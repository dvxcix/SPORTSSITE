import 'server-only'
import { createAdminClient } from './supabase/admin'
import { nbaSharedCache } from './nbaSharedCache'
import type { NbaQuoteOpeningRow } from './nbaOddsHistory'
import type { PaintFrame } from './nbaMovement'
import type { PaintMarket } from './nbaPaint'

/** The RPC retains the first capture and latest 95, including empty market frames. */
export async function getNbaMarketFrames(gameId: number, market: PaintMarket, playerId: number | null = null): Promise<PaintFrame[]> {
  const cached = await nbaSharedCache(`market-history:v1:${gameId}:${market}:${playerId ?? 'all'}`, 60, 0, async () => {
    const { data, error } = await createAdminClient().rpc('read_nba_market_captures', {
      p_game_id: gameId, p_market: market, p_player: playerId,
    }).abortSignal(AbortSignal.timeout(12_000))
    if (error || !Array.isArray(data) || data.length > 96) throw new Error('NBA market history unavailable')
    return data as PaintFrame[]
  }, 25)
  return cached.value
}

/** One bounded, shared game read; browsers never issue per-cell history requests. */
export async function getNbaQuoteOpenings(gameId: number): Promise<NbaQuoteOpeningRow[]> {
  const cached = await nbaSharedCache(`quote-openings:v1:${gameId}`, 60, 300, async () => {
    const { data, error } = await createAdminClient().rpc('read_nba_quote_openings', { p_game_id: gameId }).abortSignal(AbortSignal.timeout(12_000))
    if (error || !Array.isArray(data)) throw new Error('NBA price history unavailable')
    return data as NbaQuoteOpeningRow[]
  }, 25)
  return cached.value
}
