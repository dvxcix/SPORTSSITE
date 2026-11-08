import type { NflOddsPlayer, SidelineOddsBoard } from './nflOddsTypes'
import { contractPicks, estimateLadderPicks } from './nflLadders'
import { isNflOddsBoardLine, nflOddsBoardOfferLine, nflOddsBoardScorerLabel } from './nflOddsBoard'
import { americanImpliedProbability } from './nflMarketMath'

export type NflBoardPick = [game: string, player: number, team: string, market: string, book: string, line: number, picks: number, estimated: boolean]
export const nflBoardPickKey = (game: string, player: number, team: string, market: string, book: string, line: number) => JSON.stringify([game, player, team, market, book, line])

/** Do not let a quote recorded after its source frame change the allocation. */
export function nflFilterPickLadder(board: SidelineOddsBoard, capturedAt: string, cutoff: string, now = Date.now()): SidelineOddsBoard | null {
  const frame = Date.parse(capturedAt), stop = Date.parse(cutoff)
  if (!Number.isFinite(frame) || !Number.isFinite(stop) || frame >= stop || frame > now || !Array.isArray(board?.players) || board.players.length > 160) return null
  let count = 0
  for (const player of board.players) {
    if (!Array.isArray(player.markets) || player.markets.length > 500) return null
    for (const market of player.markets) { if (!Array.isArray(market.offers) || market.offers.length > 32) return null; count += market.offers.length }
  }
  if (count > 4000) return null
  return { ...board, players: board.players.map(player => ({ ...player, markets: player.markets.map(market => ({ ...market, offers: market.offers.filter(offer => {
    const at = Date.parse(offer.updatedAt ?? '')
    return Number.isFinite(at) && at <= frame && at < stop && at <= now
  }) })).filter(market => market.offers.length) })) }
}

/** Cached duplicate identities are ambiguous, even if the counts agree. */
export function nflUniqueBoardPicks(value: unknown): NflBoardPick[] {
  if (!Array.isArray(value) || value.length > 96000) return []
  const rows = new Map<string, NflBoardPick>(), duplicates = new Set<string>()
  for (const row of value) {
    if (!Array.isArray(row) || row.length !== 8 || typeof row[0] !== 'string' || !Number.isSafeInteger(row[1]) || row[1] <= 0 || typeof row[2] !== 'string' || typeof row[3] !== 'string' || typeof row[4] !== 'string' || !isNflOddsBoardLine(row[3], row[5]) || !Number.isSafeInteger(row[6]) || row[6] < 0 || row[6] > 10_000_000 || typeof row[7] !== 'boolean') continue
    const key = nflBoardPickKey(row[0], row[1], row[2], row[3], row[4], row[5])
    if (rows.has(key)) duplicates.add(key)
    else rows.set(key, row as NflBoardPick)
  }
  return [...rows].filter(([key]) => !duplicates.has(key)).map(([, row]) => row)
}

/** Reuse Props' complete ladder and exact public observation. Missing or
 * ambiguous player identities and unverified/post-kickoff picks stay empty. */
export function nflOddsBoardPicks(game: string, teams: string[], board: SidelineOddsBoard, cutoff: string, now = Date.now()): NflBoardPick[] {
  const stop = Date.parse(cutoff), pickedAt = Date.parse(board.picksCapturedAt ?? '')
  if (!Number.isFinite(stop) || !Number.isFinite(pickedAt) || pickedAt >= stop || pickedAt > now || !Array.isArray(board.players) || board.players.length > 160) return []
  const validTeams = new Set(teams.map(team => team.toUpperCase())), ids = new Map<number, number>()
  for (const player of board.players) ids.set(player.id, (ids.get(player.id) ?? 0) + 1)
  const rows: NflBoardPick[] = [], seen = new Set<string>(), conflicts = new Set<string>()
  for (const player of board.players) {
    if (!Number.isSafeInteger(player.id) || player.id <= 0 || ids.get(player.id) !== 1 || typeof player.team !== 'string' || !validTeams.has(player.team.toUpperCase()) || !Array.isArray(player.markets) || player.markets.length > 500) continue
    const team = player.team.toUpperCase()
    // All inputs must be the same actual pregame pick observation. Invalid
    // sibling counts or quote times cannot silently become a partial model.
    const items = player.publicPicks ?? []
    if (!Array.isArray(items) || items.length > 500 || items.some(p => !Number.isSafeInteger(p.picks) || p.picks < 0 || p.picks > 10_000_000 || Date.parse(p.capturedAt) !== pickedAt)) continue
    const markets = player.markets.flatMap(market => {
      if (!Array.isArray(market.offers) || market.offers.length > 32 || typeof market.propType !== 'string' || typeof market.key !== 'string') return []
      const offers = market.offers.filter(offer => {
        const at = Date.parse(offer.updatedAt ?? ''), odds = offer.type === 'milestone' ? offer.current?.odds : offer.type === 'over_under' ? offer.current?.over : null
        return !offer.isOpeningOnly && Number.isFinite(at) && at < stop && at <= now && americanImpliedProbability(odds) != null
      })
      return offers.length ? [{ ...market, offers }] : []
    })
    const clean: NflOddsPlayer = { ...player, markets, publicPicks: items }
    const groups = new Map<string, { prop: string; book: string }>()
    for (const market of clean.markets) if (typeof market.propType === 'string' && Array.isArray(market.offers)) for (const offer of market.offers) if (typeof offer.vendor === 'string' && nflOddsBoardOfferLine(market, offer) != null && offer.current?.odds != null) groups.set(JSON.stringify([market.propType, offer.vendor]), { prop: market.propType, book: offer.vendor })
    for (const { prop, book } of groups.values()) {
      const exactKeys = new Set<string>(); let ambiguous = false
      for (const item of items.filter(item => item.propType === prop && item.line != null)) {
        const key = JSON.stringify([item.line, item.side, item.kind]); if (exactKeys.has(key)) ambiguous = true; else exactKeys.add(key)
      }
      if (ambiguous) continue
      const scorerLabel = nflOddsBoardScorerLabel(prop)
      const scorerPattern = prop === 'anytime_td' ? /^anytime\s+(?:td|touchdown)\s+scorer$/i : /^first\s+(?:td|touchdown)\s+scorer$/i
      // The public feed records named scorer contracts without a numeric line.
      // A generic touchdown total or conflicting duplicate is not that count.
      const namedCounts = scorerLabel ? items.filter(item =>
        item.propType === prop && item.line == null && item.side == null && item.kind == null
        && typeof item.rawMarket === 'string' && scorerPattern.test(item.rawMarket.trim())) : []
      const namedCount = namedCounts.length === 1 ? namedCounts[0].picks : null
      const estimated = scorerLabel ? null : estimateLadderPicks(clean, prop, book)
      for (const market of clean.markets.filter(item => item.propType === prop)) for (const offer of market.offers) {
        const line = nflOddsBoardOfferLine(market, offer)
        if (offer.vendor !== book || line == null) continue
        const exact = offer.line == null ? null : contractPicks(clean, prop, offer.line, 'over', 'milestone')
        const observed = exact ?? namedCount
        const value = observed ?? estimated?.get(market.key)
        if (!Number.isSafeInteger(value) || value! < 0) continue
        const key = nflBoardPickKey(game, player.id, team, prop, book, line)
        if (seen.has(key)) { conflicts.add(key); continue }
        seen.add(key); rows.push([game, player.id, team, prop, book, line, value!, observed == null])
      }
    }
  }
  return rows.filter(row => !conflicts.has(nflBoardPickKey(...row.slice(0, 6) as [string, number, string, string, string, number])))
}
