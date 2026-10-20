import 'server-only'
import { createAdminClient } from './supabase/admin'
import { nbaSharedCache } from './nbaSharedCache'
import { getNbaQuoteOpenings } from './nbaOddsHistoryData'
import { nbaFirstMovements, type NbaFirstState } from './nbaFirstBasketMovement'
import type { FirstBasketRow } from './nbaFirstBasketOdds'

export async function getNbaFirstBasketState(gameId: number): Promise<NbaFirstState> {
  return (await nbaSharedCache(`first-basket-state:v1:${gameId}`, 60, 0, async () => {
    const { data, error } = await createAdminClient().rpc('read_nba_first_basket_state', { p_game_id: gameId }).abortSignal(AbortSignal.timeout(12_000))
    if (error || !data || !Array.isArray(data.frames) || data.frames.length > 2 || !Number.isSafeInteger(data.captures)) throw new Error('First-basket history unavailable')
    return data as NbaFirstState
  }, 25)).value
}
export async function attachNbaFirstBasketHistory(gameId: number, rows: FirstBasketRow[], observedAt?: string) {
  const [openings, state] = await Promise.all([getNbaQuoteOpenings(gameId), getNbaFirstBasketState(gameId)])
  const asOf = observedAt ? Date.parse(observedAt) : Date.now()
  return nbaFirstMovements(rows, openings, state, Number.isFinite(asOf) ? asOf : Date.now())
}
