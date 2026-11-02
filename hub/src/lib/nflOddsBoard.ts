import type { SidelineOddsBoard } from './nflOddsTypes'
import { americanImpliedProbability } from './nflMarketMath'

export type NflOddsBoardFrame = { capturedAt: string; board: SidelineOddsBoard }
export type NflOddsBoardQuote = { gameId: string; playerId: number; player: string; team: string; position: string; market: string; label: string; vendor: string; line: number; current: number; updatedAt: string; previous: number | null; previousAt: string | null }
type Candidate = Omit<NflOddsBoardQuote, 'previous' | 'previousAt'>
const date = (value: string | null | undefined) => { const n = Date.parse(value ?? ''); return Number.isFinite(n) ? n : null }
const key = (q: Candidate) => JSON.stringify([q.gameId, q.playerId, q.team, q.market, q.vendor, q.line])

export function nflOddsBoardMove(current: number | null, previous: number | null): number | null {
  const now = americanImpliedProbability(current), before = americanImpliedProbability(previous)
  return now == null || before == null ? null : (now - before) * 100
}

/** Uses only the latest frame per source for visible prices. A second frame
 * can supply a previous observation only for the identical milestone side. */
export function nflOddsBoardQuotes(gameId: string, teams: string[], cutoff: string, sources: NflOddsBoardFrame[][], now = Date.now(), carryLastSeen = false): NflOddsBoardQuote[] {
  const stop = date(cutoff)
  if (stop == null) return []
  const validTeams = new Set(teams.map(t => t.toUpperCase()))
  const current = new Map<string, Candidate[]>(), prior = new Map<string, Candidate[]>()
  for (const frames of sources) {
    const validFrames = frames.filter(f => { const t = date(f.capturedAt); return t != null && t < stop && t <= now && Array.isArray(f.board?.players) }).sort((a,b) => Date.parse(b.capturedAt)-Date.parse(a.capturedAt)).slice(0,2)
    for (const [index, frame] of validFrames.entries()) {
      const frameTime = date(frame.capturedAt)!
      const frameKeys = new Map<string, Candidate[]>()
      for (const player of frame.board.players) {
        const team = player.team?.toUpperCase()
        if (!Number.isSafeInteger(player.id) || player.id <= 0 || !team || !validTeams.has(team) || !player.name || !Array.isArray(player.markets)) continue
        for (const market of player.markets) for (const offer of market.offers ?? []) {
          const observed = date(offer.updatedAt), line = offer.line, value = offer.current?.odds
          if (offer.type !== 'milestone' || offer.isOpeningOnly || line == null || !Number.isSafeInteger(line) || line <= 0 || market.propType === 'first_td' || market.propType.startsWith('anytime_td') || market.line !== line || market.key !== `${market.propType}:${line}` || !offer.vendor || observed == null || observed > frameTime || observed >= stop || observed > now || americanImpliedProbability(value) == null) continue
          const quote: Candidate = { gameId, playerId: player.id, player: player.name, team, position: player.position ?? '', market: market.propType, label: market.label, vendor: offer.vendor, line, current: value!, updatedAt: offer.updatedAt! }
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
    result.push({ ...latest, previous: previous?.current ?? null, previousAt: previous?.updatedAt ?? null })
  }
  return result
}
