import { MLB_TEAMS, mlbTeamAbbrById } from '@slipsurge/core/mlbTeams'
import { getTeamLogoUrl } from '@slipsurge/core/mlbTeamColors'
import { mlbHeadshot } from '@slipsurge/core/mlb-api'

export type FavoriteSport = 'mlb' | 'nfl' | 'nba'
export type FavoritePlayer = { mlb_id: number; name: string; team: string; sport?: 'mlb' } | {
  sport: 'nfl' | 'nba'; player_id: string; name: string; team: string
  headshot?: string | null; team_logo?: string | null
}
export type FavoriteTeam = { key: string; sport: FavoriteSport; id: string; abbr: string; name: string; logo: string | null; href: string }
export const MLB_FAVORITE_TEAMS: FavoriteTeam[] = MLB_TEAMS.map(team => ({ key: `MLB:${team.abbr}`, sport: 'mlb', id: String(team.id), abbr: team.abbr, name: team.name, logo: getTeamLogoUrl(team.abbr) ?? null, href: '' }))

export function favoritePlayerSport(player: FavoritePlayer): FavoriteSport { return player.sport ?? 'mlb' }
export function favoritePlayerKey(player: FavoritePlayer) { return 'mlb_id' in player ? `mlb:${player.mlb_id}` : `${player.sport}:${player.player_id}` }
export function favoritePlayerHref(player: FavoritePlayer) { return 'mlb_id' in player ? `/players/${player.mlb_id}` : `/${player.sport}/players/${encodeURIComponent(player.player_id)}` }
export function favoritePlayerImages(player: FavoritePlayer) { return 'mlb_id' in player ? { headshot: mlbHeadshot(player.mlb_id), logo: getTeamLogoUrl(player.team) } : { headshot: player.headshot ?? null, logo: player.team_logo ?? null } }

function imageUrl(value: unknown) {
  if (typeof value !== 'string' || value.length > 2048) return null
  try { const url = new URL(value); return url.protocol === 'https:' && /(^|\.)(espncdn\.com|nba\.com|mlbstatic\.com|nfl\.com)$/.test(url.hostname) ? url.href : null } catch { return null }
}

/** Read old MLB JSON without rewriting its storage shape; other leagues carry an explicit identity. */
export function normalizeFavoritePlayers(value: unknown, allowNba = true): FavoritePlayer[] {
  if (!Array.isArray(value)) return []
  const result: FavoritePlayer[] = [], seen = new Set<string>()
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const p = item as Record<string, unknown>
    const name = typeof p.name === 'string' ? p.name.trim().slice(0, 100) : ''
    const team = typeof p.team === 'string' ? p.team.trim().slice(0, 100) : ''
    if (!name) continue
    let player: FavoritePlayer
    if (p.sport === 'nfl' || p.sport === 'nba') {
      if (p.sport === 'nba' && !allowNba) continue
      const id = String(p.player_id ?? '')
      if (p.sport === 'nba' ? !/^[1-9]\d{0,9}$/.test(id) : !/^[a-zA-Z0-9_-]{1,40}$/.test(id)) continue
      player = { sport: p.sport, player_id: id, name, team, headshot: imageUrl(p.headshot), team_logo: imageUrl(p.team_logo) }
    } else {
      const id = Number(p.mlb_id)
      if (p.sport && p.sport !== 'mlb' || !Number.isSafeInteger(id) || id <= 0) continue
      player = { mlb_id: id, name, team }
    }
    const key = favoritePlayerKey(player)
    if (!seen.has(key)) { result.push(player); seen.add(key) }
    if (result.length === 8) break
  }
  return result
}

export function normalizeFavoriteTeams(value: unknown, allowNba = true) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((v): v is string => typeof v === 'string').map(v => v.trim()).filter(v => /^[A-Z]{2,4}$/.test(v) || /^(MLB|NFL):[A-Z]{2,4}$/.test(v) || allowNba && /^NBA:[1-9]\d{0,9}$/.test(v)))].slice(0, 96)
}

/** Older editors stored both leagues as bare abbreviations. Preserve those values until the owner changes them. */
export function resolveFavoriteTeam(key: string, catalog: FavoriteTeam[], sports: string[] = []) {
  const exact = catalog.find(team => team.key === key)
  const nflAbbr = ({ LA: 'LAR', OAK: 'LV', SD: 'LAC', STL: 'LAR' } as Record<string, string>)[key.replace(/^NFL:/, '')] ?? key.replace(/^NFL:/, '')
  const nfl = catalog.find(team => team.sport === 'nfl' && team.abbr === nflAbbr)
  if (key.includes(':')) return exact ?? (key.startsWith('NFL:') ? nfl : undefined)
  if (sports.includes('NFL') && !sports.includes('MLB') && nfl) return nfl
  return catalog.find(team => team.sport === 'mlb' && (team.abbr === key || key === 'OAK' && team.abbr === 'ATH')) ?? nfl
}

export function favoriteTeamSelected(team: FavoriteTeam, keys: string[], catalog: FavoriteTeam[], sports: string[] = []) {
  return keys.some(key => resolveFavoriteTeam(key, catalog, sports)?.key === team.key)
}

export function toggleFavoriteTeam(team: FavoriteTeam, keys: string[], catalog: FavoriteTeam[], sports: string[] = []) {
  return favoriteTeamSelected(team, keys, catalog, sports)
    ? keys.filter(key => resolveFavoriteTeam(key, catalog, sports)?.key !== team.key)
    : [...keys, team.key]
}

export function favoriteSearchPlayers(sport: FavoriteSport, value: unknown): FavoritePlayer[] {
  if (!Array.isArray(value)) return []
  return normalizeFavoritePlayers(value.filter(p => p && typeof p === 'object').map((p: Record<string, unknown>) => sport === 'mlb'
    ? { mlb_id: p.mlbId, name: p.name, team: mlbTeamAbbrById(p.teamId as number | null) ?? p.teamName ?? '' }
    : sport === 'nfl'
      ? { sport, player_id: p.gsis_id, name: p.display_name, team: p.latest_team ?? '', headshot: p.headshot, team_logo: p.team_logo_espn }
      : { sport, player_id: p.id, name: p.name, team: p.teamName ?? '', headshot: p.headshot, team_logo: p.teamLogo }))
}

/** NBA choices stay stored when a member edits their other favorites, but cannot be newly added. */
export function favoriteUpdates(input: { teams?: unknown; players?: unknown }, existing: { favorite_teams?: unknown; favorite_players?: unknown }, allowNba: boolean) {
  const previousPlayers = normalizeFavoritePlayers(existing.favorite_players)
  const previousTeams = normalizeFavoriteTeams(existing.favorite_teams)
  return {
    ...(input.teams !== undefined ? { favorite_teams: normalizeFavoriteTeams([...normalizeFavoriteTeams(input.teams, allowNba), ...(!allowNba ? previousTeams.filter(key => key.startsWith('NBA:')) : [])]) } : {}),
    ...(input.players !== undefined ? { favorite_players: normalizeFavoritePlayers([...(!allowNba ? previousPlayers.filter(p => favoritePlayerSport(p) === 'nba') : []), ...normalizeFavoritePlayers(input.players, allowNba)]) } : {}),
  }
}
