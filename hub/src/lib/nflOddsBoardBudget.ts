import { nflBoardPickKey, nflUniqueBoardPicks, type NflBoardPick } from './nflOddsBoardPicks'

type Quote = readonly [string, number, string, string, string, string, string, number, ...unknown[]]
type PackedPick = [quoteIndex: number, count: number, estimated: boolean]
type Board = { quotes: Quote[]; picks?: NflBoardPick[] }
const quoteKey = (q: Quote) => nflBoardPickKey(q[0], q[1], q[3], q[5], q[6], q[7])
const size = (value: unknown) => Buffer.byteLength(JSON.stringify(value))

/** The cache already has every quote identity. Store counts by index to keep
 * a full slate bounded without repeating the same player and market keys. */
export function packNflBoardPicks<T extends Board>(board: T, limit: number) {
  const { picks, ...data } = board
  const byQuote = new Map(board.quotes.map((quote, index) => [quoteKey(quote), index]))
  const pickCounts = nflUniqueBoardPicks(picks).flatMap((pick): PackedPick[] => {
    const index = byQuote.get(nflBoardPickKey(pick[0], pick[1], pick[2], pick[3], pick[4], pick[5]))
    return index == null ? [] : [[index, pick[6], pick[7]]]
  })
  const packed = { ...data, pickCounts }
  if (size(packed) <= limit) return packed
  const selected: PackedPick[] = []
  let remaining = limit - size({ ...data, pickCounts: selected })
  if (remaining < 0) throw new Error('Odds board exceeds limit')
  // Real counts take precedence if estimates cannot all fit in the cache.
  for (const estimated of [false, true]) for (const row of pickCounts) {
    if (row[2] !== estimated) continue
    const bytes = size(row) + Number(selected.length > 0)
    if (bytes > remaining) continue
    selected.push(row)
    remaining -= bytes
  }
  return { ...data, pickCounts: selected }
}

export function unpackNflBoardPicks(quotes: Quote[], rows: unknown): NflBoardPick[] {
  if (!Array.isArray(rows) || rows.length > quotes.length) return []
  return nflUniqueBoardPicks(rows.flatMap((row): NflBoardPick[] => {
    if (!Array.isArray(row) || row.length !== 3 || !Number.isSafeInteger(row[0]) || row[0] < 0
      || row[0] >= quotes.length || !Number.isSafeInteger(row[1]) || row[1] < 0 || row[1] > 10_000_000
      || typeof row[2] !== 'boolean') return []
    const q = quotes[row[0]]
    return [[q[0], q[1], q[3], q[5], q[6], q[7], row[1], row[2]]]
  }))
}

export function fitNflResponsePicks<T extends { picks: NflBoardPick[] }>(response: T, limit = 1024 * 1024): T {
  return size(response) > limit ? { ...response, picks: [] } : response
}
