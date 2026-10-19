import 'server-only'
import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { nbaTeamLogo } from '@/lib/nbaPaint'
import { MLB_FAVORITE_TEAMS, type FavoriteTeam } from '@/lib/sportFavorites'

const nflTeams = unstable_cache(async (): Promise<FavoriteTeam[]> => {
  const { data, error } = await createAdminClient().from('nfl_teams').select('team_abbr,team_name,team_logo_espn').order('team_name')
  if (error) throw new Error('Team directory unavailable')
  return (data ?? []).filter(team => !['LA', 'OAK', 'SD', 'STL'].includes(team.team_abbr)).map(team => ({ key: `NFL:${team.team_abbr}`, sport: 'nfl', id: team.team_abbr, abbr: team.team_abbr, name: team.team_name, logo: team.team_logo_espn, href: `/nfl/teams/${team.team_abbr}` }))
}, ['favorite-nfl-teams-v1'], { revalidate: 3600 })

const nbaTeams = unstable_cache(async (): Promise<FavoriteTeam[]> => {
  const { data, error } = await createAdminClient().from('nba_teams').select('id,payload')
  if (error) throw new Error('Team directory unavailable')
  return (data ?? []).flatMap(({ id, payload }) => {
    const team = payload as { conference?: string; abbreviation?: string; full_name?: string }
    if (!['East', 'West'].includes(team.conference ?? '') || !team.abbreviation || !team.full_name) return []
    return [{ key: `NBA:${id}`, sport: 'nba' as const, id: String(id), abbr: team.abbreviation, name: team.full_name, logo: nbaTeamLogo(team.abbreviation), href: `/nba/teams/${id}` }]
  }).sort((a, b) => a.name.localeCompare(b.name))
}, ['favorite-nba-teams-v1'], { revalidate: 3600 })

export async function getFavoriteCatalog(allowNba: boolean) {
  const [nfl, nba] = await Promise.all([nflTeams(), allowNba ? nbaTeams() : Promise.resolve([])])
  return [...MLB_FAVORITE_TEAMS, ...nfl, ...nba]
}
