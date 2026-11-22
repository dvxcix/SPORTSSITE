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

const statusLabels: Record<string, string> = {
  O: 'Out', OUT: 'Out', IR: 'Injured reserve', RES: 'Reserve', 'INJURED RESERVE': 'Injured reserve',
  'RESERVE INJURED': 'Injured reserve', PUP: 'Physically unable to perform', 'RESERVE PUP': 'Physically unable to perform',
  NFI: 'Non-football injury', 'RESERVE NFI': 'Non-football injury', SUS: 'Suspended', SUSPENDED: 'Suspended',
  INA: 'Inactive', INACTIVE: 'Inactive', DNP: 'Did not play', 'DID NOT PLAY': 'Did not play',
  Q: 'Questionable', QUESTIONABLE: 'Questionable', D: 'Doubtful', DOUBTFUL: 'Doubtful',
  CUT: 'Released', RLS: 'Released', NWT: 'Not with team', EXE: 'Exempt',
  'OTHER TEAM': 'Other team', 'PRACTICE SQUAD': 'Practice squad',
}
const statusLabel = (status: string) => statusLabels[status] ?? status.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())

/** No market, public-pick or baseline payload can escape through status metadata. */
export function nflStatusPlayer(player: NflOddsPlayer): NflOddsPlayer {
  return { id: player.id, teamId: player.teamId, name: player.name, team: player.team, position: player.position,
    gsisId: player.gsisId, headshot: player.headshot, headshotFallbacks: player.headshotFallbacks, jersey: player.jersey,
    rookieSeason: player.rookieSeason, lastSeason: player.lastSeason, latestTeam: player.latestTeam,
    rosterStatus: player.rosterStatus, availability: player.availability, markets: [] }
}

export function nflHasCurrentMarket(player: NflOddsPlayer | null | undefined, propType?: string) {
  return Boolean(player?.markets.some(market => (!propType || market.propType === propType) && market.offers.some(offer =>
    !offer.isOpeningOnly && [offer.current?.odds, offer.current?.over, offer.current?.under]
      .some(value => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) >= 100))))
}

/** A failed refresh cannot renew an older report's authority. Frozen games are checked at capture, not today. */
export function nflAvailabilityIsFresh(board: SidelineOddsBoard, now = Date.now()) {
  const observed = Date.parse(board.availabilityObservedAt ?? '')
  return Number.isFinite(observed) && observed <= now && now - observed < 90_000
}

export function withoutNflCurrentMarkets(board: SidelineOddsBoard): SidelineOddsBoard {
  return { ...board, status: 'unavailable', availabilityStale: true,
    availabilityPlayers: [...board.players, ...(board.availabilityPlayers ?? [])].map(nflStatusPlayer),
    players: [], lastSeen: undefined, openingOnly: undefined }
}

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
    availabilityPlayers: [...new Map([...(board.availabilityPlayers ?? []), ...board.players.filter(player => !eligible(player))]
      .map(player => [nflMarketPlayerKey(player), nflStatusPlayer(player)])).values()],
    ...(board.lastSeen && { lastSeen: { ...board.lastSeen, offers: board.lastSeen.offers.filter(eligible) } }),
    ...(board.openingOnly && { openingOnly: { ...board.openingOnly, offers: board.openingOnly.offers.filter(eligible) } }),
  }
}

/** Game designations take precedence; today's roster must not rewrite past games. */
export function nflAvailability(player: PlayerStatus, gameday?: string, today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })) {
  const a = player.availability
  const gameStatus = gameExclusion(a)
  if (gameStatus) return { eligible: false, label: statusLabel(gameStatus) }
  const status = normalize(a?.gameStatus)
  if (!gameday || gameday >= today) {
    const marketExclusion = rosterMarketExclusion(player)
    if (marketExclusion) return { eligible: false, label: statusLabel(marketExclusion) }
  }
  const label = a?.active === true ? 'Active' : status ? statusLabel(status) : a?.injury ? 'Status unconfirmed' : a?.starter ? 'Starter' : null
  return { eligible: true, label }
}

/** Slider moves prices, not the selected game's latest availability. */
export function withGameAvailability(frame: SidelineOddsBoard, current: SidelineOddsBoard): SidelineOddsBoard {
  const players = new Map([...(current.availabilityPlayers ?? []), ...current.players].map(player => [nflMarketPlayerKey(player), player]))
  const merged = { ...frame, availabilityPlayers: current.availabilityPlayers,
    availabilityObservedAt: current.availabilityObservedAt, availabilityCutoffAt: current.availabilityCutoffAt,
    availabilityStale: current.availabilityStale, players: frame.players.map(player => {
    const latest = players.get(nflMarketPlayerKey(player))
    return latest && latest.team === player.team
      ? { ...player, availability: latest.availability ?? player.availability, rosterStatus: latest.rosterStatus ?? player.rosterStatus }
      : player
  }) }
  // A historical price frame cannot resurrect a player withdrawn for this game.
  return filterNflMarkets(merged, new Set([...players.values()].filter(player => nflMarketExclusion(player)).map(nflMarketPlayerKey)))
}
