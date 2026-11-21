import { nbaPrice, nbaReference, type PaintMarket, type PaintPlayer } from './nbaPaint'
import { nbaMarketUnavailable } from './nbaMarketAvailability'

export type NbaPlayerMarketGroup = 'priced' | 'unpriced' | 'unavailable'
export function nbaPlayerMarketGroup(player: PaintPlayer, market: PaintMarket, book: string, side: 'over' | 'under'): NbaPlayerMarketGroup {
  if (nbaMarketUnavailable(player.injury?.status)) return 'unavailable'
  const quote = nbaReference(player.props, market, book, side)
  return quote && nbaPrice(quote, side) != null ? 'priced' : 'unpriced'
}
/** Keep the member's selected sort within each section, including ascending
 * sorts. A high season average never promotes an unpriced or Out player. */
export function nbaPlayerMarketGroups(players: PaintPlayer[], market: PaintMarket, book: string, side: 'over' | 'under') {
  const groups: Record<NbaPlayerMarketGroup, PaintPlayer[]> = { priced: [], unpriced: [], unavailable: [] }
  for (const player of players) groups[nbaPlayerMarketGroup(player, market, book, side)].push(player)
  return groups
}
