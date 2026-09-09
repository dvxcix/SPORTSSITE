import type { NflOddsPlayer, NflPlayerMarket } from './nflOddsTypes'

/** Compact display selection, not a prediction: prefer a two-sided balanced line.
 * Full alternate ladders remain separate markets in the player expansion. */
export function nflPrimaryMarket(player: NflOddsPlayer | null, propType: string, vendor?: string): NflPlayerMarket | null {
  const candidates = (player?.markets ?? []).filter(market => market.propType === propType)
    .filter(market => !['anytime_td', 'first_td', 'anytime_td_1h'].includes(propType) || market.line == null || market.line <= 1)
    .filter(market => !vendor || market.offers.some(offer => offer.vendor === vendor))
  const score = (market: NflPlayerMarket) => {
    const offers = vendor ? market.offers.filter(offer => offer.vendor === vendor) : market.offers
    return Math.min(...offers.map(offer => {
      const price = offer.current.over ?? offer.current.odds
      if (price == null) return 100
      const probability = price < 0 ? -price / (-price + 100) : 100 / (price + 100)
      return (offer.type === 'over_under' ? 0 : 2) + Math.abs(probability - 0.5)
    }))
  }
  return candidates.sort((a, b) => score(a) - score(b) || a.key.localeCompare(b.key))[0] ?? null
}
