import type { NflOddsPlayer } from './nflOddsTypes'
import { americanImpliedProbability } from './nflMarketMath'
import { nflPrimaryMarket } from './nflPrimaryMarket'

type NflRankCandidate = {
  id: string
  name: string
  index: number
  contextProp?: string
  eligible?: boolean
  hasTracking: boolean
  market: NflOddsPlayer | null
}

function marketExpectation(row: NflRankCandidate) {
  const propType = row.contextProp ?? 'anytime_td'
  const market = nflPrimaryMarket(row.market, propType)
  if (!market) return null
  const expectations = market.offers.flatMap(offer => {
    if (offer.isOpeningOnly) return []
    const odds = offer.type === 'milestone' ? offer.current.odds : offer.current.over
    const probability = americanImpliedProbability(odds)
    if (probability == null) return []
    if (propType.includes('td')) return [probability]
    const line = offer.line ?? market.line
    return [line == null ? probability : line + (probability - 0.5) * Math.max(Math.abs(line), 1) * 0.35]
  })
  return expectations.length ? expectations.reduce((sum, value) => sum + value, 0) / expectations.length : null
}

export function addNflMmRanks<T extends NflRankCandidate>(rows: T[]) {
  const sportsbookRanks = new Map<string, number>()
  const performanceRanks = new Map<string, number>()
  const groups = new Map<string, T[]>()
  for (const row of rows) {
    if (row.eligible === false || marketExpectation(row) == null) continue
    const key = row.contextProp ?? 'anytime_td'
    groups.set(key, [...(groups.get(key) ?? []), row])
  }
  for (const group of groups.values()) {
    group
      .map(row => ({ row, expectation: marketExpectation(row) }))
      .filter((item): item is { row: T; expectation: number } => item.expectation != null)
      .sort((a, b) => b.expectation - a.expectation || a.row.name.localeCompare(b.row.name))
      .forEach((item, index) => sportsbookRanks.set(item.row.id, index + 1))
    group
      .filter(row => row.hasTracking)
      .sort((a, b) => b.index - a.index || a.name.localeCompare(b.name))
      .forEach((row, index) => performanceRanks.set(row.id, index + 1))
  }
  return rows.map(row => {
    const sportsbookRank = sportsbookRanks.get(row.id) ?? null
    const performanceRank = performanceRanks.get(row.id) ?? null
    return {
      ...row,
      sportsbookRank,
      performanceRank,
      mm: sportsbookRank != null && performanceRank != null ? sportsbookRank - performanceRank : null,
    }
  })
}
