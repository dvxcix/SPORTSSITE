// Private fixture data only; production uses publicWorkspaceData's real sources.
import { games } from './nba'
import { nflGames } from './nfl'
import type { PreviewSport } from '../src/lib/publicResearchPreview'
export async function resolvePublicWorkspace(sport: PreviewSport) {
  return sport === 'nba' ? { sport, game: String(games[0].id), date: games[0].date }
    : { sport, game: nflGames[0].id, date: nflGames[0].gameday }
}
