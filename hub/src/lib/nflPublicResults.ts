import { normalizeNflPlayerName } from './nflPlayerName'
import type { NflOddsPlayer } from './nflOddsTypes'

export type NflResultPlayer = { id: number | null; gsisId?: string | null; name: string; team: string; stats: Record<string, number | null> }
export type NflPublicResult = {
  status: string; updatedAt: string; players: NflResultPlayer[]
  firstTd: { id: number | null; gsisId: string | null; name: string; team: string } | null
  firstTdKnown: boolean
}
export type NflOutcome = { state: 'pending' | 'reached' | 'hit' | 'miss' | 'push' | 'unavailable'; actual: number | null; label: string }
export const nflResultTeam = (team: string) => ({ LA: 'LAR', JAC: 'JAX', WAS: 'WSH', OAK: 'LV', SD: 'LAC' }[team] ?? team)
export function matchesResultPlayer(player: Pick<NflOddsPlayer, 'id' | 'gsisId' | 'name' | 'team'>, row: { id: number | null; gsisId?: string | null; name: string; team: string }) {
  return nflResultTeam(player.team) === nflResultTeam(row.team) && (
    (row.id != null && player.id === row.id) || (Boolean(player.gsisId) && player.gsisId === row.gsisId) ||
    normalizeNflPlayerName(player.name) === normalizeNflPlayerName(row.name))
}
export function gradeNflPublicProp(result: NflPublicResult | null, player: NflOddsPlayer, prop: { propType: string; line?: number | null; side?: 'over' | 'under'; kind?: 'milestone' | 'over_under' }): NflOutcome {
  const unknown: NflOutcome = { state: 'unavailable', actual: null, label: 'Awaiting result' }
  if (!result || ['unknown', 'canceled', 'postponed', 'abandoned'].includes(result.status)) return unknown
  if (result.status === 'scheduled') return { state: 'pending', actual: null, label: 'Pregame' }
  const final = result.status === 'final'
  if (prop.propType === 'first_td') {
    if (!result.firstTdKnown) return { state: 'pending', actual: null, label: 'First TD pending' }
    const hit = result.firstTd != null && matchesResultPlayer(player, result.firstTd)
    return { state: hit ? 'hit' : 'miss', actual: hit ? 1 : 0, label: hit ? 'First TD ✓' : 'Not first TD' }
  }
  const rows = result.players.filter(row => matchesResultPlayer(player, row))
  if (rows.length !== 1) return unknown
  const actual = rows[0].stats[prop.propType]
  const line = prop.line ?? (prop.propType === 'anytime_td' ? 1 : null)
  if (actual == null || !Number.isFinite(actual)) return unknown
  if (line == null) return { state: 'unavailable', actual, label: final ? 'Final total · choose a ladder' : 'Live total · choose a ladder' }
  if (!Number.isFinite(line)) return unknown
  const milestone = prop.kind === 'milestone' || (prop.propType === 'anytime_td' && prop.kind !== 'over_under')
  const hit = prop.side === 'under' ? actual < line : milestone ? actual >= line : actual > line
  if (!final) return { state: hit && prop.side !== 'under' ? 'reached' : 'pending', actual, label: hit && prop.side !== 'under' ? 'Reached · live' : 'Live · pending' }
  const state = !milestone && actual === line ? 'push' : hit ? 'hit' : 'miss'
  return { state, actual, label: state === 'hit' ? 'Hit ✓' : state === 'push' ? 'Push' : 'Miss · final' }
}
