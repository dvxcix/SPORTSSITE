import type { PaintGameOdds, PaintProp } from './nbaPaint'

/** First observed by SlipSurge, never a claim to be the sportsbook's launch price. */
export type NbaOpeningQuote = { odds: number; at: string }
export type NbaOpening = { over?: NbaOpeningQuote; under?: NbaOpeningQuote }
export const NBA_GAME_QUOTES = ['spread_home', 'spread_away', 'moneyline_home', 'moneyline_away', 'total_over', 'total_under'] as const
export type NbaGameQuoteKey = typeof NBA_GAME_QUOTES[number]
export type NbaGameOpening = Partial<Record<NbaGameQuoteKey, NbaOpeningQuote & { line: number | null }>>
export type NbaQuoteOpeningRow = {
  game_id: number; player_id: number; vendor: string; market: string; market_type: string
  line: number; side: 'over' | 'under'; odds: number; observed_at: string
}

const validNumber = (value: unknown) => value != null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null
export const nbaValidOdds = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && Math.abs(value) >= 100 && Math.abs(value) <= 1_000_000
const key = (game: number, player: number, vendor: string, market: string, type: string, line: number, side: string) => JSON.stringify([game, player, vendor, market, type, line, side])

export function nbaGameQuote(offer: PaintGameOdds, market: NbaGameQuoteKey) {
  const odds = offer[`${market}_odds` as keyof PaintGameOdds]
  const line = market.startsWith('moneyline_') ? null : market.startsWith('spread_') ? validNumber(offer[`${market}_value` as keyof PaintGameOdds]) : validNumber(offer.total_value)
  return { odds: nbaValidOdds(odds) ? odds : null, line }
}

/** Attach in one pass; an opening from a different threshold, side or book never fits. */
export function nbaAttachOpenings(gameId: number, props: PaintProp[], gameOdds: PaintGameOdds[], rows: NbaQuoteOpeningRow[]) {
  const index = new Map<string, NbaQuoteOpeningRow>()
  for (const row of rows) {
    if (row.game_id !== gameId || !nbaValidOdds(row.odds) || !Number.isFinite(Number(row.line)) || !Number.isFinite(Date.parse(row.observed_at))) continue
    const identity = key(row.game_id, row.player_id, row.vendor, row.market, row.market_type, Number(row.line), row.side)
    const prior = index.get(identity)
    if (!prior || Date.parse(row.observed_at) < Date.parse(prior.observed_at)) index.set(identity, row)
  }
  return {
    props: props.map(offer => {
      const current = { ...offer }; delete current.opening
      const opening: NbaOpening = {}
      if (offer.game_id === gameId && validNumber(offer.line_value) != null) for (const side of ['over', 'under'] as const) {
        if (offer.market.type === 'milestone' && side === 'under') continue
        const row = index.get(key(gameId, offer.player_id, offer.vendor, offer.prop_type, offer.market.type, Number(offer.line_value), side))
        if (row) opening[side] = { odds: row.odds, at: row.observed_at }
      }
      return { ...current, ...(Object.keys(opening).length ? { opening } : {}) }
    }),
    gameOdds: gameOdds.map(offer => {
      const current = { ...offer }; delete current.opening
      const opening: NbaGameOpening = {}
      if (offer.game_id == null || offer.game_id === gameId) for (const market of NBA_GAME_QUOTES) {
        const quote = nbaGameQuote(offer, market)
        if (quote.odds == null || (!market.startsWith('moneyline_') && quote.line == null)) continue
        const row = index.get(key(gameId, 0, offer.vendor, market, 'game', quote.line ?? 0, 'over'))
        if (row) opening[market] = { odds: row.odds, at: row.observed_at, line: quote.line }
      }
      return { ...current, ...(Object.keys(opening).length ? { opening } : {}) }
    }),
  }
}

/** Capture only economics: provider IDs and update timestamps do not create false moves. */
export function nbaGameEconomicSnapshot(gameId: number, offers: PaintGameOdds[]) {
  return offers.filter(offer => offer.game_id == null || offer.game_id === gameId).map(offer => ({
    game_id: gameId, vendor: offer.vendor,
    quotes: NBA_GAME_QUOTES.map(market => ({ market, ...nbaGameQuote(offer, market) })),
  })).sort((a, b) => a.vendor.localeCompare(b.vendor) || JSON.stringify(a.quotes).localeCompare(JSON.stringify(b.quotes)))
}
