import { nbaPrice, type PaintProp } from './nbaPaint'
import { nbaAttachOpenings, type NbaQuoteOpeningRow } from './nbaOddsHistory'
import { impliedProbability } from './nbaMarketMetrics'
import type { FirstBasketRow } from './nbaFirstBasketOdds'
import type { PaintFrame } from './nbaMovement'

export type NbaFirstMovement = {
  change: number | null; previousChange: number | null
  previousOdds: number | null; previousAt: string | null
  firstAt: string | null; latestAt: string | null
}
/** RPC game/phase aggregate; never a count for any individual quote. */
export type NbaFirstState = { frames: PaintFrame[]; captures: number }
const identity = (offer: PaintProp) => JSON.stringify([offer.game_id, offer.player_id, offer.vendor, offer.prop_type, offer.market.type, Number(offer.line_value)])

/** A quote keeps its exact book, winning event, method, side and threshold. */
export function nbaFirstMovements(rows: FirstBasketRow[], openings: NbaQuoteOpeningRow[], state: NbaFirstState, asOf = Date.now()): FirstBasketRow[] {
  const ordered = state.frames.filter(frame => Number.isFinite(Date.parse(frame.captured_at)) && Date.parse(frame.captured_at) <= asOf).sort((a, b) => Date.parse(a.captured_at) - Date.parse(b.captured_at))
  return rows.map(row => {
    const offer = nbaAttachOpenings(row.game.id, [row.offer], [], openings.filter(opening => Date.parse(opening.observed_at) <= asOf)).props[0]
    const current = impliedProbability(nbaPrice(offer)), opening = offer.opening?.over
    const first = impliedProbability(opening?.odds), key = identity(offer)
    const points: { at:string;odds:number }[]=[]
    let present=false
    let lastObservedAt:string|null=null
    for (const frame of ordered) {
      const prior = frame.props.find(prop => identity(prop) === key)
      const odds = prior && nbaPrice(prior)
      present=!!prior && impliedProbability(odds)!=null && Number.isFinite(Date.parse(prior.updated_at)) && Date.parse(prior.updated_at)<=asOf
      if(!present){points.length=0;continue}
      const point={at:prior!.updated_at,odds:odds!},last=points.at(-1)
      lastObservedAt=point.at
      // Another contract's observation carries this quote unchanged. It is
      // not a second observation of this price and must not hide its move.
      if(last?.at!==point.at || last.odds!==point.odds)points.push(point)
    }
    // Do not reach past a withdrawal to claim continuity. When the current
    // price is already captured, compare it with the preceding stored frame.
    const last = points.at(-1), quoteAt = Date.parse(offer.updated_at)
    const conflict = points.some(point => Date.parse(point.at) === quoteAt && point.odds !== nbaPrice(offer))
    // Equal timestamps identify the same source observation, not a repeat.
    // A conflicting price at that timestamp is ambiguous and has no prior.
    const candidate = !conflict && present && last && Number.isFinite(quoteAt) && quoteAt <= asOf
      ? Date.parse(last.at) === quoteAt
        ? last.odds === nbaPrice(offer) ? points.at(-2) : undefined
        : Date.parse(last.at) < quoteAt ? last : undefined
      : undefined
    const prior = candidate && Date.parse(candidate.at) < quoteAt ? candidate : undefined
    const firstAt = opening?.at ?? null
    const firstTime = firstAt ? Date.parse(firstAt) : NaN
    const change = !conflict && current != null && first != null && Number.isFinite(quoteAt) && quoteAt <= asOf
      && Number.isFinite(firstTime) && firstTime < quoteAt ? (current - first) * 100 : null
    return { ...row, offer, movement: {
      change, previousChange: current != null && prior ? (current - impliedProbability(prior.odds)!) * 100 : null,
      previousOdds: prior?.odds ?? null, previousAt: prior?.at ?? null, firstAt,
      latestAt: lastObservedAt,
    } }
  })
}
