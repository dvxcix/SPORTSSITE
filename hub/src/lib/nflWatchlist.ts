import type { NflMarketOffer, NflOddsPlayer, NflPlayerMarket } from './nflOddsTypes'
import type { NewWatchlistItem } from './watchlist'

export type NflSavedSelection = {
  player_id: string
  prop_key: string
  numeric_line: number | null
  market_side: 'milestone' | 'over' | 'under'
}

export function nflWatchlistSelection(player: NflOddsPlayer, market: NflPlayerMarket, offer: NflMarketOffer, side: 'over' | 'under', game: { id: string; gameday: string }): NewWatchlistItem {
  const marketSide = offer.type === 'milestone' ? 'milestone' : side
  const odds = marketSide === 'milestone' ? offer.current.odds : offer.current[side]
  if (odds == null) throw new Error('This price is unavailable. Choose another market.')
  const name = market.propType.replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase())
  const label = ['anytime_td', 'first_td', 'last_td'].includes(market.propType) ? market.label
    : marketSide === 'milestone' ? `${offer.line}+ ${name}` : `${side === 'under' ? 'Under' : 'Over'} ${offer.line} ${name}`
  return {
    sport: 'nfl', game_pk: game.id, game_date: game.gameday, mlb_id: null,
    player_name: player.name, team: player.team, position: player.position, headshot_url: player.headshot,
    prop_key: `nfl:${market.key}${marketSide === 'under' ? ':under' : ''}`,
    prop_label: label, line: offer.line == null ? null : String(offer.line),
    book: offer.vendor, odds,
    odds_by_book: { [offer.vendor]: odds },
    nfl_selection: { player_id: player.gsisId ?? `bdl:${player.id}`, prop_key: market.propType, numeric_line: offer.line, market_side: marketSide },
  }
}

export function watchlistPickPayload(item: NewWatchlistItem) {
  const sport = item.sport?.toUpperCase() === 'NFL' ? 'NFL' : 'MLB'
  if (sport === 'NFL' && !item.nfl_selection) {
    throw new Error(`Please re-save ${item.player_name}'s NFL selection from The Sideline to attach its exact market.`)
  }
  return {
    sport, mlb_id: item.mlb_id, player_name: item.player_name, team: item.team,
    headshot_url: item.headshot_url, game_pk: item.game_pk, game_date: item.game_date,
    prop_key: item.prop_key, prop_label: item.prop_label, line: item.line, book: item.book, odds: item.odds,
    ...(sport === 'NFL' ? item.nfl_selection : {}),
  }
}
