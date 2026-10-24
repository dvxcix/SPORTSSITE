import { nbaBinary, nbaPrice, nbaMarketLogs, nbaAverage, nbaReference, nbaSample, nbaValue, type PaintMarket, type PaintPlayer } from './nbaPaint'

export const impliedProbability = (odds: number | null | undefined) => odds == null || !Number.isFinite(odds) || Math.abs(odds) < 100 ? null : odds > 0 ? 100 / (odds + 100) : -odds / (-odds + 100)
export type PaintRanks = { marketRank: number; statRank: number; mm: number; performance: number; expectation: number }

// Match the Sideline convention: sportsbook rank minus performance rank.
// NBA performance uses observed regular-season production, not an untrained model.
export function nbaMarketRanks(players: PaintPlayer[], market: PaintMarket, vendor = 'all', location: 'all' | 'home' | 'away' = 'all', boundary?: { gameId: number; beforeDate: string }) {
  const pool = players.flatMap(player => {
    // A repeated contract must not give one book extra consensus weight. Keep
    // the newest observation and reject quotes belonging to another selection.
    const contracts = new Map<string, PaintPlayer['props'][number]>()
    for (const quote of player.props) {
      if (quote.player_id !== player.id || boundary && quote.game_id !== boundary.gameId) continue
      for (const side of ['over','under'] as const) {
        if (nbaPrice(quote,side)==null) continue
        const key = `${quote.game_id}:${quote.vendor}:${quote.prop_type}:${quote.market.type}:${Number(quote.line_value)}:${side}`
        const previous = contracts.get(key)
        if (!previous || quote.updated_at > previous.updated_at) contracts.set(key, quote)
      }
    }
    const props = [...new Set(contracts.values())]
    const reference = nbaReference(props, market, vendor)
    const logs = nbaSample(nbaMarketLogs(player, market).filter(log =>
      log.player.id === player.id && nbaValue(log, market) != null &&
      (!boundary || log.game.date.slice(0, 10) < boundary.beforeDate && log.game.id !== boundary.gameId) &&
      log.game.postseason !== true && (log.game.status_state === 'final' || log.game.status === 'Final')
    ), 10, location)
    const recent = nbaAverage(logs, market), season = nbaValue(player.average, market)
    if (!reference || recent == null || season == null || !Number.isFinite(season) || logs.length < 5) return []
    const sameLine = props.filter(p => p.prop_type === market && p.market.type === reference.market.type && Number(p.line_value) === Number(reference.line_value) && (vendor === 'all' || p.vendor === vendor))
    const probabilities = [...new Set(sameLine.map(p=>`${p.game_id}:${p.vendor}`))].flatMap(key => {
      const quotes=sameLine.filter(p=>`${p.game_id}:${p.vendor}`===key)
      const over=impliedProbability(quotes.map(p=>nbaPrice(p)).find(value=>value!=null)),under=impliedProbability(quotes.map(p=>nbaPrice(p,'under')).find(value=>value!=null))
      return over!=null&&under!=null?[over/(over+under)]:reference.market.type==='milestone'&&over!=null?[over]:[]
    })
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

export function nbaMmDescription(rank?: PaintRanks | null) {
  return rank
    ? `Book rank #${rank.marketRank} · Production rank #${rank.statRank}. ${rank.mm === 0 ? 'Rankings agree; no rank mismatch.' : rank.mm > 0 ? 'Production ranks ahead of the market.' : 'The market ranks ahead of production.'}`
    : 'MM requires a current priced market, a valid production baseline and at least 5 completed games in a pool of 2 or more qualifying players.'
}

export function nbaFormGap(average: number | null, offer: import('./nbaPaint').PaintProp, side: 'over' | 'under') {
  if (average == null) return null
  const probability = impliedProbability(nbaPrice(offer, side))
  if (nbaBinary(offer.prop_type)) return probability == null ? null : ((side === 'over' ? average : 1-average) - probability) * 100
  const threshold = offer.market.type === 'milestone' ? Math.ceil(Number(offer.line_value)) - .5 : Number(offer.line_value)
  return (average-threshold)*(side === 'over' ? 1 : -1)
}
