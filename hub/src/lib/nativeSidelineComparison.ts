import { nflHasCurrentMarket, nflMarketExclusion, nflMarketPlayerKey } from './nflAvailability'
import { americanImpliedProbability, impliedProbabilityRatio } from './nflMarketMath'
import type { NflOddsPlayer, SidelineOddsBoard } from './nflOddsTypes'
import { nflPrimaryMarket } from './nflPrimaryMarket'
import { gradeNflPublicProp, type NflOutcome, type NflPublicResult } from './nflPublicResults'
import { nflSidelineResult } from './nflSidelineResult'

const picks = (player: NflOddsPlayer, market: string) => {
  const counts = (player.publicPicks ?? []).filter(item => item.propType === market).map(item => item.picks)
  return counts.length ? Math.max(...counts) : null
}

function touchdown(player: NflOddsPlayer, market: 'first_td' | 'anytime_td') {
  const core = nflPrimaryMarket(player, market, 'fanduel')
  const offer = core?.offers.find(quote => quote.vendor === 'fanduel' && !quote.isOpeningOnly)
  const odds = offer?.current.odds ?? offer?.current.over ?? null
  const average = player.tdBaselines?.find(row => row.vendor === 'fanduel' && row.propType === market)
  return { odds, probability: americanImpliedProbability(odds), picks: picks(player, market),
    average: average && average.sampleGames >= 2 && odds != null ? { odds: average.averageOdds, games: average.sampleGames,
      payoutChange: average.deltaPct == null ? null : average.deltaPct * 100 } : null }
}

function comparisonGrade(final: NflPublicResult | null, player: NflOddsPlayer, market: string, line: number | null,
  side: 'odds' | 'over' | 'under', kind: 'milestone' | 'over_under',
): NflOutcome | null {
  if (final?.status !== 'final') return null
  const result = gradeNflPublicProp(final, player, { propType: market, line, side: side === 'under' ? 'under' : 'over', kind })
  if (market !== 'first_td' || side !== 'under' || result.actual == null) return result
  return { actual: result.actual, state: result.actual === 0 ? 'hit' : 'miss', label: result.actual === 0 ? 'Hit ✓' : 'Miss · final' }
}

export function nativeSidelineComparison(board: SidelineOddsBoard, ids: readonly number[], market: string, all: boolean,
  final: NflPublicResult | null, season: number,
) {
  const candidates = [...new Map([...(board.availabilityPlayers ?? []), ...board.players]
    .map(player => [nflMarketPlayerKey(player), player])).values()].filter(player => ids.includes(player.id))
  const current = new Set(board.players.map(nflMarketPlayerKey))
  const rows = ids.flatMap(id => {
    const matches = candidates.filter(player => player.id === id)
    if (matches.length !== 1) return []
    const player = matches[0]
    const available = !board.availabilityStale && current.has(nflMarketPlayerKey(player)) &&
      !nflMarketExclusion(player, season) && nflHasCurrentMarket(player)
    const markets = available ? player.markets : []
    const offers = markets.filter(entry => entry.propType === market)
    const vendors = [...new Set(offers.flatMap(entry => entry.offers.map(quote => quote.vendor)))].sort()
    const books = vendors.map(book => {
      const primary = nflPrimaryMarket(player, market, book)
      const lines = all ? offers : primary ? [primary] : []
      const values = lines.flatMap(entry => entry.offers.filter(quote => quote.vendor === book).flatMap(quote => {
        const current = quote.isOpeningOnly ? {} : quote.current
        const sides = quote.type === 'milestone' ? ['odds'] as const : ['over', 'under'] as const
        return sides.flatMap(side => {
          const price = current[side] ?? null, opening = quote.opening?.[side] ?? (quote.isOpeningOnly ? quote.current[side] ?? null : null)
          const observed = price != null || opening != null
          const line = quote.line ?? entry.line
          if (!observed) return []
          const result = comparisonGrade(final, player, market, line, side, quote.type)
          return [{ line, openingLine: quote.openingLine, kind: quote.type, side, price, opening, observedAt: quote.updatedAt, result }]
        })
      }))
      return { book, values }
    }).filter(book => book.values.length > 0)
    const first = available ? touchdown(player, 'first_td') : null
    const anytime = available ? touchdown(player, 'anytime_td') : null
    return [{ id: player.id, first, anytime, ratio: impliedProbabilityRatio(first?.odds ?? null, anytime?.odds ?? null),
      observedPicks: available ? picks(player, market) : null, books,
      markets: [...new Map(markets.map(item => [item.propType, { id: item.propType, name: item.label }])).values()],
      finals: nflSidelineResult(final, player) }]
  })
  return { rows, final: final?.status === 'final', availabilityStale: board.availabilityStale === true }
}
