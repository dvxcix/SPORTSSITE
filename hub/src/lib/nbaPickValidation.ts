import 'server-only'
import { getPaintGame, getPaintProps, getPaintIdentity } from './nbaPaintData'
import { PAINT_MARKETS, type PaintGame, type PaintProp } from './nbaPaint'
export type PaintPickLeg = { player_id?: string | null; player_name: string; team: string | null; game_pk: string | null; game_date: string | null; prop_key: string; prop_label: string; numeric_line?: number | null; market_side?: 'over' | 'under' | 'milestone'; book: string | null; odds: number | null }
export function paintOfferMatches(offer: PaintProp, leg: PaintPickLeg) {
  const player = Number(leg.player_id?.replace(/^bdl:/, ''))
  const side = leg.market_side
  const odds = side === 'milestone' ? offer.market.odds : side === 'under' ? offer.market.under_odds : side === 'over' ? offer.market.over_odds : null
  return offer.player_id === player && String(offer.game_id) === leg.game_pk && offer.vendor === leg.book && offer.prop_type === leg.prop_key && Number(offer.line_value) === leg.numeric_line && (side === 'milestone' ? offer.market.type === 'milestone' : offer.market.type === 'over_under') && odds != null && odds === leg.odds
}
export async function validatePaintPickLegs(legs: PaintPickLeg[]) {
  const games = new Map<string, { game: PaintGame; props: PaintProp[] }>()
  try {
    for (const leg of legs) {
      if (!/^\d{1,10}$/.test(leg.game_pk ?? '') || !/^bdl:\d{1,10}$/.test(leg.player_id ?? '') || !PAINT_MARKETS.some(m => m.key === leg.prop_key) || leg.numeric_line == null || !Number.isFinite(leg.numeric_line)) return 'Re-save the exact NBA market from ThePaint.'
      let data = games.get(leg.game_pk!)
      if (!data) { const [game, props] = await Promise.all([getPaintGame(Number(leg.game_pk)), getPaintProps(Number(leg.game_pk), true)]); data = { game, props }; games.set(leg.game_pk!, data) }
      const starts = Date.parse(data.game.datetime ?? data.game.status)
      if (!Number.isFinite(starts) || starts <= Date.now() || !['scheduled', undefined, 'unknown'].includes(data.game.status_state)) return `${leg.player_name}'s game has already started or is unavailable.`
      if (!data.props.some(p => paintOfferMatches(p, leg))) return `${leg.player_name}'s selected NBA price changed. Refresh the board and try again.`
      const identity = await getPaintIdentity(Number(leg.player_id!.slice(4)))
      if (![data.game.home_team.id, data.game.visitor_team.id].includes(identity.team.id)) return 'Player is no longer on this matchup roster. Refresh the board.'
      leg.player_name = `${identity.first_name} ${identity.last_name}`; leg.team = identity.team.abbreviation; leg.game_date = data.game.date
      const label = PAINT_MARKETS.find(m => m.key === leg.prop_key)!.label
      leg.prop_label = `${leg.market_side === 'milestone' ? `${leg.numeric_line}+` : `${leg.market_side === 'under' ? 'Under' : 'Over'} ${leg.numeric_line}`} ${label}`
    }
    return null
  } catch { return 'NBA prices could not be verified. No pick was posted. Try again.' }
}
