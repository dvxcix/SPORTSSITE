import { parseNbaSelection } from './nbaPaint'

export function watchlistPlayerHref(item: { sport: string; prop_key: string; mlb_id: number | null; nfl_selection?: { player_id: string } | null }) {
  if (item.sport.toLowerCase() === 'nba') {
    const selection = parseNbaSelection(item.prop_key)
    return selection ? `/nba/players/${selection.player_id.slice(4)}` : null
  }
  if (item.sport.toLowerCase() === 'nfl') {
    const id = item.nfl_selection?.player_id
    // The NFL profile directory uses GSIS IDs. Never send a BDL or MLB ID there.
    return id && /^\d{2}-\d{7}$/.test(id) ? `/nfl/players/${id}` : null
  }
  return item.sport.toLowerCase() === 'mlb' && item.mlb_id ? `/players/${item.mlb_id}` : null
}
