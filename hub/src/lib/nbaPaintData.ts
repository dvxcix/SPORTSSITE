import 'server-only'
import { bdlHeaders } from '@/lib/balldontlie'
import { nbaDate, nbaMinutes, nbaName, nbaSample, nbaToday, type PaintBoard, type PaintGame, type PaintGameOdds, type PaintPlayer, type PaintProp, type PaintRoster, type PaintStat, type PaintTeam } from './nbaPaint'

const BASE = 'https://api.balldontlie.io'
type Page<T> = { data: T[]; meta?: { next_cursor?: number | null } }
export class PaintProviderError extends Error { constructor(public endpoint: string, public status: number) { super(`NBA data unavailable (${status})`); this.name = 'PaintProviderError' } }
async function bdl<T>(path: string, ttl = 120): Promise<Page<T>> {
  const response = await fetch(`${BASE}${path}`, { headers: bdlHeaders, next: { revalidate: ttl }, signal: AbortSignal.timeout(12_000) })
  if (!response.ok) throw new PaintProviderError(path.split('?')[0], response.status)
  const payload = await response.json()
  if (!Array.isArray(payload.data)) throw new PaintProviderError(path.split('?')[0], 502)
  return payload
}
async function pages<T>(path: string, ttl: number, limit = 24) {
  const rows: T[] = []; const cursors = new Set<number>(); let cursor: number | null = null
  for (let page = 0; page < limit; page++) {
    const result: Page<T> = await bdl<T>(`${path}${cursor == null ? '' : `&cursor=${cursor}`}`, ttl)
    rows.push(...result.data)
    const next = result.meta?.next_cursor
    if (next == null) return { rows, complete: true }
    if (cursors.has(next)) return { rows, complete: false }
    cursors.add(next); cursor = next
  }
  return { rows, complete: false }
}
const espnCode = (abbr: string) => ({ GSW: 'gs', NOP: 'no', NYK: 'ny', SAS: 'sa', UTA: 'utah' }[abbr] ?? abbr.toLowerCase())
type EspnAthlete = { fullName: string; headshot?: { href?: string }; athletes?: EspnAthlete[] }
async function artwork(abbr: string) {
  const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${espnCode(abbr)}/roster`, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(10_000) })
  if (!response.ok) throw new Error('Roster images unavailable')
  const json = await response.json() as { athletes?: EspnAthlete[]; team?: { logo?: string; color?: string } }
  const athletes = (json.athletes ?? []).flatMap(a => a.athletes ?? [a])
  // Resolve within the exact team, require one exact normalized-name match.
  const headshots = new Map<string, string | null>()
  for (const athlete of athletes) { const name = nbaName(athlete.fullName); headshots.set(name, headshots.has(name) ? null : athlete.headshot?.href ?? null) }
  return { headshots, logo: json.team?.logo ?? null }
}
export function paintTeamLogo(abbr: string) { return `https://a.espncdn.com/i/teamlogos/nba/500/${espnCode(abbr)}.png` }
export async function getPaintSchedule(requestedDate?: string) {
  const date = nbaDate(requestedDate); const start = new Date(`${date}T12:00:00Z`); const end = new Date(start); end.setUTCDate(end.getUTCDate() + 7)
  const result = await pages<PaintGame>(`/v1/games?start_date=${date}&end_date=${end.toISOString().slice(0, 10)}&season_type=regular&per_page=100`, 120, 2)
  const all = result.rows.sort((a, b) => (a.datetime ?? a.status).localeCompare(b.datetime ?? b.status))
  const selectedDate = all.some(g => g.date === date) ? date : all[0]?.date ?? date
  return { date: selectedDate, requestedDate: date, games: all.filter(g => g.date === selectedDate), days: [...new Set(all.map(g => g.date))], complete: result.complete }
}
export async function getPaintGame(id: number) {
  const response = await fetch(`${BASE}/v1/games/${id}`, { headers: bdlHeaders, cache: 'no-store', signal: AbortSignal.timeout(12_000) })
  if (!response.ok) throw new PaintProviderError('game', response.status)
  const json = await response.json(); const game = json.data ?? json
  if (game.id !== id || !game.home_team || !game.visitor_team) throw new PaintProviderError('game', 502)
  return game as PaintGame
}
export async function getPaintIdentity(id: number) {
  const response = await fetch(`${BASE}/v1/players/${id}`, { headers: bdlHeaders, next: { revalidate: 300 }, signal: AbortSignal.timeout(12_000) })
  if (!response.ok) throw new PaintProviderError('player', response.status)
  const json = await response.json(); const player = json.data ?? json
  if (player.id !== id || !player.team) throw new PaintProviderError('player', 502)
  return player as PaintRoster
}
export async function getPaintFinalStats(id: number) { return pages<PaintStat>(`/v1/stats?game_ids[]=${id}&per_page=100`, 60, 2) }
export async function getPaintProps(gameId: number, fresh = false): Promise<PaintProp[]> {
  if (!fresh) return (await bdl<PaintProp>(`/v2/odds/player_props?game_id=${gameId}`, 60)).data
  const response = await fetch(`${BASE}/v2/odds/player_props?game_id=${gameId}`, { headers: bdlHeaders, cache: 'no-store', signal: AbortSignal.timeout(12_000) })
  if (!response.ok) throw new PaintProviderError('props', response.status)
  const json = await response.json(); if (!Array.isArray(json.data)) throw new PaintProviderError('props', 502)
  return json.data
}
type Average = { player: { id: number }; stats: Record<string, number | null> }
export async function getPaintProfile(player: number, season: number) {
  const params = `season=${season}&season_type=regular&player_ids[]=${player}`
  const result = await Promise.allSettled([
    bdl<Average>(`/nba/v1/season_averages/shooting?${params}&type=by_zone`, 3600),
    bdl<Average>(`/nba/v1/season_averages/general?${params}&type=advanced`, 3600),
  ])
  return { shooting: result[0].status === 'fulfilled' ? result[0].value.data[0]?.stats ?? null : null, advanced: result[1].status === 'fulfilled' ? result[1].value.data[0]?.stats ?? null : null }
}
export async function getPaintBoard(game: PaintGame): Promise<PaintBoard> {
  const issues: string[] = []
  const historical = game.date < nbaToday()
  async function optional<T>(label: string, promise: Promise<T>, fallback: T): Promise<T> { try { return await promise } catch (error) { console.error('[ThePaint]', label, { status: error instanceof PaintProviderError ? error.status : null }); issues.push(label); return fallback } }
  const teams = [game.visitor_team, game.home_team]
  const teamQuery = teams.map(t => `team_ids[]=${t.id}`).join('&')
  const [roster, props, injuries, images, gameOdds, lineups] = await Promise.all([
    historical ? getPaintFinalStats(game.id).then(result => ({ complete: result.complete, rows: result.rows.filter(row => row.player.first_name && row.player.last_name).map(row => ({ ...row.player, team: row.team }) as PaintRoster) })) : pages<PaintRoster>(`/v1/players/active?${teamQuery}&per_page=100`, 3600, 2),
    optional('Sportsbook prices unavailable', getPaintProps(game.id), []),
    optional('Injury report unavailable', pages<{ player: { id: number }; status: string; description: string; return_date?: string }>(`/v1/player_injuries?${teamQuery}&per_page=100`, 300, 2), { rows: [], complete: false }),
    Promise.all(teams.map(t => optional('Some player images unavailable', artwork(t.abbreviation), { headshots: new Map<string, string | null>(), logo: null }))),
    optional('Game lines unavailable', bdl<PaintGameOdds>(`/v2/odds?game_ids[]=${game.id}`, 60), { data: [] }),
    optional('Starting lineups unavailable', bdl<{ player: { id: number }; starter: boolean }>(`/v1/lineups?game_ids[]=${game.id}&per_page=100`, 120), { data: [] }),
  ])
  if (!roster.complete) issues.push('Roster coverage incomplete')
  const ids = roster.rows.map(p => p.id)
  const idsQuery = ids.map(id => `player_ids[]=${id}`).join('&')
  if (!ids.length) return { game, players: [], sampleSeason: game.season, historical, sampleEnd: game.date, fetchedAt: new Date().toISOString(), issues: [...issues, 'No roster returned'], statsComplete: false }
  const averages = await optional('Season averages unavailable', bdl<Average>(`/nba/v1/season_averages/general?${idsQuery}&season=${game.season}&season_type=regular&type=base&per_page=100`, 900), { data: [] })
  const sampleSeason = averages.data.some(a => (a.stats.gp ?? 0) > 0) ? game.season : game.season - 1
  const seasonAverages = sampleSeason === game.season ? averages : await optional('Prior-season averages unavailable', bdl<Average>(`/nba/v1/season_averages/general?${idsQuery}&season=${sampleSeason}&season_type=regular&type=base&per_page=100`, 3600), { data: [] })
  const end = new Date(`${game.date}T00:00:00Z`); end.setUTCDate(end.getUTCDate() - 1)
  // No future results in any sample; previous season's regular-season logs stay separate.
  const sampleEnd = [end.toISOString().slice(0, 10), `${sampleSeason + 1}-07-01`].sort()[0]
  const sampleStart = new Date(`${sampleEnd}T12:00:00Z`); sampleStart.setUTCDate(sampleStart.getUTCDate() - 200)
  const [stats, teamStats] = await Promise.all([
    optional('Game-log data unavailable', pages<PaintStat>(`/v1/stats?${idsQuery}&seasons[]=${sampleSeason}&season_type=regular&start_date=${sampleStart.toISOString().slice(0, 10)}&end_date=${sampleEnd}&per_page=100`, 3600), { rows: [], complete: false }),
    historical ? Promise.resolve({ data: [] }) : optional('Team ratings unavailable', bdl<{ team: PaintTeam; stats: Record<string, number | null> }>(`/nba/v1/team_season_averages/general?${teamQuery}&season=${sampleSeason}&season_type=regular&type=advanced&per_page=100`, 3600), { data: [] }),
  ])
  if (!stats.complete) issues.push('Game-log coverage incomplete; rates use returned games only')
  if (!injuries.complete) issues.push('Injury coverage incomplete')
  const avgMap = new Map(seasonAverages.data.map(a => [a.player.id, a.stats]))
  const players: PaintPlayer[] = roster.rows.map(player => {
    const logs = nbaSample(stats.rows.filter(s => s.player.id === player.id && s.game.date < game.date && s.game.date <= sampleEnd && (s.game.season == null || s.game.season === sampleSeason) && s.game.postseason !== true && (s.game.status_state === 'final' || s.game.status === 'Final')), 40)
    const sampleAvg: Record<string, number | null> = {}
    for (const key of ['pts', 'reb', 'ast', 'fg3m', 'stl', 'blk', 'turnover', 'fga', 'fgm', 'fg3a', 'fta', 'ftm']) { const values = logs.map(s => (s as unknown as Record<string, number | null>)[key]).filter((v): v is number => typeof v === 'number' && Number.isFinite(v)); sampleAvg[key] = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null }
    const mins = logs.map(s => nbaMinutes(s.min)).filter((v): v is number => v != null); sampleAvg.min = mins.length ? mins.reduce((a, b) => a + b, 0) / mins.length : null
    return { ...player, headshot: images[teams.findIndex(t => t.id === player.team.id)]?.headshots.get(nbaName(`${player.first_name} ${player.last_name}`)) ?? null,
      injury: historical ? null : injuries.rows.find(i => i.player.id === player.id) ?? null, average: historical ? sampleAvg : avgMap.get(player.id) ?? sampleAvg,
      logs, props: props.filter(p => p.player_id === player.id && p.game_id === game.id && Number.isFinite(Number(p.line_value))) }
  })
  return { game, players, sampleSeason, historical, sampleEnd, fetchedAt: new Date().toISOString(), issues: [...new Set(issues)], statsComplete: stats.complete, teamStats: teamStats.data, gameOdds: gameOdds.data, starters: lineups.data.filter(p => p.starter).map(p => p.player.id) }
}
