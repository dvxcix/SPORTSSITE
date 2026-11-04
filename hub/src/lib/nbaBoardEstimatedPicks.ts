import { nbaPublicVerifiedVersion } from './nbaPublic'
import type { NbaPublicView } from './nbaPublicHistory'
import type { NbaBoardCell } from './nbaFullOddsBoard'

/** Public activity is recorded per player and category, never per rung or book. */
export function nbaBoardPublicTotals(frames: NbaPublicView[], gameId: number, market: string, mode:'pregame'|'live', tip:number, now=Date.now()): Map<number, number> {
  const frame = frames.at(-1)
  const observed = frame ? Date.parse(frame.captured_at) : NaN
  const inPhase = (at:number) => Number.isFinite(at) && at <= now && (mode === 'pregame' ? at < tip : at >= tip)
  if (!frame || frame.snapshot.gameId !== gameId || frame.snapshot.complete !== true || !Number.isFinite(tip) || !inPhase(observed)) return new Map()
  const result = new Map<number, number>(), ambiguous = new Set<number>()
  for (const row of frame.snapshot.rows) {
    const at=Date.parse(row.capturedAt??'')
    if (row.market !== market || !Number.isSafeInteger(row.playerId) || row.playerId <= 0 || !Number.isSafeInteger(row.picks) || row.picks < 0 || row.picks > 10_000_000 || !inPhase(at) || at > observed || !nbaPublicVerifiedVersion(row.normalizationVersion ?? frame.snapshot.normalizationVersion)) continue
    if (result.has(row.playerId)) ambiguous.add(row.playerId)
    else result.set(row.playerId, row.picks)
  }
  for (const id of ambiguous) result.delete(id)
  return result
}

/** The same assumed 60/30/10 allocation and tail decay used by Props. It is
 * an estimate for available milestones, not observed per-book/rung activity. */
export function nbaBoardEstimatedPicks(cells: NbaBoardCell[], total: number | null | undefined): Map<number, number> {
  if (!Number.isSafeInteger(total) || total! < 0 || total! > 10_000_000 || !cells.length) return new Map()
  const entries = cells.filter(cell => Number.isFinite(cell.line) && cell.line > 0 && Number.isFinite(cell.current.odds) && Math.abs(cell.current.odds) >= 100).slice().sort((a, b) => a.line - b.line)
  if (!entries.length || new Set(entries.map(entry => entry.line)).size !== entries.length) return new Map()
  const first = entries[0]
  if (entries.some(entry => entry.gameId !== first.gameId || entry.playerId !== first.playerId || entry.vendor !== first.vendor || entry.market !== first.market)) return new Map()
  const anchor = entries.reduce((best, item, index) => {
    const distance = Math.abs(Math.abs(item.current.odds) - 100), bestDistance = Math.abs(Math.abs(entries[best].current.odds) - 100)
    return distance < bestDistance ? index : best
  }, 0)
  const weights = entries.map((_, index) => index === anchor ? .6 : (index < anchor ? .3 : .1) * Math.exp(-.7 * Math.abs(index - anchor)))
  for (const indices of [entries.map((_, index) => index).filter(index => index < anchor), entries.map((_, index) => index).filter(index => index > anchor)]) {
    const sum = indices.reduce((value, index) => value + weights[index], 0), mass = indices[0] < anchor ? .3 : .1
    if (sum) indices.forEach(index => { weights[index] = weights[index] / sum * mass })
  }
  const weightTotal = weights.reduce((a, b) => a + b, 0), exact = weights.map(weight => total! * weight / weightTotal), counts = exact.map(Math.floor)
  const remaining = total! - counts.reduce((a, b) => a + b, 0)
  exact.map((value, index) => ({ index, fraction: value - counts[index] })).sort((a, b) => b.fraction - a.fraction || a.index - b.index).slice(0, remaining).forEach(({ index }) => counts[index]++)
  return new Map(entries.map((entry, index) => [entry.line, counts[index]]))
}
