import type { NflMarketOffer, NflPlayerMarket, SidelineOddsBoard } from './nflOddsTypes'
import { nflMatchupTeam } from './nflMatchupBoard'
import { americanImpliedProbability } from './nflMarketMath'

export type NflOddsBoardFrame = { capturedAt: string; board: SidelineOddsBoard; typedOpeningSource?: boolean }
export type NflOddsBoardQuote = { gameId: string; playerId: number; player: string; team: string; position: string; market: string; label: string; vendor: string; line: number; current: number; updatedAt: string; previous: number | null; previousAt: string | null; opening: number | null; openingConflict: boolean }
type Candidate = Omit<NflOddsBoardQuote, 'previous' | 'previousAt' | 'openingConflict'>
const date = (value: string | null | undefined) => { const n = Date.parse(value ?? ''); return Number.isFinite(n) ? n : null }
const key = (q: Candidate) => JSON.stringify([q.gameId, q.playerId, q.team, q.market, q.vendor, q.line])

export const NFL_ODDS_BOARD_SCORER_MARKETS = {
  anytime_td: 'Anytime Touchdown',
  first_td: 'First Touchdown',
} as const

/** The schedule abbreviation is the display key; accept only one exact NFL team identity. */
export function nflOddsBoardTeam(teams: readonly string[], playerTeam: string) {
  const identity = nflMatchupTeam(playerTeam)
  const matches = teams.filter(team => nflMatchupTeam(team) === identity)
  return matches.length === 1 ? matches[0] : null
}

export function nflOddsBoardScorerLabel(market: string): string | undefined {
  if (market === 'anytime_td' || market === 'first_td') return NFL_ODDS_BOARD_SCORER_MARKETS[market]
}

export function isNflOddsBoardLine(market: string, line: unknown): line is number {
  if (nflOddsBoardScorerLabel(market)) return line === 0.5
  return !market.startsWith('anytime_td') && typeof line === 'number' && Number.isSafeInteger(line) && line > 0
}

export function nflOddsBoardOfferLine(market: NflPlayerMarket, offer: NflMarketOffer): number | null {
  const { line } = offer
  if (offer.type !== 'milestone' || offer.isOpeningOnly || market.line !== line
    || (market.key !== `${market.propType}:${line ?? ''}` && !(line === null && market.key === `${market.propType}:null`))) return null
  // Older one-sided scorer records encode the same Yes outcome as 1 or no line.
  if (nflOddsBoardScorerLabel(market.propType) && (line === null || line === 1)) return 0.5
  return isNflOddsBoardLine(market.propType, line) ? line : null
}

export function nflOddsBoardMove(current: number | null, previous: number | null): number | null {
  const now = americanImpliedProbability(current), before = americanImpliedProbability(previous)
  return now == null || before == null ? null : (now - before) * 100
}

/** Uses only the latest frame per source for visible prices. A second frame
 * can supply a previous observation only for the identical outcome. */
export function nflOddsBoardQuotes(gameId: string, teams: string[], cutoff: string, sources: NflOddsBoardFrame[][], now = Date.now(), carryLastSeen = false): NflOddsBoardQuote[] {
  const stop = date(cutoff)
  if (stop == null) return []
  const current = new Map<string, Candidate[]>(), prior = new Map<string, Candidate[]>()
  for (const frames of sources) {
    const validFrames = frames.filter(f => { const t = date(f.capturedAt); return t != null && t < stop && t <= now && Array.isArray(f.board?.players) }).sort((a,b) => Date.parse(b.capturedAt)-Date.parse(a.capturedAt)).slice(0,2)
    for (const [index, frame] of validFrames.entries()) {
      const frameTime = date(frame.capturedAt)!
      const frameKeys = new Map<string, Candidate[]>()
      for (const player of frame.board.players) {
        const team = typeof player.team === 'string' ? nflOddsBoardTeam(teams, player.team) : null
        if (!Number.isSafeInteger(player.id) || player.id <= 0 || !team || !player.name || !Array.isArray(player.markets)) continue
        for (const market of player.markets) for (const offer of market.offers ?? []) {
          const observed = date(offer.updatedAt), line = nflOddsBoardOfferLine(market, offer), value = offer.current?.odds
          if (line == null || !offer.vendor || observed == null || observed > frameTime || observed >= stop || observed > now || americanImpliedProbability(value) == null) continue
          // Only base-feed history has this typed provider opening. Direct
          // sportsbook archives can synthesize opening=current and are never
          // evidence of an opening. The opening's original time is not stored.
          const rawOpening = offer.opening
          const opening = frame.typedOpeningSource && offer.openingLine === offer.line && rawOpening &&
            Object.keys(rawOpening).every(key => key === 'odds') && americanImpliedProbability(rawOpening.odds) != null
            ? rawOpening.odds! : null
          const quote: Candidate = { gameId, playerId: player.id, player: player.name, team, position: player.position ?? '', market: market.propType, label: market.label, vendor: offer.vendor, line, current: value!, updatedAt: offer.updatedAt!, opening }
          const id = key(quote); frameKeys.set(id, [...(frameKeys.get(id) ?? []), quote])
        }
      }
      for (const [id, candidates] of frameKeys) {
        if (candidates.length !== 1) continue
        const dest = index === 0 ? current : prior
        dest.set(id, [...(dest.get(id) ?? []), candidates[0]])
      }
    }
  }
  // With no verified per-contract withdrawal ledger, a missing latest panel
  // cannot delete the earlier observation. It is displayed only as Last seen.
  if(carryLastSeen)for(const [id, candidates] of prior)current.set(id,[...(current.get(id)??[]),...candidates])
  const result: NflOddsBoardQuote[] = []
  for (const [id, candidates] of current) {
    const sorted = [...candidates].sort((a,b) => Date.parse(b.updatedAt)-Date.parse(a.updatedAt))
    const latest = sorted[0], t = Date.parse(latest.updatedAt)
    if (sorted.some(q => Date.parse(q.updatedAt) === t && q.current !== latest.current)) continue
    const older = [...sorted.slice(1), ...(prior.get(id) ?? [])].filter(q => Date.parse(q.updatedAt) < t).sort((a,b) => Date.parse(b.updatedAt)-Date.parse(a.updatedAt))
    const p = older[0], pt = p && Date.parse(p.updatedAt)
    const previous = p && !older.some(q => Date.parse(q.updatedAt) === pt && q.current !== p.current) ? p : null
    const openingPrices = [...new Set([...candidates, ...(prior.get(id) ?? [])].flatMap(q => q.opening == null ? [] : [q.opening]))]
    result.push({ ...latest, opening: openingPrices.length === 1 ? openingPrices[0] : null, openingConflict: openingPrices.length > 1, previous: previous?.current ?? null, previousAt: previous?.updatedAt ?? null })
  }
  return result
}
