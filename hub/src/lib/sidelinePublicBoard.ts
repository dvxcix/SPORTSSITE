import type { SidelineOddsBoard } from './nflOddsTypes'

/** Remove ingestion metadata, including legacy stored keys, before serialization. */
export function sidelinePublicBoard(board: SidelineOddsBoard): SidelineOddsBoard {
  const clean = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(clean)
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !/pikkit|rawMarket|sourceUrl|rawPayload/i.test(key))
      .map(([key, item]) => [key, clean(item)]))
    if (typeof value === 'string' && /pikkit/i.test(value)) return 'Picks'
    return value
  }
  return clean(board) as SidelineOddsBoard
}
