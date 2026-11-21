import type { PaintGame } from './nbaPaint'
import { nbaGameStart, type NbaOddsMode } from './nbaOddsMode'

export const NBA_LINEUP_SLOTS = ['PG', 'SG', 'SF', 'PF', 'C'] as const
export type NbaLineupPlayer = { id: number; firstName: string; lastName: string; position: string | null }
export type NbaLineupTeam = { teamId: number; status: 'expected' | 'confirmed' | 'actual'; source: 'pregame' | 'game'; sourceId: number | null; observedAt: string; players: NbaLineupPlayer[] }
export type NbaGameLineups = { gameId: number; mode: NbaOddsMode; cutoffAt: string; checkedAt: string; teams: NbaLineupTeam[]; unavailable: boolean }

const object = (value: unknown): Record<string, unknown> | null => !!value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
const id = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0
const name = (value: unknown) => typeof value === 'string' && value.trim().length > 0 && value.length <= 100 ? value.trim() : null
const allowedTeams = (game: PaintGame) => [game.visitor_team.id, game.home_team.id]

/** This source retains its final pre-tip record. Validate its original update
 * time; a post-tip retrieval is never presented as a new pregame capture. */
export function nbaPregameLineups(rows: unknown, game: PaintGame, now: number): NbaLineupTeam[] {
  const cutoff = nbaGameStart(game)
  if (!Array.isArray(rows) || rows.length > 100 || cutoff == null || !Number.isFinite(now)) return []
  const candidates: NbaLineupTeam[] = []
  for (const value of rows) {
    const row = object(value), at = typeof row?.updated_at === 'string' ? Date.parse(row.updated_at) : NaN
    if (!row || !id(row.id) || row.game_id !== game.id || !id(row.team_id) || !allowedTeams(game).includes(row.team_id)
      || !['expected', 'confirmed'].includes(String(row.status)) || !Number.isFinite(at) || at >= cutoff || at > now
      || !Array.isArray(row.lineup) || row.lineup.length !== 5) continue
    const players = row.lineup.flatMap(value => {
      const slot = object(value), player = object(slot?.player), first = name(player?.first_name), last = name(player?.last_name)
      return player && id(player.id) && first && last && NBA_LINEUP_SLOTS.includes(slot?.position as typeof NBA_LINEUP_SLOTS[number])
        ? [{ id: player.id, firstName: first, lastName: last, position: slot!.position as string }] : []
    })
    if (players.length !== 5 || new Set(players.map(player => player.id)).size !== 5 || new Set(players.map(player => player.position)).size !== 5) continue
    players.sort((a, b) => NBA_LINEUP_SLOTS.indexOf(a.position as typeof NBA_LINEUP_SLOTS[number]) - NBA_LINEUP_SLOTS.indexOf(b.position as typeof NBA_LINEUP_SLOTS[number]))
    candidates.push({ teamId: row.team_id, status: row.status as 'expected' | 'confirmed', source: 'pregame', sourceId: row.id, observedAt: new Date(at).toISOString(), players })
  }
  return allowedTeams(game).flatMap(teamId => {
    const team = candidates.filter(row => row.teamId === teamId).sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt))
    const latest = team[0]
    if (!latest || team.some(row => row.observedAt === latest.observedAt && JSON.stringify(row) !== JSON.stringify(latest))) return []
    return [latest]
  })
}

/** Actual game positions come from each lineup row, never the career profile. */
export function nbaActualLineups(rows: unknown, game: PaintGame, now: number): NbaLineupTeam[] {
  if (!Array.isArray(rows) || rows.length > 100 || nbaGameStart(game) == null || now < nbaGameStart(game)!) return []
  return allowedTeams(game).flatMap(teamId => {
    const players = rows.flatMap(value => {
      const row = object(value), player = object(row?.player), team = object(row?.team), first = name(player?.first_name), last = name(player?.last_name)
      if (!row || row.game_id !== game.id || row.starter !== true || team?.id !== teamId || !player || !id(player.id) || !first || !last) return []
      const position = typeof row.position === 'string' && /^(PG|SG|SF|PF|C|G|F|G-F|F-G|F-C|C-F)$/.test(row.position) ? row.position : null
      return [{ id: player.id, firstName: first, lastName: last, position }]
    })
    if (players.length !== 5 || new Set(players.map(player => player.id)).size !== 5) return []
    return [{ teamId, status: 'actual' as const, source: 'game' as const, sourceId: null, observedAt: new Date(now).toISOString(), players }]
  })
}

export function nbaArchivedLineup(value: unknown, game: PaintGame, teamId: number, now: number): NbaLineupTeam | null {
  const row = object(value), payload = object(row?.payload), cutoff = nbaGameStart(game), storedCutoff = typeof row?.cutoff_at === 'string' ? Date.parse(row.cutoff_at) : NaN
  if (!payload || cutoff == null || !Number.isFinite(storedCutoff) || row?.game_id !== game.id || row.team_id !== teamId) return null
  const scopedGame = { ...game, datetime: new Date(Math.min(cutoff, storedCutoff)).toISOString() }
  return nbaPregameLineups([payload], scopedGame, now).find(team => team.teamId === teamId && typeof row.source_updated_at === 'string' && Date.parse(team.observedAt) === Date.parse(row.source_updated_at)) ?? null
}
