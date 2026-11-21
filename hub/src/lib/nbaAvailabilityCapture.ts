import 'server-only'
import { getPaintMarketRoster } from './nbaPaintData'
import { getNbaGameLineups } from './nbaLineupsData'
import { nbaLiveOpen, nbaPregameOpen, type NbaOddsMode } from './nbaOddsMode'
import type { PaintGame } from './nbaPaint'

/** Warm the validated member sources without requiring anyone to open Teams.
 * Original lineup source times remain unchanged. */
export async function captureNbaAvailability(game: PaintGame, mode: NbaOddsMode) {
  const active = () => mode === 'pregame' ? nbaPregameOpen(game) : nbaLiveOpen(game)
  const empty = { gameId: game.id, mode, marketPlayers: null as number | null, expected: 0, confirmed: 0, actual: 0, pendingTeams: 2 }
  if (!active()) return { ...empty, status: 'deferred' as const }
  const [roster, lineups] = await Promise.allSettled([getPaintMarketRoster(game), getNbaGameLineups(game, mode)])
  if (!active()) return { ...empty, status: 'deferred' as const }
  const teams = lineups.status === 'fulfilled' ? lineups.value.teams : []
  return {
    ...empty,
    status: roster.status === 'rejected' || lineups.status === 'rejected' || lineups.value.unavailable ? 'unavailable' as const : 'verified' as const,
    marketPlayers: roster.status === 'fulfilled' ? roster.value.length : null,
    expected: teams.filter(team => team.status === 'expected').length,
    confirmed: teams.filter(team => team.status === 'confirmed').length,
    actual: teams.filter(team => team.status === 'actual').length,
    pendingTeams: 2 - teams.length,
  }
}
