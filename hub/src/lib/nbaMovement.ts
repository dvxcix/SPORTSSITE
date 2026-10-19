import { nbaBinary, nbaPrice, nbaReference, type PaintProp, type PaintMarket } from './nbaPaint'
import { impliedProbability } from './nbaMarketMetrics'
import type { NbaQuoteOpeningRow } from './nbaOddsHistory'
export type PaintFrame = { captured_at: string; props: PaintProp[] }
// A book's reference may move only when that book's own quotes move. Using
// cross-book consensus here can manufacture line movement from unchanged quotes.
export function nbaMovementReference(props: PaintProp[], market: PaintMarket, vendor: string, side: 'over'|'under') {
  const own = props.filter(p => p.vendor === vendor && p.prop_type === market && Number.isFinite(Number(p.line_value)) && impliedProbability(nbaPrice(p, side)) != null)
  if (nbaBinary(market)) return nbaReference(own, market, vendor, side)
  const balanced = (p: PaintProp) => {
    const over = impliedProbability(nbaPrice(p)), under = impliedProbability(nbaPrice(p, 'under'))
    const probability = over != null && under != null ? over / (over + under) : impliedProbability(nbaPrice(p, side))!
    return Math.abs(probability - .5)
  }
  return own.filter(p => p.market.type === 'over_under').sort((a,b) => balanced(a) - balanced(b) || Number(a.line_value) - Number(b.line_value) || a.id - b.id)[0] ?? nbaReference(own, market, vendor, side)
}
export function nbaMovement(frames: PaintFrame[], player: number, market: PaintMarket, vendor: string, side: 'over'|'under' = 'over', openingRows: NbaQuoteOpeningRow[] = []) {
  const ordered = [...frames].sort((a,b) => a.captured_at.localeCompare(b.captured_at))
  const points = ordered.flatMap(frame => { const quote = nbaMovementReference(frame.props.filter(p => p.player_id === player), market, vendor, side); return quote ? [{ at: frame.captured_at, line: Number(quote.line_value), over: nbaPrice(quote) ?? null, under: nbaPrice(quote,'under') ?? null, type: quote.market.type }] : [] })
  if (!points.length) return { points, lineChange: null, priceChange: null, priceFirstOdds:null, priceLatestOdds:null, priceFirstAt:null, priceOpeningKnown:false, first: null, latest: null }
  const first = points[0], latest = points.at(-1)!
  if (ordered.at(-1)?.captured_at !== latest.at) return { points, first, latest: null, lineChange: null, priceChange: null, priceFirstOdds:null, priceLatestOdds:null, priceFirstAt:null, priceOpeningKnown:false }
  const comparable = points.length > 1 && ordered.at(-1)?.captured_at === latest.at
  // Probability change only compares the exact same threshold and side.
  const gameId = nbaMovementReference(ordered.at(-1)!.props.filter(p => p.player_id === player), market, vendor, side)?.game_id
  const fixed = ordered.flatMap(frame => { const quote = frame.props.find(p => p.game_id === gameId && p.player_id === player && p.vendor === vendor && p.prop_type === market && p.market.type === latest.type && Number(p.line_value) === latest.line); const odds=quote?nbaPrice(quote,side):null; const probability = impliedProbability(odds); return probability == null ? [] : [{ at: frame.captured_at, probability,odds:odds! }] })
  // A quote may have first appeared outside the replay's retained window. Its
  // immutable opening remains usable, but only if already observed at this
  // replay position. Later openings can never leak into historical captures.
  const stored = openingRows.filter(row => row.game_id === gameId && row.player_id === player && row.vendor === vendor && row.market === market && row.market_type === latest.type && Number(row.line) === latest.line && row.side === side && impliedProbability(row.odds) != null && Number.isFinite(Date.parse(row.observed_at)) && Date.parse(row.observed_at) <= Date.parse(latest.at)).sort((a,b) => Date.parse(a.observed_at)-Date.parse(b.observed_at))[0]
  const priceOpeningKnown = !!stored && (!fixed[0] || Date.parse(stored.observed_at) <= Date.parse(fixed[0].at))
  const baseline = priceOpeningKnown ? { at: stored.observed_at, odds: stored.odds, probability: impliedProbability(stored.odds)! } : fixed[0]
  const priceChange = baseline && fixed.at(-1)?.at === latest.at && Date.parse(baseline.at) < Date.parse(latest.at) ? (fixed.at(-1)!.probability - baseline.probability) * 100 : null
  return { points, first, latest, lineChange: comparable && !nbaBinary(market) && first.type === latest.type ? latest.line - first.line : null, priceChange,priceFirstOdds:priceChange==null?null:baseline.odds,priceLatestOdds:priceChange==null?null:fixed.at(-1)!.odds,priceFirstAt:priceChange==null?null:baseline.at,priceOpeningKnown }
}

export function nbaEconomicSnapshot(props: PaintProp[]) {
  return props.map(p => ({ game_id:p.game_id,player_id:p.player_id,prop_type:p.prop_type,vendor:p.vendor,line_value:Number(p.line_value),market:{type:p.market.type,over_odds:p.market.over_odds ?? null,under_odds:p.market.under_odds ?? null,odds:p.market.odds ?? null} })).sort((a,b) => a.player_id-b.player_id || a.prop_type.localeCompare(b.prop_type) || a.vendor.localeCompare(b.vendor) || a.market.type.localeCompare(b.market.type) || a.line_value-b.line_value || JSON.stringify(a.market).localeCompare(JSON.stringify(b.market)))
}
