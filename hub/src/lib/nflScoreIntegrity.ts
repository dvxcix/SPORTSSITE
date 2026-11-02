import type { NflMarketOffer, SidelineOddsBoard } from './nflOddsTypes'

function sameSides(a:NflMarketOffer, b:NflMarketOffer) {
  return (['odds','over','under'] as const).every(side => (a.current[side] != null) === (b.current[side] != null))
}

/** A removed quote cannot supply a current score/rank unless the same exact
 * player, market, book, type, line and sides have a fresh current replacement. */
export function nflUnverifiedScoreInputs(board: SidelineOddsBoard) {
  const omittedOffers = [...(board.lastSeen?.offers ?? []), ...(board.openingOnly?.offers ?? [])]
  const omittedLines = [...(board.lastSeen?.lines ?? []), ...(board.openingOnly?.lines ?? [])]
  const environment = omittedLines.some(old => !board.gameLines.some(line => !line.isOpeningOnly && line.vendor === old.vendor))
  const markets = new Set(omittedOffers.flatMap(old => {
    const player = board.players.find(row => row.id === old.playerId)
    const hasCurrent = player?.markets.some(market => market.propType === old.propType && market.offers.some(offer =>
      !offer.isOpeningOnly && offer.vendor === old.offer.vendor && offer.type === old.offer.type && offer.line === old.offer.line && sameSides(old.offer, offer)))
    return hasCurrent ? [] : [old.propType]
  }))
  return { environment, markets }
}
