const markets = {
  moneyline: ['away', 'home'],
  spread: ['away', 'home'],
  total: ['under', 'over'],
} as const

type Market = keyof typeof markets
const marketKeys = Object.keys(markets) as Market[]
const origin = 'https://prod-website.pikkit.app'
export const pikkitEventIdPattern = /^[a-z0-9-]{1,80}$/

export const pikkitRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null

export function pikkitOverviewEventId(url: string) {
  try {
    const parsed = new URL(url)
    return parsed.origin === origin && !parsed.search
      ? parsed.pathname.match(/^\/event\/foryou\/([a-z0-9-]{1,80})$/)?.[1] ?? null : null
  } catch {
    return null
  }
}

function boundedNumber(value: unknown, min: number, max: number) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : null
}

function splitSide(value: unknown, side: string) {
  const row = pikkitRecord(value)
  if (!row) return []
  const betShare = boundedNumber(row.bet_pct, 0, 1)
  const moneyShare = boundedNumber(row.handle_pct, 0, 1)
  if (betShare === null && moneyShare === null) return []
  return [{ side, label: typeof row.label === 'string' ? row.label.trim().slice(0, 80) : null, betShare, moneyShare }]
}

function bookQuotes(value: unknown) {
  const book = pikkitRecord(value)
  const odds = pikkitRecord(book?.odds)
  if (!odds || typeof book?.title !== 'string' || !book.title.trim()) return []
  const quotes = marketKeys.flatMap(market => {
    const outcomes = pikkitRecord(odds[market])
    return markets[market].flatMap(side => {
      const row = pikkitRecord(outcomes?.[side])
      const decimalPrice = boundedNumber(row?.odds, 1.000001, 100000)
      const line = market === 'moneyline' ? null : boundedNumber(row?.value, market === 'spread' ? -1000 : 0, 1000)
      if (row?.name !== side || decimalPrice === null || market !== 'moneyline' && line === null) return []
      return [{ market, side, line, decimalPrice }]
    })
  })
  return quotes.length ? [{ book: book.title.trim().slice(0, 80), quotes }] : []
}

export function parsePikkitGameOverview(value: unknown) {
  const root = pikkitRecord(value)
  const community = pikkitRecord(root?.community)
  const event = pikkitRecord(pikkitRecord(root?.info)?.event_info)
  const away = pikkitRecord(event?.away)?.full
  const home = pikkitRecord(event?.home)?.full
  if (!community || typeof away !== 'string' || typeof home !== 'string' || !away.trim() || !home.trim()) return null
  const bets = boundedNumber(community.num_picks, 0, Number.MAX_SAFE_INTEGER)
  const totalBets = Number.isSafeInteger(bets) ? bets : null
  const totalHandleDollars = boundedNumber(community.total_wagered, 0, 1e12)
  const breakdowns = pikkitRecord(community.breakdowns)
  const splits = marketKeys.flatMap(market => {
    const breakdown = pikkitRecord(breakdowns?.[market])
    return markets[market].flatMap(side => splitSide(breakdown?.[side], side).map(row => ({ market, ...row })))
  })
  if (totalBets === null && totalHandleDollars === null && !splits.length) return null
  // Book quotes and the community breakdown are different cohorts. In
  // particular the game totals cannot be multiplied into side counts.
  const books = Array.isArray(root?.odds) ? root.odds.slice(0, 50).flatMap(bookQuotes) : []
  return { away, home, totalBets, totalHandleDollars, splits, books }
}

