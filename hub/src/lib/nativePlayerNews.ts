import { createHash } from 'node:crypto'
import { mlbHeadshot } from '@slipsurge/core/mlb-api'
import { getTeamColor, getTeamLogoPngUrl, getTeamSecondaryColor } from '@slipsurge/core/mlbTeamColors'
import { mlbTeamAbbrById } from '@slipsurge/core/mlbTeams'
import { canonicalNflTeam } from './nflGameCenter'
import { applePlayerPortrait, appleTeamLogo, appleTeamColor, type AppleImageArtwork } from './appleNotificationArtwork'
import { favoritePlayerSport, normalizeFavoritePlayers, normalizeFavoriteTeams, resolveFavoriteTeam, type FavoriteSport, type FavoriteTeam } from './sportFavorites'

export const playerNewsSettingsKey = 'player_news'
export type PlayerNewsType = 'injury_update' | 'roster_move'
export type PlayerNewsSource = 'nba-injuries' | 'nfl-injuries' | 'nba-transactions' | 'nfl-transactions' | 'mlb-transactions'
type Sport = FavoriteSport
type Team = { abbr: string; name: string; logo?: string; primary?: string; secondary?: string }
type Player = { name: string; id?: string; headshot?: string }
export type PlayerNews = {
  key: string; subject?: string; status?: string; kind: PlayerNewsType; sport: Sport
  reportedAt: string; team: Team; otherTeam?: Team; player?: Player; text: string
}

type ESPNTeam = { id?: unknown; abbreviation?: unknown; displayName?: unknown; color?: unknown; alternateColor?: unknown; logos?: { href?: unknown }[] }
type ESPNInjury = {
  id?: unknown; date?: unknown; status?: unknown; shortComment?: unknown
  athlete?: { displayName?: unknown; team?: ESPNTeam; headshot?: { href?: unknown }; links?: { href?: unknown }[] }
  details?: { type?: unknown; location?: unknown; detail?: unknown; side?: unknown }
}
export type ESPNInjuries = { status?: string; injuries?: { id?: unknown; injuries?: ESPNInjury[] }[] }
export type ESPNTransaction = { date?: unknown; description?: unknown; team?: ESPNTeam }
export type MLBTransaction = {
  id?: unknown; date?: unknown; effectiveDate?: unknown; typeDesc?: unknown; description?: unknown
  person?: { id?: unknown; fullName?: unknown }; fromTeam?: { id?: unknown; name?: unknown }; toTeam?: { id?: unknown; name?: unknown }
}

const statuses = new Set(['Out', 'Doubtful', 'Questionable', 'Probable', 'Day-To-Day', 'Injured Reserve', 'Injured List', 'Available', 'Active'])
const nbaLogoCode: Record<string, string> = { GSW: 'gs', NOP: 'no', NYK: 'ny', SAS: 'sa', UTA: 'utah' }
const nflLogoCode: Record<string, string> = { WSH: 'wsh' }
const eventKey = (...parts: string[]) => createHash('sha256').update(parts.join('\n')).digest('hex')
const clean = (value: unknown, length = 170) => typeof value === 'string'
  ? value.replace(/[\s\u0000-\u001f\u202a-\u202e\u2066-\u2069]+/g, ' ').trim().slice(0, length) : ''
export const newsName = (value: string) => value.toLowerCase().normalize('NFKD')
  .replace(/[^\p{L}\p{N}]/gu, '')
const id = (value: unknown) => /^\d{1,12}$/.test(String(value ?? '')) ? String(value) : undefined
const date = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(T|$)/.test(value) && Number.isFinite(Date.parse(value))
  ? new Date(value).toISOString() : null

