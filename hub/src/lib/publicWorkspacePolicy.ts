import type { PreviewSport } from './publicResearchPreview'

export const PUBLIC_WORKSPACE_RESOURCES = {
  nba: ['/the-paint/board','/the-paint/profile','/the-paint/shots','/the-paint/scouting','/the-paint/tracking','/the-paint/history','/the-paint/public','/the-paint/results','/the-paint/game-overview','/the-paint/lineups','/the-paint/first-basket','/the-paint/first-basket/odds','/the-paint/odds-board','/the-paint/final-results','/the-paint/schedule','/the-paint/intelligence','/the-paint/divergence','/the-paint/estimate'],
  nfl: ['/the-sideline/market','/the-sideline/game-overview','/api/the-sideline/odds-board'],
} as const

/** The server supplies scope, never the visitor. The only historical-game
 * exception is a shot sample anchored to the featured researchGame; the real
 * shot handler verifies its player and game against that board's saved logs. */
export function publicWorkspaceRequest(sport: PreviewSport, scope: { game: string; date: string }, input: URLSearchParams) {
  const resource = input.get('resource')
  if (!resource || !(PUBLIC_WORKSPACE_RESOURCES[sport] as readonly string[]).includes(resource) || input.toString().length > 4096 || [...input].length > 32) return null
  const query = new URLSearchParams(input)
  for (const key of new Set(query.keys())) if (query.getAll(key).length !== 1) return null
  query.delete('resource')
  for (const key of ['date','slate_date']) if (query.has(key) && query.get(key) !== scope.date) return null
  const shots = sport === 'nba' && resource === '/the-paint/shots'
  if (query.has('researchGame') && (!shots || query.get('researchGame') !== scope.game)) return null
  for (const key of ['game','game_id','gameId']) {
    if (query.has(key) && query.get(key) !== scope.game && !(shots && key === 'game' && query.get('researchGame') === scope.game && /^[1-9]\d{0,9}$/.test(query.get(key)!))) return null
  }
  if (!query.has('game')) query.set('game', scope.game)
  if (!query.has('date')) query.set('date', scope.date)
  return { resource, query }
}
