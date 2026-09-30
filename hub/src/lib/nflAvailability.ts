import type { NflOddsPlayer, SidelineOddsBoard } from './nflOddsTypes'

type PlayerStatus = Pick<NflOddsPlayer, 'availability' | 'rosterStatus'>
const normalize = (value: string | null | undefined) => (value ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()
const excluded = new Set(['O', 'OUT', 'IR', 'RES', 'INJURED RESERVE', 'RESERVE INJURED', 'PUP', 'RESERVE PUP', 'PHYSICALLY UNABLE TO PERFORM', 'NFI', 'RESERVE NFI', 'SUS', 'SUSPENDED', 'INACTIVE', 'INA', 'DNP', 'DID NOT PLAY'])

/** Game designations take precedence; today's roster must not rewrite past games. */
export function nflAvailability(player: PlayerStatus, gameday?: string, today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })) {
  const a = player.availability
  const status = normalize(a?.gameStatus)
  if (excluded.has(status)) return { eligible: false, label: status === 'O' ? 'OUT' : status }
  if (a?.active === false) return { eligible: false, label: 'INACTIVE' }
  if (a?.didNotPlay === true) return { eligible: false, label: 'DNP' }
  const roster = normalize(player.rosterStatus)
  if ((!gameday || gameday >= today) && a?.active !== true && excluded.has(roster)) {
    return { eligible: false, label: roster === 'IR' ? 'INJURED RESERVE' : roster === 'RES' ? 'RESERVE' : roster }
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
