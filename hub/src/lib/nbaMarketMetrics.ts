import { nbaAverage, nbaReference, nbaSample, nbaValue, type PaintMarket, type PaintPlayer } from './nbaPaint'

export const impliedProbability = (odds: number | null | undefined) => odds == null || !Number.isFinite(odds) || Math.abs(odds) < 100 ? null : odds > 0 ? 100 / (odds + 100) : -odds / (-odds + 100)
export type PaintRanks = { marketRank: number; statRank: number; mm: number; performance: number; expectation: number }

// Match the Sideline convention: sportsbook rank minus performance rank.
// NBA performance uses observed regular-season production, not an untrained model.
export function nbaMarketRanks(players: PaintPlayer[], market: PaintMarket, vendor = 'all', location: 'all' | 'home' | 'away' = 'all') {
  const pool = players.flatMap(player => {
    const reference = nbaReference(player.props, market, vendor)
    const logs = nbaSample(player.logs, 10, location)
    const recent = nbaAverage(logs, market), season = nbaValue(player.average, market)
    if (!reference || recent == null || season == null || logs.length < 5) return []
    const sameLine = player.props.filter(p => p.prop_type === market && p.market.type === 'over_under' && Number(p.line_value) === Number(reference.line_value) && (vendor === 'all' || p.vendor === vendor))
    const probabilities = sameLine.flatMap(p => { const over = impliedProbability(p.market.over_odds), under = impliedProbability(p.market.under_odds); return over != null && under != null ? [over / (over + under)] : [] })
    if (!probabilities.length) return []
    const line = Number(reference.line_value), probability = probabilities.reduce((a, b) => a + b, 0) / probabilities.length
    return [{ id: player.id, performance: season * .6 + recent * .4, expectation: line + (probability - .5) * Math.max(line, 1) * .35 }]
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
