import 'server-only'
import { createAdminClient } from './supabase/admin'
import { mergeNflOddsBoards } from './nflOddsLogic'
import type { SidelineOddsBoard } from './nflOddsTypes'

export async function loadNflFanduel(gameId: string, at?: string): Promise<SidelineOddsBoard | null> {
  let query = createAdminClient().from('nfl_fanduel_capture_history').select('board').eq('game_id', gameId)
  if (at) query = query.lte('captured_at', at)
  const { data, error } = await query.order('captured_at', { ascending: false }).limit(1).abortSignal(AbortSignal.timeout(10000)).maybeSingle()
  if (error) throw new Error('Supplemental markets unavailable')
  return data?.board as SidelineOddsBoard ?? null
}

/** Supplement missing offers, but never replace a newer observation with an older scrape. */
export function attachNflFanduel(base: SidelineOddsBoard, supplement: SidelineOddsBoard | null): SidelineOddsBoard {
  if (!supplement) return base
  const filtered = { ...supplement, players: supplement.players.map(player => ({ ...player, markets: player.markets.map(market => ({ ...market, offers: market.offers.filter(offer => {
    const prior = base.players.find(p => p.id === player.id)?.markets.find(m => m.key === market.key)?.offers.find(o => o.vendor === offer.vendor)
    return !prior || Date.parse(offer.updatedAt ?? supplement.capturedAt ?? '') >= Date.parse(prior.updatedAt ?? base.capturedAt ?? '')
  }) })).filter(m => m.offers.length) })) }
  const merged = mergeNflOddsBoards(base, filtered)
  return { ...merged, capturedAt: [base.capturedAt, supplement.capturedAt].filter(Boolean).sort().at(-1) ?? null }
}
