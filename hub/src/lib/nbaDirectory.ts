import 'server-only'
import { createAdminClient } from './supabase/admin'
import { nbaSharedCache } from './nbaSharedCache'
import { artwork } from './nbaPaintData'
import { nbaCompactStat, nbaName, nbaTeamLogo, nbaToday, type PaintGame, type PaintStat } from './nbaPaint'
import { nbaPlayerName, nbaPlayerSeasons, searchNbaEntities, nbaSearchTeam, type NbaDirectory, type NbaDirectoryPlayer, type NbaDirectoryTeam, type NbaSearchPlayer } from './nbaEntities'

export async function getNbaDirectory(): Promise<NbaDirectory> {
  return (await nbaSharedCache('entity-directory:v1', 300, 3600, async () => {
    const admin = createAdminClient()
    const [teamResult, playerResult] = await Promise.all([
      admin.from('nba_teams').select('payload').order('id').limit(100),
      admin.from('nba_players').select('payload,fetched_at').gte('fetched_at', new Date(Date.now() - 48 * 3600000).toISOString()).order('id').limit(1000),
    ])
    if (teamResult.error || playerResult.error) throw new Error('NBA directory unavailable')
    const teams = (teamResult.data ?? []).map(row => row.payload as NbaDirectoryTeam).filter(team => ['East', 'West'].includes(team.conference))
    const ids = new Set(teams.map(team => team.id))
    const players = (playerResult.data ?? []).filter(row => Date.parse(row.fetched_at) >= Date.now() - 48 * 3600000)
      .map(row => row.payload as NbaDirectoryPlayer).filter(player => ids.has(player.team?.id) && player.first_name && player.last_name)
    if (!teams.length || !players.length) throw new Error('NBA directory is refreshing')
    return { teams, players }
  })).value
}

async function playerImages(abbreviation: string) {
  try { return (await nbaSharedCache(`entity-artwork:v1:${abbreviation}`, 3600, 86400, async () => Object.fromEntries((await artwork(abbreviation)).headshots))).value }
  catch { return {} as Record<string, string | null> }
}

export async function hydrateNbaPlayers(players: NbaDirectoryPlayer[]): Promise<NbaSearchPlayer[]> {
  const teams = [...new Set(players.map(player => player.team.abbreviation))]
  const images = new Map(await Promise.all(teams.map(async team => [team, await playerImages(team)] as const)))
  return players.map(player => ({ id: player.id, name: nbaPlayerName(player), position: player.position, teamId: player.team.id, teamName: player.team.full_name, teamAbbr: player.team.abbreviation, headshot: images.get(player.team.abbreviation)?.[nbaName(nbaPlayerName(player))] ?? null, teamLogo: nbaTeamLogo(player.team.abbreviation) }))
}

export async function searchNbaDirectory(query: string) {
  const matches = searchNbaEntities(await getNbaDirectory(), query)
  return { players: await hydrateNbaPlayers(matches.players), teams: matches.teams.map(nbaSearchTeam) }
}

async function nextTeamGames(team: number) {
  const result = await createAdminClient().from('nba_games').select('payload').or(`home_team_id.eq.${team},visitor_team_id.eq.${team}`).gte('game_date', nbaToday()).order('game_date').limit(12)
  if (result.error) throw new Error('NBA schedule unavailable')
  return (result.data ?? []).map(row => row.payload as PaintGame).filter(game => game.status !== 'Final' && game.status_state !== 'final').map(game => ({ ...game, date: game.date.slice(0, 10) }))
}

export async function getNbaPlayerEntity(id: number) {
  const directory = await getNbaDirectory(), player = directory.players.find(candidate => candidate.id === id)
  if (!player) return null
  const data = await nbaSharedCache(`entity-player:v1:${id}:${player.team.id}:${nbaToday()}`, 300, 3600, async () => {
    const [history, games, portraits] = await Promise.all([
      createAdminClient().from('nba_player_game_stats').select('payload').eq('player_id', id).eq('postseason', false).order('game_date', { ascending: false }).limit(500),
      nextTeamGames(player.team.id), hydrateNbaPlayers([player]),
    ])
    if (history.error) throw new Error('NBA player history unavailable')
    const logs = (history.data ?? []).map(row => nbaCompactStat(row.payload as PaintStat))
    return { logs, games, image: portraits[0]?.headshot ?? null, seasons: nbaPlayerSeasons(logs) }
  })
  return { ...data.value, player, teams: directory.teams, updatedAt: data.fetchedAt }
}

export async function getNbaTeamEntity(id: number) {
  const directory = await getNbaDirectory(), team = directory.teams.find(candidate => candidate.id === id)
  if (!team) return null
  const data = await nbaSharedCache(`entity-team:v1:${id}:${nbaToday()}`, 300, 3600, async () => {
    const [games, history, roster] = await Promise.all([
      nextTeamGames(id),
      createAdminClient().from('nba_games').select('payload').or(`home_team_id.eq.${id},visitor_team_id.eq.${id}`).eq('postseason', false).lte('game_date', nbaToday()).order('game_date', { ascending: false }).limit(180),
      hydrateNbaPlayers(directory.players.filter(player => player.team.id === id)),
    ])
    if (history.error) throw new Error('NBA team history unavailable')
    const finals = (history.data ?? []).map(row => row.payload as PaintGame).filter(game => game.status === 'Final' || game.status_state === 'final')
    const season = finals[0]?.season ?? null, seasonGames = finals.filter(game => game.season === season)
    const scored = seasonGames.filter(game => Number.isFinite(game.home_team_score) && Number.isFinite(game.visitor_team_score))
    const wins = scored.filter(game => id === game.home_team.id ? game.home_team_score > game.visitor_team_score : game.visitor_team_score > game.home_team_score).length
    const points = scored.length ? scored.reduce((sum, game) => sum + (id === game.home_team.id ? game.home_team_score : game.visitor_team_score), 0) / scored.length : null
    const allowed = scored.length ? scored.reduce((sum, game) => sum + (id === game.home_team.id ? game.visitor_team_score : game.home_team_score), 0) / scored.length : null
    return { games, recent: finals.slice(0, 10), roster, season, record: { games: scored.length, wins, losses: scored.length - wins, points, allowed } }
  })
  return { ...data.value, team, updatedAt: data.fetchedAt }
}
