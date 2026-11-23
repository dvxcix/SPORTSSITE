import 'server-only'
import { AsyncLocalStorage } from 'node:async_hooks'
import type { PreviewSport } from './publicResearchPreview'
import type { NbaOddsBoardPhase } from './nbaOddsBoardPhase'

export type PublicWorkspaceScope = { sport: PreviewSport; game: string; date: string }
const requests = new AsyncLocalStorage<PublicWorkspaceScope>()

/** Set only by the server-owned preview page and its read-only dispatcher.
 * A browser flag, cookie, query or header never creates this access context. */
export function withPublicWorkspace<T>(scope: PublicWorkspaceScope, work: () => T): T {
  return requests.run(Object.freeze({ ...scope }), work)
}
export function publicWorkspaceScope(sport?: PreviewSport) {
  const scope = requests.getStore()
  return scope && (!sport || scope.sport === sport) ? scope : undefined
}
export function publicWorkspaceGames<T extends { id: string | number }>(games: T[], sport: PreviewSport): T[] {
  const scope = publicWorkspaceScope(sport)
  return scope ? games.filter(game => String(game.id) === scope.game) : games
}
export function publicWorkspacePhase(phase: NbaOddsBoardPhase): NbaOddsBoardPhase {
  const scope = publicWorkspaceScope('nba')
  return scope ? { ...phase, signature: phase.signature.split(';').filter(row => row.split(',')[0] === scope.game).join(';') } : phase
}
