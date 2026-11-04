import type { NflBoardPick } from './nflOddsBoardPicks'

/** Optional counts must never displace valid saved prices. */
export function fitNflGamePicks(quotes: unknown[], picks: NflBoardPick[], identities: unknown[], remaining: number) {
  let selected = picks
  let bytes = Buffer.byteLength(JSON.stringify([quotes, selected, identities]))
  if (bytes > remaining) { selected = []; bytes = Buffer.byteLength(JSON.stringify([quotes, selected, identities])) }
  return { picks: selected, bytes }
}

export function fitNflResponsePicks<T extends { picks: NflBoardPick[] }>(response: T, limit = 1024 * 1024): T {
  return Buffer.byteLength(JSON.stringify(response)) > limit ? { ...response, picks: [] } : response
}
