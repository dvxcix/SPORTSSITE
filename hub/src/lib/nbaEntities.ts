import { nbaAppeared, nbaMinutes, nbaName, nbaTeamLogo, type PaintGame, type PaintRoster, type PaintStat, type PaintTeam } from './nbaPaint'

export type NbaDirectoryTeam = PaintTeam & { conference: string; division?: string }
export type NbaDirectoryPlayer = PaintRoster & { weight?: string; country?: string }
export type NbaDirectory = { teams: NbaDirectoryTeam[]; players: NbaDirectoryPlayer[] }
export type NbaSearchPlayer = { id: number; name: string; position: string; teamId: number; teamName: string; headshot: string | null; teamLogo: string | null }
export type NbaSearchTeam = { id: number; name: string; abbr: string; logo: string | null }
export type NbaSeasonSummary = { season: number; games: number; teamIds: number[]; pts: number | null; reb: number | null; ast: number | null; fg3m: number | null; stl: number | null; blk: number | null; min: number | null; fgPct: number | null; threePct: number | null }
export const nbaEntityId = (value: string) => /^\d{1,10}$/.test(value) && Number(value) > 0 ? Number(value) : null
export const nbaPlayerName = (player: Pick<PaintRoster, 'first_name' | 'last_name'>) => `${player.first_name} ${player.last_name}`.trim()

export function searchNbaEntities(directory: NbaDirectory, query: string) {
  const normalized = nbaName(query.trim().slice(0, 64))
  if (normalized.length < 2) return { players: [], teams: [] }
  const rank = (name: string) => nbaName(name) === normalized ? 0 : nbaName(name).startsWith(normalized) ? 1 : 2
  const teams = directory.teams.filter(team => nbaName(`${team.full_name} ${team.abbreviation}`).includes(normalized))
    .sort((a, b) => rank(a.full_name) - rank(b.full_name) || a.full_name.localeCompare(b.full_name)).slice(0, 5)
  const teamIds = new Set(teams.map(team => team.id))
  const players = directory.players.filter(player => nbaName(nbaPlayerName(player)).includes(normalized) || teamIds.has(player.team.id))
    .sort((a, b) => rank(nbaPlayerName(a)) - rank(nbaPlayerName(b)) || nbaPlayerName(a).localeCompare(nbaPlayerName(b))).slice(0, 8)
  return { players, teams }
}

export function nbaResearchHref(game: Pick<PaintGame, 'id' | 'date'> | null, player?: number, panel?: string, view = 'research') {
  const params = new URLSearchParams({ view })
  if (game) { params.set('date', game.date.slice(0, 10)); params.set('game', String(game.id)) }
  if (player) params.set('player', String(player))
  if (panel) params.set('panel', panel)
  return `/the-paint?${params}`
}

export function nbaPlayerSeasons(logs: PaintStat[]): NbaSeasonSummary[] {
  const unique = [...new Map(logs.map(log => [log.game.id, log])).values()]
    .filter(log => log.game.postseason !== true && (log.game.status === 'Final' || log.game.status_state === 'final') && nbaAppeared(log) && Number.isInteger(log.game.season))
  const seasons = [...new Set(unique.map(log => log.game.season!))].sort((a, b) => b - a)
  return seasons.map(season => {
    const rows = unique.filter(log => log.game.season === season)
    const mean = (get: (row: PaintStat) => number | null) => { const values = rows.map(get).filter((v): v is number => v != null && Number.isFinite(v)); return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null }
    const ratio = (made: 'fgm' | 'fg3m', attempted: 'fga' | 'fg3a') => {
      const valid = rows.filter(row => row[made] != null && row[attempted] != null)
      const attempts = valid.reduce((sum, row) => sum + row[attempted]!, 0)
      return attempts > 0 ? valid.reduce((sum, row) => sum + row[made]!, 0) / attempts : null
    }
    return { season, games: rows.length, teamIds: [...new Set(rows.map(row => row.team.id))], pts: mean(row => row.pts), reb: mean(row => row.reb), ast: mean(row => row.ast), fg3m: mean(row => row.fg3m), stl: mean(row => row.stl), blk: mean(row => row.blk), min: mean(row => nbaMinutes(row.min)), fgPct: ratio('fgm', 'fga'), threePct: ratio('fg3m', 'fg3a') }
  })
}

export function nbaSearchTeam(team: NbaDirectoryTeam): NbaSearchTeam { return { id: team.id, name: team.full_name, abbr: team.abbreviation, logo: nbaTeamLogo(team.abbreviation) } }
