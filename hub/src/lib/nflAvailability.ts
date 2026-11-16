import type { NflOddsPlayer, SidelineOddsBoard } from './nflOddsTypes'
import { nflMatchupTeam } from './nflMatchupBoard'
import { normalizeNflPlayerName } from './nflPlayerName'

type PlayerStatus = Pick<NflOddsPlayer, 'availability' | 'rosterStatus'>
type RosterPlayer = PlayerStatus & Partial<Pick<NflOddsPlayer, 'gsisId' | 'lastSeason' | 'latestTeam' | 'team'>>
type MarketIdentity = Pick<NflOddsPlayer, 'name' | 'team'>
const normalize = (value: string | null | undefined) => (value ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()
const excluded = new Set(['O', 'OUT', 'IR', 'RES', 'INJURED RESERVE', 'RESERVE INJURED', 'PUP', 'RESERVE PUP', 'PHYSICALLY UNABLE TO PERFORM', 'NFI', 'RESERVE NFI', 'SUS', 'SUSPENDED', 'INACTIVE', 'INA', 'DNP', 'DID NOT PLAY'])
const noRoster = new Set(['CUT', 'RLS', 'RELEASED', 'WAIVED', 'RET', 'RETIRED', 'NWT', 'RFA', 'UFA', 'TRC', 'TRD', 'TRT'])
const practiceSquad = new Set(['DEV', 'PRACTICE SQUAD'])

function gameExclusion(availability: PlayerStatus['availability']) {
  const status = normalize(availability?.gameStatus)
  if (excluded.has(status)) return status === 'O' ? 'OUT' : status
  if (availability?.active === false) return 'INACTIVE'
  if (availability?.didNotPlay === true) return 'DNP'
  return null
}

/** The caller supplies roster evidence observed for this game's pregame board. */
function rosterMarketExclusion(player: RosterPlayer, season?: number) {
  const status = normalize(player.rosterStatus)
  if (season != null && player.lastSeason != null && player.lastSeason !== season) return null
  if (noRoster.has(status) || status === 'EXE') return status
  if (season != null && player.lastSeason === season && player.gsisId && player.team && player.latestTeam
    && nflMatchupTeam(player.team) !== nflMatchupTeam(player.latestTeam)) return 'OTHER TEAM'
  if (practiceSquad.has(status) && player.availability?.active !== true) return 'PRACTICE SQUAD'
  if (player.availability?.active !== true && excluded.has(status)) {
    return status === 'IR' ? 'INJURED RESERVE' : status === 'RES' ? 'RESERVE' : status
  }
  return null
}

export function nflMarketExclusion(player: RosterPlayer, season?: number) {
  return gameExclusion(player.availability) ?? rosterMarketExclusion(player, season)
}

export const nflMarketPlayerKey = (player: MarketIdentity) =>
  JSON.stringify([nflMatchupTeam(player.team), normalizeNflPlayerName(player.name)])

export function nflMarketExclusions(players: NflOddsPlayer[], season: number) {
  return new Set(players.filter(player => nflMarketExclusion(player, season)).map(nflMarketPlayerKey))
}

/** Keep captured quotes as evidence while removing invalid offers from the product. */
export function filterNflMarkets(board: SidelineOddsBoard, excludedPlayers: ReadonlySet<string>): SidelineOddsBoard {
  if (!excludedPlayers.size) return board
  const eligible = (player: MarketIdentity) => !excludedPlayers.has(nflMarketPlayerKey(player))
  return {
    ...board,
    players: board.players.filter(eligible),
    ...(board.lastSeen && { lastSeen: { ...board.lastSeen, offers: board.lastSeen.offers.filter(eligible) } }),
    ...(board.openingOnly && { openingOnly: { ...board.openingOnly, offers: board.openingOnly.offers.filter(eligible) } }),
  }
}

/** Game designations take precedence; today's roster must not rewrite past games. */
export function nflAvailability(player: PlayerStatus, gameday?: string, today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })) {
  const a = player.availability
  const gameStatus = gameExclusion(a)
  if (gameStatus) return { eligible: false, label: gameStatus }
  const status = normalize(a?.gameStatus)
  if (!gameday || gameday >= today) {
    const marketExclusion = rosterMarketExclusion(player)
    if (marketExclusion) return { eligible: false, label: marketExclusion }
  }
  const label = status === 'Q' ? 'QUESTIONABLE' : status === 'D' ? 'DOUBTFUL' : status
  return { eligible: true, label: label || (a?.starter ? 'STARTER' : a?.injury ? 'INJURY' : null) }
}

/** Slider moves prices, not the selected game's latest availability. */
export function withGameAvailability(frame: SidelineOddsBoard, current: SidelineOddsBoard): SidelineOddsBoard {
  const players = new Map(current.players.map(player => [player.id, player]))
  return { ...frame, players: frame.players.map(player => {
    const latest = players.get(player.id)
    return latest && latest.team === player.team
      ? { ...player, availability: latest.availability ?? player.availability, rosterStatus: latest.rosterStatus ?? player.rosterStatus }
      : player
  }) }
}
