import { createHash } from 'node:crypto'
import type { PaintGameOdds, PaintProp } from './nbaPaint'
import { nbaValidOdds } from './nbaOddsHistory'

export type NbaBookHistoryContract = {
  book: string; market: string; market_type: 'milestone' | 'over_under'; line: number
  observed_at: string; quotes: PaintProp[]
}
export type NbaBookHistoryFrame = {
  captured_at: string; quotes: (PaintProp | PaintGameOdds)[]; fingerprint: string
  base_captured_at?: string | null; base_absence_complete?: boolean; book_contracts?: NbaBookHistoryContract[]
}
type Side = 'odds' | 'over_odds' | 'under_odds'
const sides = (quote: PaintProp): Side[] => quote.market.type === 'milestone' ? ['odds'] : ['over_odds', 'under_odds']
const scopeKey = (book: string, market: string, type: string, line: number) => JSON.stringify([book, market, type, line])
const quoteScope = (quote: PaintProp) => scopeKey(quote.vendor, quote.prop_type, quote.market.type, Number(quote.line_value))
const sideKey = (quote: PaintProp, side: Side) => JSON.stringify([quote.game_id, quote.player_id, quoteScope(quote), side])

/** Each complete book panel replaces only its exact scope. Quotes retain their
 * own observation time; a later aggregate capture cannot freshen an old price. */
export function nbaMergeBookHistory(frame: NbaBookHistoryFrame): NbaBookHistoryFrame {
  if (!frame.book_contracts?.length) return frame
  const eventAt = Date.parse(frame.captured_at), baseAt = frame.base_captured_at == null ? null : Date.parse(frame.base_captured_at)
  if (!Number.isFinite(eventAt) || baseAt != null && (!Number.isFinite(baseAt) || baseAt > eventAt) || frame.book_contracts.length > 320) throw new Error('Invalid NBA book history')
  const values = new Map<string, { quote: PaintProp; side: Side }>()
  const other = frame.quotes.filter((quote): quote is PaintGameOdds => !('prop_type' in quote))
  for (const quote of frame.quotes) if ('prop_type' in quote) {
    for (const side of sides(quote)) if (nbaValidOdds(quote.market[side])) values.set(sideKey(quote, side), { quote, side })
  }
  const baseKeys = new Set(values.keys()), seen = new Set<string>()
  for (const contract of frame.book_contracts) {
    const at = Date.parse(contract.observed_at), scope = scopeKey(contract.book, contract.market, contract.market_type, Number(contract.line))
    if (!['betmgm', 'draftkings'].includes(contract.book) || !['milestone', 'over_under'].includes(contract.market_type)
      || !Number.isFinite(Number(contract.line)) || !Number.isFinite(at) || at > eventAt || seen.has(scope)
      || !Array.isArray(contract.quotes) || contract.quotes.length > 100) throw new Error('Invalid NBA book history')
    seen.add(scope)
    const panel = new Map<string, { quote: PaintProp; side: Side }>()
    for (const quote of contract.quotes) {
      if (quoteScope(quote) !== scope || Date.parse(quote.updated_at) !== at) throw new Error('Invalid NBA book history quote')
      for (const side of sides(quote)) if (nbaValidOdds(quote.market[side])) {
        const key = sideKey(quote, side)
        if (panel.has(key)) throw new Error('Duplicate NBA book history quote')
        panel.set(key, { quote, side })
      }
    }
    for (const [key, value] of values) if (quoteScope(value.quote) === scope && !panel.has(key) && Date.parse(value.quote.updated_at) < at) values.delete(key)
    for (const [key, value] of panel) {
      const existing = values.get(key)
      // A later complete feed's absence is a withdrawal. A quote present in
      // that feed is compared by its own source timestamp, never feed time.
      if (!existing && !baseKeys.has(key) && frame.base_absence_complete === true && baseAt != null && baseAt >= at) continue
      if (!existing || Date.parse(existing.quote.updated_at) < at) values.set(key, value)
    }
  }
  // Keep separately observed O/U sides separate instead of assigning the
  // newer side's timestamp to both prices.
  const grouped = new Map<string,PaintProp>()
  for(const [, {quote,side}] of [...values.entries()].sort(([a],[b])=>a.localeCompare(b))) {
    const key=JSON.stringify([quote.game_id,quote.player_id,quoteScope(quote),quote.updated_at]),prior=grouped.get(key)
    grouped.set(key,{...(prior??quote),market:{...(prior?.market??{type:quote.market.type}),[side]:quote.market[side]}})
  }
  const quotes=[...grouped.values()]
  const fingerprint = createHash('sha256').update(JSON.stringify([...values.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => [key, value.quote.market[value.side]]))).digest('hex')
  return { ...frame, quotes: [...other, ...quotes], fingerprint }
}