function espnTeam(sport: 'nfl' | 'nba', value: ESPNTeam | undefined): Team | undefined {
  if (!value || typeof value.abbreviation !== 'string' || !/^[A-Z]{2,4}$/.test(value.abbreviation)) return undefined
  const original = value.abbreviation
  const abbr = sport === 'nfl' ? canonicalNflTeam(original) : ({ GS: 'GSW', NO: 'NOP', NY: 'NYK', SA: 'SAS', UTAH: 'UTA' }[original] ?? original)
  const name = clean(value.displayName, 60)
  if (!name) return undefined
  const code = (sport === 'nba' ? nbaLogoCode[abbr] : nflLogoCode[abbr]) ?? abbr.toLowerCase()
  return { abbr, name, logo: appleTeamLogo(sport, [...value.logos?.map(logo => logo.href) ?? [], `https://a.espncdn.com/i/teamlogos/${sport}/500/${code}.png`]),
    primary: appleTeamColor(value.color), secondary: appleTeamColor(value.alternateColor) }
}

function mlbTeam(value: MLBTransaction['toTeam']): Team | undefined {
  const abbr = mlbTeamAbbrById(Number(id(value?.id)))
  const name = clean(value?.name, 60)
  if (!abbr || !name) return undefined
  return { abbr, name, logo: getTeamLogoPngUrl(abbr), primary: appleTeamColor(getTeamColor(abbr)), secondary: appleTeamColor(getTeamSecondaryColor(abbr)) }
}

export function espnInjuryNews(sport: 'nfl' | 'nba', feed: ESPNInjuries): PlayerNews[] {
  if (feed.status !== 'success' || !Array.isArray(feed.injuries)) throw Error('Injury feed unavailable')
  if (!feed.injuries.every(team => id(team.id) && Array.isArray(team.injuries))) throw Error('Injury feed incomplete')
  return feed.injuries.flatMap(group => (group.injuries ?? []).flatMap(row => {
    const status = clean(row.status, 28), name = clean(row.athlete?.displayName, 75), reportedAt = date(row.date)
    const team = espnTeam(sport, row.athlete?.team)
    if (!statuses.has(status) || !name || !reportedAt || !team || id(group.id) !== id(row.athlete?.team?.id)) return []
    const headshot = applePlayerPortrait(row.athlete?.headshot?.href) ?? undefined
    const playerId = row.athlete?.links?.flatMap(link => {
      const match = typeof link.href === 'string' && new RegExp(`^https://www\\.espn\\.com/${sport}/player/(?:stats/)?_/id/(\\d+)(?:/|$)`).exec(link.href)
      return match ? [match[1]] : []
    })[0]
    if (!playerId) return []
    const subject = `${team.abbr}:${playerId}`
    const fingerprint = [status, row.details?.type, row.details?.location, row.details?.side].map(part => clean(part, 40)).join(':')
    const text = clean(row.shortComment) || `${team.name} lists ${name} as ${status.toLowerCase()}.`
    return [{ key: eventKey(sport, subject, fingerprint, reportedAt), subject, status: fingerprint,
      kind: 'injury_update' as const, sport, team, player: { name, id: playerId, headshot }, text, reportedAt }]
  })).sort((a, b) => a.reportedAt.localeCompare(b.reportedAt))
}

const rosterActions = 'Signed|Waived|Released|Claimed|Acquired|Traded|Placed|Reinstated|Activated|Elevated|Designated|Assigned|Agreed to terms with|Promoted|Recalled|Transferred'
const position = 'G|F|C|PG|SG|SF|PF|QB|RB|FB|WR|TE|OT|T|OG|OL|RT|LT|LG|RG|DL|DT|DE|NT|LB|OLB|ILB|MLB|CB|DB|SS|FS|S|K|P|PK|LS'
const person = "[\\p{Lu}][\\p{L}.'’\\-]*(?:\\s+[\\p{Lu}][\\p{L}.'’\\-]*){1,4}"
const clauseBoundary = new RegExp(`(?<=[.!?])\\s+(?=(?:${rosterActions})\\s)`, 'u')

