import { NBA_FIRST_API_BOOKS, nbaFirstBookRule, nbaFirstEvent, nbaNormalizeFirstOdds, type FirstOddsEvent } from './nbaFirstBasketOdds'
import { nbaQuoteInMode, type NbaOddsMode } from './nbaOddsMode'
import { NBA_FIRST_MARKETS } from './nbaFirstBasketMarkets'
import type { PaintGame, PaintPlayer, PaintProp } from './nbaPaint'

export type NbaFirstApiFrame = { book: string; market: string; observedAt: string; props: PaintProp[] }
export type NbaFirstBookCoverage = { gameId: number; book: string; market: string; status: 'fresh' | 'expired' | 'not_posted' | 'invalid' | 'wrong_phase' | 'unavailable'; quoteAt: string | null; quotes: number }
const vendor = (book: string) => book === 'williamhill_us' ? 'caesars' : book
export const NBA_FIRST_PRICE_BOOKS = NBA_FIRST_API_BOOKS.map(vendor)

/** One complete book/market can advance without certifying an incomplete
 * sibling. Missing or expired markets never produce an empty withdrawal. */
export function nbaFirstBookMarkets(event: FirstOddsEvent, game: PaintGame, players: PaintPlayer[], mode: NbaOddsMode, now = Date.now()) {
  const frames: NbaFirstApiFrame[] = [], coverage: NbaFirstBookCoverage[] = []
  if (nbaFirstEvent([event], game)?.id !== event.id) return { frames, coverage }
  for (const key of NBA_FIRST_API_BOOKS) {
    const books = (event.bookmakers ?? []).filter(book => book.key === key), rule = nbaFirstBookRule(key)
    const sourceMarkets = ['player_first_basket', 'player_first_team_basket', ...(rule === 'first_score' ? ['player_method_of_first_basket'] : [])]
    for (const market of sourceMarkets) {
      const matches = books.length === 1 ? books[0].markets.filter(row => row.key === market) : []
      const report: NbaFirstBookCoverage = { gameId: game.id, book: vendor(key), market, status: 'not_posted', quoteAt: null, quotes: 0 }
      coverage.push(report)
      if (books.length > 1 || matches.length > 1) { report.status = 'invalid'; continue }
      if (!matches.length) continue
      const source = matches[0], at = Date.parse(source.last_update ?? '')
      report.quoteAt = Number.isFinite(at) ? new Date(at).toISOString() : null
      if (!Number.isFinite(at) || at > now || !Array.isArray(source.outcomes) || source.outcomes.length > 300) { report.status = 'invalid'; continue }
      if (now - at > 300_000) { report.status = 'expired'; continue }
      if (!nbaQuoteInMode({ updated_at: source.last_update! }, game, mode, now)) { report.status = 'wrong_phase'; continue }
      const parsed = nbaNormalizeFirstOdds({ ...event, bookmakers: [{ ...books[0], markets: [source] }] }, game, players, now)
      const sides = parsed.rows.reduce((count, row) => count + Number(row.offer.market.over_odds != null) + Number(row.offer.market.under_odds != null), 0)
      // Counts expose duplicate/overwritten sides and No-only outcomes that
      // cannot form a complete Yes panel. They must not withdraw valid history.
      if (parsed.unmatched || sides !== source.outcomes.length) { report.status = 'invalid'; continue }
      const markets: string[] = market === 'player_method_of_first_basket' ? NBA_FIRST_MARKETS.filter(row => row.key.startsWith('first_score_')).map(row => row.key)
        : [market === 'player_first_team_basket' ? rule === 'first_score' ? 'team_first_score' : 'team_first_field_goal' : rule]
      if (parsed.rows.some(row => !markets.includes(row.offer.prop_type))) { report.status = 'invalid'; continue }
      for (const canonical of markets) frames.push({ book: vendor(key), market: canonical, observedAt: new Date(at).toISOString(), props: parsed.rows.filter(row => row.offer.prop_type === canonical).map(row => row.offer) })
      report.status = 'fresh'; report.quotes = parsed.rows.length
    }
  }
  return { frames, coverage }
}
