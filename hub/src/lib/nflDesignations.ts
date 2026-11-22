import type { NflBdlDesignation } from './nflOdds'
import type { NflOddsPlayer, SidelineOddsBoard } from './nflOddsTypes'
import { nflMarketPlayerKey, nflStatusPlayer } from './nflAvailability'
import { nflMatchupTeam } from './nflMatchupBoard'

/** Only this game's report is passed here. Injury text and practice DNP are not game exclusions. */
export function attachNflDesignations(board: SidelineOddsBoard, rows: NflBdlDesignation[]): SidelineOddsBoard {
  const reports = new Map<string, NflBdlDesignation[]>()
  for (const row of rows) {
    if (row.game_id !== board.bdlGameId) continue
    const key = nflMarketPlayerKey({ name: `${row.player.first_name} ${row.player.last_name}`, team: row.team.abbreviation })
    reports.set(key, [...(reports.get(key) ?? []), row])
  }
  const attach = (player: NflOddsPlayer) => {
    const matches = reports.get(nflMarketPlayerKey(player)) ?? []
    const row = matches.find(item => item.player.id === player.id) ?? (matches.length === 1 ? matches[0] : null)
    if (!row) return player
    return { ...player, availability: {
      gameStatus: row.game_status ?? null, injury: row.injury ?? null, active: row.active ?? null,
      starter: row.starter ?? null, didNotPlay: row.did_not_play ?? null, updatedAt: row.updated_at ?? null,
    } }
  }
  const players = board.players.map(attach)
  const known = new Set(players.map(nflMarketPlayerKey))
  const teams = new Set(board.players.map(player => nflMatchupTeam(player.team)))
  const metadata = new Map((board.availabilityPlayers ?? []).map(player => [nflMarketPlayerKey(player), nflStatusPlayer(attach(player))]))
  for (const [key, matches] of reports) {
    if (known.has(key) || matches.length !== 1) continue
    const row = matches[0]
    if (!teams.has(nflMatchupTeam(row.team.abbreviation))) continue
    const player: NflOddsPlayer = { id: row.player.id, teamId: row.team.id, name: `${row.player.first_name} ${row.player.last_name}`,
      team: row.team.abbreviation, position: row.player.position_abbreviation ?? '', markets: [] }
    // A report-only player is visible in the secondary section, never priced/ranked.
    metadata.set(key, nflStatusPlayer(attach(player)))
  }
  return { ...board, players, availabilityPlayers: [...metadata.values()] }
}
