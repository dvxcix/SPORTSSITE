import { nbaBinary, nbaPrice, nbaReference, type PaintProp, type PaintMarket } from './nbaPaint'
import { impliedProbability } from './nbaMarketMetrics'
export type PaintFrame = { captured_at: string; props: PaintProp[] }
export function nbaMovement(frames: PaintFrame[], player: number, market: PaintMarket, vendor: string, side: 'over'|'under' = 'over') {
  const ordered = [...frames].sort((a,b) => a.captured_at.localeCompare(b.captured_at))
  const points = ordered.flatMap(frame => { const quote = nbaReference(frame.props.filter(p => p.player_id === player), market, vendor, side); return quote ? [{ at: frame.captured_at, line: Number(quote.line_value), over: nbaPrice(quote) ?? null, under: nbaPrice(quote,'under') ?? null, type: quote.market.type }] : [] })
  if (!points.length) return { points, lineChange: null, priceChange: null, priceFirstOdds:null, priceLatestOdds:null, first: null, latest: null }
  const first = points[0], latest = points.at(-1)!
  if (ordered.at(-1)?.captured_at !== latest.at) return { points, first, latest: null, lineChange: null, priceChange: null, priceFirstOdds:null, priceLatestOdds:null }
  const comparable = points.length > 1 && ordered.at(-1)?.captured_at === latest.at
  // Probability change only compares the exact same threshold and side.
  const fixed = ordered.flatMap(frame => { const quote = frame.props.find(p => p.player_id === player && p.vendor === vendor && p.prop_type === market && p.market.type === latest.type && Number(p.line_value) === latest.line); const odds=quote?nbaPrice(quote,side):null; const probability = impliedProbability(odds); return probability == null ? [] : [{ at: frame.captured_at, probability,odds:odds! }] })
  const priceChange = comparable && fixed.length > 1 && fixed.at(-1)?.at === latest.at ? (fixed.at(-1)!.probability - fixed[0].probability) * 100 : null
  return { points, first, latest, lineChange: comparable && !nbaBinary(market) && first.type === latest.type ? latest.line - first.line : null, priceChange,priceFirstOdds:priceChange==null?null:fixed[0].odds,priceLatestOdds:priceChange==null?null:fixed.at(-1)!.odds }
}

export function nbaEconomicSnapshot(props: PaintProp[]) {
  return props.map(p => ({ game_id:p.game_id,player_id:p.player_id,prop_type:p.prop_type,vendor:p.vendor,line_value:Number(p.line_value),market:{type:p.market.type,over_odds:p.market.over_odds ?? null,under_odds:p.market.under_odds ?? null,odds:p.market.odds ?? null} })).sort((a,b) => a.player_id-b.player_id || a.prop_type.localeCompare(b.prop_type) || a.vendor.localeCompare(b.vendor) || a.market.type.localeCompare(b.market.type) || a.line_value-b.line_value || JSON.stringify(a.market).localeCompare(JSON.stringify(b.market)))
}
