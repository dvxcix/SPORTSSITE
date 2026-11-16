import 'server-only'
import { getPaintGame, getPaintProps, getPaintMarketRoster } from './nbaPaintData'
import { nbaBinary, PAINT_MARKETS, type PaintProp } from './nbaPaint'
import { nbaFirstMarket, nbaFirstLabel } from './nbaFirstBasketMarkets'
import { getNbaFirstOdds } from './nbaFirstBasketOddsData'
import { nbaSharedCache } from './nbaSharedCache'
import { nbaSupplementalQuote } from './nbaSupplementalProps'
import { nbaGameStart, nbaPickGameOpen, nbaQuoteInMode } from './nbaOddsMode'
export type PaintPickLeg = { player_id?: string | null; player_name: string; team: string | null; game_pk: string | null; game_date: string | null; prop_key: string; prop_label: string; line?: string; numeric_line?: number | null; market_side?: 'over' | 'under' | 'milestone'; book: string | null; odds: number | null }
type PaintPickValidation = { error: string } | { cutoff: number }
export function paintOfferMatches(offer: PaintProp, leg: PaintPickLeg) {
  const player = Number(leg.player_id?.replace(/^bdl:/, ''))
  const side = leg.market_side
  const odds = side === 'milestone' ? offer.market.odds : side === 'under' ? offer.market.under_odds : side === 'over' ? offer.market.over_odds : null
  return offer.player_id === player && String(offer.game_id) === leg.game_pk && offer.vendor === leg.book && offer.prop_type === leg.prop_key && Number(offer.line_value) === leg.numeric_line && (side === 'milestone' ? offer.market.type === 'milestone' : offer.market.type === 'over_under') && odds != null && odds === leg.odds
}
export async function validatePaintPickLegs(legs: PaintPickLeg[]): Promise<PaintPickValidation> {
  try {
    if (!legs.length || legs.length > 30) return { error: 'Choose 1–30 NBA selections.' }
    if (new Set(legs.map(l => l.book)).size !== 1 || legs.some(l => !l.book)) return { error: 'All NBA parlay legs must use the same sportsbook.' }
    const unique = new Set<string>()
    const groups = new Map<string, PaintPickLeg[]>()
    for (const leg of legs) {
      const id = leg.game_pk
      if (!id || !/^\d{1,10}$/.test(id) || !/^bdl:\d{1,10}$/.test(leg.player_id ?? '') ||
        !(PAINT_MARKETS.some(market => market.key === leg.prop_key) || nbaFirstMarket(leg.prop_key)) ||
        leg.numeric_line == null || !Number.isFinite(leg.numeric_line) || leg.numeric_line < 0 ||
        !['over', 'under', 'milestone'].includes(leg.market_side ?? '')) return { error: 'Re-save the exact NBA market from The Court.' }
      if (nbaFirstMarket(leg.prop_key) && (leg.numeric_line !== .5 || !['over', 'under'].includes(leg.market_side ?? ''))) return { error: 'Re-save the exact first-basket selection.' }
      const key = `${id}:${leg.player_id}:${leg.prop_key}`
      if (unique.has(key)) return { error: 'Choose one line and side per player/market in a parlay.' }
      unique.add(key)
      const group = groups.get(id) ?? []
      group.push(leg)
      groups.set(id, group)
    }
    const results = await Promise.all([...groups].map(async ([id, gameLegs]): Promise<PaintPickValidation> => {
      const game = (await nbaSharedCache(`pick-game:v1:${id}`, 15, 0, () => getPaintGame(Number(id), true), 25)).value
      const start = nbaGameStart(game)
      if (start == null || !nbaPickGameOpen(game, Date.now())) return { error: 'An NBA game has already started or is unavailable.' }
      const roster = await getPaintMarketRoster(game)
      const players = new Map(roster.map(player => [`bdl:${player.id}`, player]))
      const unavailable = gameLegs.find(leg => !players.has(leg.player_id!))
      if (unavailable) return { error: `${unavailable.player_name} is unavailable for this matchup. Refresh The Court.` }
      // Supplemental inputs retain their shared 120-second source policy.
      // Only source data is cached, and every leg checks its exact price.
      const [regular, first] = await Promise.all([
        gameLegs.some(leg => !nbaFirstMarket(leg.prop_key))
          ? nbaSharedCache(`pick-props:v2:${id}`, 15, 0, () => getPaintProps(Number(id), true), 55).then(result => result.value)
          : [],
        gameLegs.some(leg => nbaFirstMarket(leg.prop_key))
          ? nbaSharedCache(`pick-first:v2:${id}`, 15, 0, () => getNbaFirstOdds(game, true), 40).then(result => result.value)
          : { rows: [] },
      ])
      const now = Date.now()
      if (!nbaPickGameOpen(game, now)) return { error: 'An NBA game has already started or is unavailable.' }
      const props = [...regular, ...first.rows.map(row => row.offer)].filter(quote =>
        nbaQuoteInMode(quote, game, 'pregame', now) && (!nbaSupplementalQuote(quote) || now - Date.parse(quote.updated_at) <= 300_000))
      for (const leg of gameLegs) {
        if (!props.some(offer => paintOfferMatches(offer, leg))) return { error: `${leg.player_name}'s selected NBA price changed. Remove the old saved selection and save the current price from The Court.` }
        const identity = players.get(leg.player_id!)!
        leg.player_name = `${identity.first_name} ${identity.last_name}`
        leg.team = identity.team.abbreviation
        leg.game_date = game.date
        leg.line = String(leg.numeric_line)
        const label = nbaFirstLabel(leg.prop_key) ?? PAINT_MARKETS.find(m => m.key === leg.prop_key)!.label
        leg.prop_label = `${nbaBinary(leg.prop_key) ? leg.market_side === 'under' ? 'No' : 'Yes' : leg.market_side === 'milestone' ? `${leg.numeric_line}+` : `${leg.market_side === 'under' ? 'Under' : 'Over'} ${leg.numeric_line}`} ${label}`
      }
      return { cutoff: start }
    }))
    let cutoff = Infinity
    for (const result of results) {
      if ('error' in result) return result
      cutoff = Math.min(cutoff, result.cutoff)
    }
    return { cutoff }
  } catch { return { error: 'NBA prices could not be verified. No pick was posted. Try again.' } }
}
