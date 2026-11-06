import type { NbaOddsMode } from './nbaOddsMode'
import { nbaGameStart, nbaPregameOpen } from './nbaOddsMode'
import type { PaintGame } from './nbaPaint'
import { nbaTimestampNanoseconds } from './nbaFullOddsBoard'

type Scope = { game: PaintGame; capturedAt: string | null; fingerprint?: string | null }
type Receipt = { key: string; payload: unknown; fetched_at: string | null }

/** Receipt failures are a warning only: a failed game-odds sibling can also
 * produce one. They never replace or modify any price or opening. */
export function nbaBoardCaptureWarnings(scopes: Scope[], mode: NbaOddsMode, receipts: Receipt[] | null, now: number): number[] {
  // The existing phase proof cannot distinguish Live from Final. Do not
  // attach mutable receipt state to Live boards until that proof is extended.
  if(mode!=='pregame')return []
  return scopes.filter(({game,capturedAt,fingerprint}) => {
    const tip = nbaGameStart(game)
    if (!nbaPregameOpen(game, now) || tip == null || !capturedAt) return false
    // If the verification read itself fails, do not imply that the last
    // completed player-price frame was freshly checked.
    if (receipts === null) return true
    const matches = receipts.filter(row => row.key === `market-attempt:v4:${mode}:${game.id}`)
    if (matches.length !== 1) return true
    const row = matches[0], at = nbaTimestampNanoseconds(row.fetched_at ?? '')
    const payload = row.payload && typeof row.payload === 'object' ? row.payload as {status?: unknown;playerFingerprint?: unknown;playerObservedAt?: unknown} : null
    // A newer direct-book panel can make the merged frame look newer than a
    // failed whole-feed capture. Only the failed receipt tells us that the
    // complete board may not reflect all recent prices.
    if (at == null || at > BigInt(now) * BigInt(1_000_000) || at >= BigInt(tip) * BigInt(1_000_000)) return true
    if (payload?.status !== 'captured' && payload?.status !== 'unchanged') return true
    // Game lines can succeed while player props are deferred. Only a bounded
    // player-specific confirmation can support a healthy receipt.
    const playerAt=typeof payload.playerObservedAt==='string'?nbaTimestampNanoseconds(payload.playerObservedAt):null
    const frameAt=nbaTimestampNanoseconds(capturedAt)
    return typeof payload.playerFingerprint!=='string' || !/^[a-f0-9]{64}$/.test(payload.playerFingerprint)
      || fingerprint!==payload.playerFingerprint || frameAt==null || frameAt>at || playerAt==null || playerAt>at
      || playerAt>=BigInt(tip)*BigInt(1_000_000)
  }).map(({game}) => game.id)
}
