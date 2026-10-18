import type { SidelineOddsBoard } from './nflOddsTypes'

const aliases: Record<string, string> = { LA: 'LAR', JAC: 'JAX', WAS: 'WSH', OAK: 'LV', SD: 'LAC', STL: 'LAR' }
const team = (value: string) => aliases[value.toUpperCase()] ?? value.toUpperCase()

/** Quarantine unrelated-team offers; never relabel a player to force a matchup. */
export function nflMatchupBoard(board: SidelineOddsBoard, away: string, home: string): SidelineOddsBoard {
  const teams = new Set([team(away), team(home)])
  return { ...board, players: board.players.filter(player => teams.has(team(player.team))) }
}
