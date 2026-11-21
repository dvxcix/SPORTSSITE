import { parseNbaSelection } from './nbaPaint'

export function watchlistPlayerHref(item: { sport: string; prop_key: string; mlb_id: number | null }) {
  if (item.sport.toLowerCase() === 'nba') {
    const selection = parseNbaSelection(item.prop_key)
    return selection ? `/nba/players/${selection.player_id.slice(4)}` : null
  }
  return item.sport.toLowerCase() === 'mlb' && item.mlb_id ? `/players/${item.mlb_id}` : null
}
