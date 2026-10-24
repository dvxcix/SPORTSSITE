import type { PaintGame, PaintProp } from './nbaPaint'
import { nbaQuoteInMode } from './nbaOddsMode'
import { nbaValidOdds } from './nbaOddsHistory'

type Side = 'odds' | 'over_odds' | 'under_odds'
export type NbaCurrentBookFrame = {
  book: string; contract: { market: string; type: 'milestone' | 'over_under'; line: number }
  observedAt: string; complete: boolean; props: PaintProp[]
}
export type NbaCurrentBookResult = { props: PaintProp[]; complete: boolean; retainedPrimary?: PaintProp[] }
const sides = (quote: PaintProp): Side[] => quote.market.type === 'milestone' ? ['odds'] : ['over_odds', 'under_odds']
const scope = (book: string, market: string, type: string, line: number) => JSON.stringify([book, market, type, line])
const quoteScope = (quote: PaintProp) => scope(quote.vendor, quote.prop_type, quote.market.type, Number(quote.line_value))
const identity = (quote: PaintProp, side: Side) => JSON.stringify([quote.game_id, quote.player_id, quoteScope(quote), side])
const pickSides = (quote: PaintProp, selected: Side[]): PaintProp => selected.length === sides(quote).filter(side => nbaValidOdds(quote.market[side])).length
  ? quote : { ...quote, market: { type: quote.market.type, ...Object.fromEntries(selected.map(side => [side, quote.market[side]])) } }

/** Validated scheduled observations compete by their actual quote time. A
 * complete fresh panel can withdraw older exact sides; partial panels cannot. */
export function nbaCurrentBookQuotes(game: PaintGame, primary: PaintProp[], frames: NbaCurrentBookFrame[], now: number): NbaCurrentBookResult {
  const present = new Map<string, PaintProp>(), removed = new Set<string>(), chosen = new Map<string, { quote: PaintProp; side: Side }>()
  for (const quote of primary) if (quote.game_id === game.id && nbaQuoteInMode(quote, game, 'pregame', now)) {
    for (const side of sides(quote)) if (nbaValidOdds(quote.market[side])) {
      const key = identity(quote, side), prior = present.get(key)
      if (!prior || Date.parse(quote.updated_at) > Date.parse(prior.updated_at)) present.set(key, quote)
    }
  }
  let complete = true
  for (const frame of frames) {
    if (!frame.complete) complete = false
    const observed = Date.parse(frame.observedAt), freshFrame = observed <= now && now - observed <= 300_000
    const panelKeys = new Set<string>()
    for (const quote of frame.props) {
      const at = Date.parse(quote.updated_at), fresh = freshFrame && at <= now && now - at <= 300_000 && nbaQuoteInMode(quote, game, 'pregame', now)
      for (const side of sides(quote)) if (nbaValidOdds(quote.market[side])) {
        const key = identity(quote, side), prior = present.get(key)
        panelKeys.add(key)
        if (!fresh) { if (!prior) complete = false; continue }
        if (prior && Date.parse(prior.updated_at) >= at) continue
        const selected = chosen.get(key)
        if (!selected || Date.parse(selected.quote.updated_at) < at) chosen.set(key, { quote, side })
        if (prior) removed.add(key)
      }
    }
    if (frame.complete && freshFrame) {
      const exactScope = scope(frame.book, frame.contract.market, frame.contract.type, frame.contract.line)
      for (const [key, quote] of present) if (quoteScope(quote) === exactScope && !panelKeys.has(key) && Date.parse(quote.updated_at) < observed) removed.add(key)
    }
  }
  const groups = new Map<PaintProp, Side[]>()
  for (const { quote, side } of chosen.values()) groups.set(quote, [...(groups.get(quote) ?? []), side])
  const props = [...groups].map(([quote, selected]) => pickSides(quote, selected))
  if (!removed.size) return { props, complete }
  const retainedPrimary = primary.flatMap(quote => {
    const selected = sides(quote).filter(side => nbaValidOdds(quote.market[side]) && !removed.has(identity(quote, side)))
    return selected.length ? [pickSides(quote, selected)] : []
  })
  return { props, complete, retainedPrimary }
}
