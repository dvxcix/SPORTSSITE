import 'server-only'
import { getPaintGame, getPaintProps, getPaintIdentity } from './nbaPaintData'
import { nbaBinary, PAINT_MARKETS, type PaintGame, type PaintProp } from './nbaPaint'
export type PaintPickLeg = { player_id?: string | null; player_name: string; team: string | null; game_pk: string | null; game_date: string | null; prop_key: string; prop_label: string; line?: string; numeric_line?: number | null; market_side?: 'over' | 'under' | 'milestone'; book: string | null; odds: number | null }
export function paintOfferMatches(offer: PaintProp, leg: PaintPickLeg) {
  const player = Number(leg.player_id?.replace(/^bdl:/, ''))
  const side = leg.market_side
  const odds = side === 'milestone' ? offer.market.odds : side === 'under' ? offer.market.under_odds : side === 'over' ? offer.market.over_odds : null
  return offer.player_id === player && String(offer.game_id) === leg.game_pk && offer.vendor === leg.book && offer.prop_type === leg.prop_key && Number(offer.line_value) === leg.numeric_line && (side === 'milestone' ? offer.market.type === 'milestone' : offer.market.type === 'over_under') && odds != null && odds === leg.odds
}
export async function validatePaintPickLegs(legs: PaintPickLeg[]) {
  const games = new Map<string, { game: PaintGame; props: PaintProp[] }>()
  try {
    if (!legs.length || legs.length > 30) return 'Choose 1–30 NBA selections.'
    if (new Set(legs.map(l => l.book)).size !== 1 || legs.some(l => !l.book)) return 'All NBA parlay legs must use the same sportsbook.'
    const unique = new Set<string>()
    for (const leg of legs) {
      if (!/^\d{1,10}$/.test(leg.game_pk ?? '') || !/^bdl:\d{1,10}$/.test(leg.player_id ?? '') || !PAINT_MARKETS.some(m => m.key === leg.prop_key) || leg.numeric_line == null || !Number.isFinite(leg.numeric_line) || leg.numeric_line < 0 || !['over', 'under', 'milestone'].includes(leg.market_side ?? '')) return 'Re-save the exact NBA market from ThePaint.'
      const key = `${leg.game_pk}:${leg.player_id}:${leg.prop_key}`
      if (unique.has(key)) return 'Choose one line and side per player/market in a parlay.'
      unique.add(key)
    }
    const identities = new Map<number, Awaited<ReturnType<typeof getPaintIdentity>>>()
    await Promise.all([
      ...[...new Set(legs.map(l => l.game_pk!))].map(async id => { const [game, props] = await Promise.all([getPaintGame(Number(id), true), getPaintProps(Number(id), true)]); games.set(id, { game, props }) }),
      ...[...new Set(legs.map(l => Number(l.player_id!.slice(4))))].map(async id => { identities.set(id, await getPaintIdentity(id)) }),
    ])
    for (const leg of legs) {
      const data = games.get(leg.game_pk!)!
      const starts = Date.parse(data.game.datetime ?? data.game.status)
      if (!Number.isFinite(starts) || starts <= Date.now() || !['scheduled', undefined, 'unknown'].includes(data.game.status_state)) return `${leg.player_name}'s game has already started or is unavailable.`
      if (!data.props.some(p => paintOfferMatches(p, leg))) return `${leg.player_name}'s selected NBA price changed. Remove the old saved selection and save the current price from ThePaint.`
      const identity = identities.get(Number(leg.player_id!.slice(4)))!
      if (![data.game.home_team.id, data.game.visitor_team.id].includes(identity.team.id)) return 'Player is no longer on this matchup roster. Refresh the board.'
      leg.player_name = `${identity.first_name} ${identity.last_name}`; leg.team = identity.team.abbreviation; leg.game_date = data.game.date; leg.line = String(leg.numeric_line)
      const label = PAINT_MARKETS.find(m => m.key === leg.prop_key)!.label
      leg.prop_label = `${nbaBinary(leg.prop_key) ? leg.market_side === 'under' ? 'No' : 'Yes' : leg.market_side === 'milestone' ? `${leg.numeric_line}+` : `${leg.market_side === 'under' ? 'Under' : 'Over'} ${leg.numeric_line}`} ${label}`
    }
    return null
  } catch { return 'NBA prices could not be verified. No pick was posted. Try again.' }
}
