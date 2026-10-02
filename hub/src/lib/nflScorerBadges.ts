import { normalizeNflPlayerName } from './nflPlayerName'
import type { NflTouchdownEvent } from './nflTouchdownFeed'

export type ScorerIdentity = { id?: number | string; gsisId?: string | null; name: string; team: string }
const teamKey = (team: string) => ({ LA: 'LAR', JAC: 'JAX', WAS: 'WSH', OAK: 'LV', SD: 'LAC' }[team.toUpperCase()] ?? team.toUpperCase())

/** Results only. Never feed these values into pregame ranks or sample windows. */
export function nflScorerBadge(events: readonly NflTouchdownEvent[], gameId: string, player: ScorerIdentity) {
  const seen = new Set<string>()
  const matches = events.filter(event => {
    if (event.gameId !== gameId || teamKey(event.team) !== teamKey(player.team) || seen.has(event.id)) return false
    const gsis = player.gsisId ?? (typeof player.id === 'string' && player.id.startsWith('00-') ? player.id : null)
    const bdl = typeof player.id === 'number' ? player.id : null
    const match = gsis && event.playerId ? gsis === event.playerId
      : bdl != null && event.bdlPlayerId != null ? bdl === event.bdlPlayerId
      : Boolean(normalizeNflPlayerName(player.name)) && normalizeNflPlayerName(player.name) === normalizeNflPlayerName(event.playerName)
    if (match) seen.add(event.id)
    return match
  })
  return { count: matches.length, first: matches.some(event => event.isFirstTdOfGame) }
}
