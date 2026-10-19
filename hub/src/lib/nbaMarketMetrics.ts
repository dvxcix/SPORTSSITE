import { nbaBinary, nbaPrice, nbaMarketLogs, nbaAverage, nbaReference, nbaSample, nbaValue, type PaintMarket, type PaintPlayer } from './nbaPaint'

export const impliedProbability = (odds: number | null | undefined) => odds == null || !Number.isFinite(odds) || Math.abs(odds) < 100 ? null : odds > 0 ? 100 / (odds + 100) : -odds / (-odds + 100)
export type PaintRanks = { marketRank: number; statRank: number; mm: number; performance: number; expectation: number }

// Match the Sideline convention: sportsbook rank minus performance rank.
// NBA performance uses observed regular-season production, not an untrained model.
export function nbaMarketRanks(players: PaintPlayer[], market: PaintMarket, vendor = 'all', location: 'all' | 'home' | 'away' = 'all') {
  const pool = players.flatMap(player => {
    const reference = nbaReference(player.props, market, vendor)
    const logs = nbaSample(nbaMarketLogs(player, market), 10, location)
    const recent = nbaAverage(logs, market), season = nbaValue(player.average, market)
    if (!reference || recent == null || season == null || logs.length < 5) return []
    const sameLine = player.props.filter(p => p.prop_type === market && p.market.type === reference.market.type && Number(p.line_value) === Number(reference.line_value) && (vendor === 'all' || p.vendor === vendor))
    const probabilities = sameLine.flatMap(p => { const over = impliedProbability(nbaPrice(p)), under = impliedProbability(nbaPrice(p, 'under')); return over != null && under != null ? [over / (over + under)] : p.market.type === 'milestone' && over != null ? [over] : [] })
    if (!probabilities.length) return []
    const line = Number(reference.line_value), probability = probabilities.reduce((a, b) => a + b, 0) / probabilities.length
    const threshold = reference.market.type === 'milestone' ? Math.ceil(line) - .5 : line
    return [{ id: player.id, performance: season * .6 + recent * .4, expectation: nbaBinary(market) ? probability : threshold + (probability - .5) * Math.max(threshold, 1) * .35 }]
  })
  const output = new Map<number, PaintRanks>()
  if (pool.length < 2) return output
  for (const item of pool) {
    const marketRank = 1 + pool.filter(p => p.expectation > item.expectation).length
    const statRank = 1 + pool.filter(p => p.performance > item.performance).length
    output.set(item.id, { marketRank, statRank, mm: marketRank - statRank, performance: item.performance, expectation: item.expectation })
  }
  return output
}

export function nbaFormGap(average: number | null, offer: import('./nbaPaint').PaintProp, side: 'over' | 'under') {
  if (average == null) return null
  const probability = impliedProbability(nbaPrice(offer, side))
  if (nbaBinary(offer.prop_type)) return probability == null ? null : ((side === 'over' ? average : 1-average) - probability) * 100
  const threshold = offer.market.type === 'milestone' ? Math.ceil(Number(offer.line_value)) - .5 : Number(offer.line_value)
  return (average-threshold)*(side === 'over' ? 1 : -1)
}
