import type { PaintBoard } from './nbaPaint'
import { nbaPregameOpen } from './nbaOddsMode'

/** Open resources refresh in the background without clearing the current view.
 * Frozen resources remain tied to the exact durable observation, including
 * corrections that move the cutoff or replace an invalid historical snapshot. */
export function nbaResearchRevision(board: PaintBoard): string {
  const snapshot = board.researchSnapshot
  if (snapshot?.frozen) return `frozen:${snapshot.observedAt}`
  // A missing snapshot cannot bridge the tip boundary either. The enclosing
  // mode/game key distinguishes live from pregame; this prevents an old open
  // resource from being reused when a board becomes closed without a snapshot.
  const phase = nbaPregameOpen(board.game) ? 'open' : 'closed'
  return snapshot ? `snapshot:${phase}` : `unarchived:${phase}`
}
