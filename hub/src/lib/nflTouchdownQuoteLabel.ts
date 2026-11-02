import type { NflTouchdownMarketQuote } from './nflTouchdownFeed'

/** Describes the source quote only; an absent timestamp is never inferred. */
export function nflTouchdownQuoteLabel(quote: NflTouchdownMarketQuote) {
  const date = quote.observedAt ? new Date(quote.observedAt) : null
  const time = date && Number.isFinite(date.getTime()) && date.getTime() <= Date.now()
    ? date.toLocaleString('en-US', { timeZone: 'America/New_York', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' }) + ' ET'
    : 'Time unavailable'
  return `${quote.isOpeningOnly ? 'Opening' : 'Last seen'} · ${time === 'Time unavailable' ? time : `Quote time ${time}`}`
}