/** The public transaction feed contains team and original copy, but no athlete IDs. */
export function espnRosterNews(sport: 'nfl' | 'nba', rows: ESPNTransaction[]): PlayerNews[] {
  return rows.flatMap(row => {
    const team = espnTeam(sport, row.team), reportedAt = date(row.date)
    const description = clean(row.description, 850)
    if (!team || !description || !reportedAt) return []
    return description.split(clauseBoundary).flatMap(clause => {
      const action = new RegExp(`^(?:${rosterActions})\\b`, 'u').exec(clause)?.[0]
      if (!action) return []
      const text = clean(clause)
      const people = [...clause.matchAll(new RegExp(`(?:^|\\s)(?:${position})\\s+(${person})`, 'gu'))]
        .map(match => match[1].replace(/\.$/, ''))
      const injured = /injured reserve|injured list|physically unable|non-football injury/i.test(clause)
      return (people.length ? [...new Set(people)] : [undefined]).map(name => ({
        key: eventKey(sport, reportedAt, team.abbr, text, name ?? ''), sport, team, reportedAt, text,
        kind: injured ? 'injury_update' as const : 'roster_move' as const,
        player: name ? { name } : undefined,
      }))
    })
  })
}

export function mlbTransactionNews(rows: MLBTransaction[]): PlayerNews[] {
  return rows.flatMap(row => {
    const key = id(row.id), playerId = id(row.person?.id), name = clean(row.person?.fullName, 75)
    const to = mlbTeam(row.toTeam), from = mlbTeam(row.fromTeam), team = to ?? from
    const reportedAt = date(row.date), text = clean(row.description)
    if (!key || !playerId || !name || !team || !reportedAt || !text) return []
    const injured = /\binjured list\b|\binjury list\b/i.test(text)
    if (!injured && !/\bsigned\b|\btraded\b|\breleased\b|\bactivated\b|\bclaimed\b|\bretired\b|\bdesignated.*for assignment\b|\bselected.*contract\b|\boptioned\b|\brecalled\b/i.test(text)) return []
    return [{ key: eventKey('mlb', key), sport: 'mlb' as const, kind: injured ? 'injury_update' as const : 'roster_move' as const,
      reportedAt, team, otherTeam: from && from.abbr !== team.abbr ? from : undefined,
      player: { name, id: playerId, headshot: mlbHeadshot(Number(playerId)) }, text }]
  })
}

export function playerNewsArtwork(item: PlayerNews): AppleImageArtwork | undefined {
  const image = item.player?.headshot ?? item.team.logo
  if (!image) return undefined
  return { version: 1, kind: 'image', image,
    ...(item.player?.headshot && item.team.logo ? { badge: item.team.logo, secondaryBadge: item.otherTeam?.logo,
      player: item.player.name, team: item.team.abbr, primary: item.team.primary, secondary: item.team.secondary } : {}) }
}

type Recipient = { favorite_teams: unknown; favorite_players: unknown; favorite_sports: unknown }
export function matchesPlayerNews(item: PlayerNews, recipient: Recipient, catalog: FavoriteTeam[]) {
  const teams = new Set([item.team.abbr, item.otherTeam?.abbr])
  const sports = Array.isArray(recipient.favorite_sports) ? recipient.favorite_sports : []
  if (normalizeFavoriteTeams(recipient.favorite_teams).some(key => {
    const team = resolveFavoriteTeam(key, catalog, sports)
    return team?.sport === item.sport && teams.has(team.abbr)
  })) return true
  const player = item.player
  if (!player) return false
  return normalizeFavoritePlayers(recipient.favorite_players).some(favorite => {
    if (favoritePlayerSport(favorite) !== item.sport) return false
    if ('mlb_id' in favorite) return String(favorite.mlb_id) === player.id
    const preferredPortrait = applePlayerPortrait(favorite.headshot)
    const itemPortrait = applePlayerPortrait(player.headshot)
    if (preferredPortrait && itemPortrait && preferredPortrait === itemPortrait) return true
    const name = newsName(favorite.name)
    return name === newsName(player.name) && (teams.has(favorite.team.toUpperCase()) ||
      catalog.some(team => team.sport === item.sport && teams.has(team.abbr) && newsName(team.name) === newsName(favorite.team)))
  })
}

export function playerNewsLink(item: PlayerNews, catalog: FavoriteTeam[]) {
  if (item.sport === 'mlb' && item.player?.id) return `/players/${item.player.id}`
  return catalog.find(team => team.sport === item.sport && team.abbr === item.team.abbr)?.href ?? `/${item.sport}/players`
}
