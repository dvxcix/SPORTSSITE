import type { PaintBoard } from './nbaPaint'

/** Keep resource state tied to the displayed research observation. The freeze
 * transition changes the key even when the final observation time is unchanged. */
export function nbaResearchRevision(board: PaintBoard): string {
  const snapshot = board.researchSnapshot
  return snapshot ? `${snapshot.observedAt}:${snapshot.frozen ? 'frozen' : 'open'}` : board.fetchedAt ?? ''
}
