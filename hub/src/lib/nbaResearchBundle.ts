import 'server-only'
import { getPaintBoard } from './nbaPaintData'
import { getNbaOddsGame } from './nbaOddsClockData'
import { nbaPregameOpen, type NbaOddsMode } from './nbaOddsMode'
import type { PaintBoard } from './nbaPaint'

/** A slow secondary resource must not pair its frozen value with a board that
 * was returned earlier while the game was still open. Re-resolve the whole
 * bundle once at the boundary; all closed readers then use durable winners. */
export async function resolveNbaResearchBundle<T>(initial: PaintBoard, mode: NbaOddsMode, load: (board: PaintBoard) => Promise<T>): Promise<{ board: PaintBoard; value: T }> {
  const value = await load(initial)
  if (mode === 'live' || initial.researchSnapshot?.frozen) return { board: initial, value }
  const game = await getNbaOddsGame(initial.game)
  if (nbaPregameOpen(game)) return { board: initial, value }
  const board = await getPaintBoard(game, mode)
  return { board, value: await load(board) }
}
