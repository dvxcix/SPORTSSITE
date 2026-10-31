import { MLB_FAVORITE_TEAMS } from '@/lib/sportFavorites'

// Older team selections can be unqualified. Match the existing resolver's
// NFL-only preference before suppressing ambiguous MLB abbreviations.
const nflAbbreviations = new Set('ARI ATL BAL BUF CAR CHI CIN CLE DAL DEN DET GB HOU IND JAX KC LAC LAR LV MIA MIN NE NO NYG NYJ PHI PIT SEA SF TB TEN WAS LA OAK SD STL'.split(' '))
const mlbAbbreviations = new Set([...MLB_FAVORITE_TEAMS.map(team => team.abbr), 'OAK'])

export function visibleFavorites<T extends { favorite_sports?: unknown; sport_preferences?: unknown; favorite_teams?: unknown; favorite_players?: unknown }>(profile: T, allowMlb: boolean): T {
  if (allowMlb) return profile
  const priorSports = Array.isArray(profile.favorite_sports) ? profile.favorite_sports : []
  const nflOnly = priorSports.includes('NFL') && !priorSports.includes('MLB')
  const sports = (value: unknown) => Array.isArray(value) ? value.filter(item => typeof item === 'string' && item.toUpperCase() !== 'MLB') : value
  return {
    ...profile,
    ...(profile.favorite_sports !== undefined ? { favorite_sports: sports(profile.favorite_sports) } : {}),
    ...(profile.sport_preferences !== undefined ? { sport_preferences: sports(profile.sport_preferences) } : {}),
    ...(Array.isArray(profile.favorite_teams) ? { favorite_teams: profile.favorite_teams.filter((key: unknown) => typeof key === 'string' && !key.startsWith('MLB:') && (key.includes(':') || !mlbAbbreviations.has(key) || nflOnly && nflAbbreviations.has(key))) } : {}),
    ...(Array.isArray(profile.favorite_players) ? { favorite_players: profile.favorite_players.filter((player: unknown) => !!player && typeof player === 'object' && ('sport' in player && (player.sport === 'nfl' || player.sport === 'nba')) && !('mlb_id' in player)) } : {}),
  }
}
