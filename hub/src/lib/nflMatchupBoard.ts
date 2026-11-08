import type { SidelineOddsBoard } from './nflOddsTypes'

const aliases: Record<string, string> = { LA: 'LAR', JAC: 'JAX', WAS: 'WSH', OAK: 'LV', SD: 'LAC', STL: 'LAR' }
export const nflMatchupTeam = (value: string) => aliases[value.toUpperCase()] ?? value.toUpperCase()

/** Quarantine unrelated-team offers; never relabel a player to force a matchup. */
export function nflMatchupBoard(board: SidelineOddsBoard, away: string, home: string): SidelineOddsBoard {
  const teams = new Set([nflMatchupTeam(away), nflMatchupTeam(home)])
  return { ...board, players: board.players.filter(player => teams.has(nflMatchupTeam(player.team))) }
}
