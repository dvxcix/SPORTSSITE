import type { ESPNPlay, ESPNSummary } from '@slipsurge/core/espn-api'
import { getTeamColor, getTeamLogoPngUrl, getTeamSecondaryColor } from '@slipsurge/core/mlbTeamColors'
import { nativeNotificationArtwork } from './nativeNotificationArtwork'

const artVersion = 1 as const
type Team = { id?: string; logos?: { href?: string }[] } & ESPNSummary['header']['competitions'][number]['competitors'][number]['team']
type Sport = 'nfl' | 'nba' | 'mlb'
type Player = { name: string; image: string; team?: string }
type Side = { abbreviation: string; score: number; logo?: string; primary?: string; secondary?: string }
export type AppleImageArtwork = { version: 1; kind: 'image' | 'profile'; image: string }
export type AppleGameArtwork = {
  version: 1; kind: 'game'; away: Side; home: Side; portrait?: string;
  player?: string; portraitSide?: 'away' | 'home';
}

function assetUrl(source: unknown) {
  if (typeof source !== 'string' || source.length > 600) return null
  try {
    const url = new URL(source)
    if (url.protocol !== 'https:' || url.port || url.username || url.password || url.pathname.includes('..')) return null
    return url
  } catch {
    return null
  }
}

export function applePlayerPortrait(source: unknown) {
  const url = assetUrl(source)
  if (!url) return null
  // The headshot itself identifies the athlete. Drop provider transform parameters.
  url.search = ''
  url.hash = ''
  // The NFL CDN's full-size PNGs can exceed the service extension's budget.
  if (url.hostname === 'static.www.nfl.com' && /^\/image\/upload\/[A-Za-z0-9_.,/-]+\/league\/[\w-]+$/.test(url.pathname)) {
    url.pathname = url.pathname.replace('/league/', '/c_limit,w_480,h_480/league/')
  }
  return nativeNotificationArtwork('pick_result', null, url.href)
}

export function appleProfileAvatar(source: unknown) {
  const url = assetUrl(source)
  if (!url || url.hash) return null
  const path = url.pathname
  if (url.hostname === 'hkldweedwnxartkfhror.supabase.co' &&
      /^\/storage\/v1\/object\/public\/media\/avatars\/[\da-f-]{36}\/[\da-f-]{36}\.(?:png|jpe?g|webp|gif|avif)$/i.test(path) && !url.search) return url.href
  if (url.hostname === 'cdn.discordapp.com' &&
      /^\/avatars\/\d+\/(?:a_)?[\da-f]+\.(?:png|jpe?g|webp|gif)$/i.test(path) &&
      (!url.search || /^\?size=\d+$/.test(url.search))) {
    url.search = ''
    return url.href
  }
  if (url.hostname === 'pbs.twimg.com' &&
      /^\/profile_images\/\d+\/[\w-]+\.(?:png|jpe?g|webp|gif)$/i.test(path) && !url.search) return url.href
  return null
}

function teamSide(sport: Sport, team: Team, score: number, abbreviation: string): Side {
  const logoPath = new RegExp(`^/i/teamlogos/${sport}/500(?:-dark)?/(?:scoreboard/)?[a-z0-9_-]+\\.png$`)
  const source = (sport === 'mlb' ? [getTeamLogoPngUrl(abbreviation)] : [team.logo, ...team.logos?.map(logo => logo.href) ?? []])
    .map(assetUrl).find(url => url?.hostname === 'a.espncdn.com' && logoPath.test(url.pathname))
  const logo = source ? source.origin + source.pathname : undefined
  const color = (value: string | undefined) => /^#?[\da-f]{6}$/i.test(value ?? '') ? value?.replace(/^#/, '') : undefined
  const primary = color(sport === 'mlb' ? getTeamColor(abbreviation) : team.color)
  const secondary = color(sport === 'mlb' ? getTeamSecondaryColor(abbreviation) : team.alternateColor)
  return { abbreviation, score, logo, primary, secondary }
}

export function appleGameArtwork(
  sport: Sport, away: Team, home: Team, awayAbbr: string, homeAbbr: string,
  awayScore: number, homeScore: number, featured?: Player,
): AppleGameArtwork | undefined {
  const awaySide = teamSide(sport, away, awayScore, awayAbbr), homeSide = teamSide(sport, home, homeScore, homeAbbr)
  if (!awaySide.logo && !homeSide.logo && !featured?.image) return undefined
  const sideFor = (team: Team, abbreviation: string) => featured?.team != null && (featured.team === abbreviation || featured.team === team.id)
  return {
    version: artVersion, kind: 'game', away: awaySide, home: homeSide,
    ...(featured ? { portrait: featured.image, player: featured.name,
      portraitSide: sideFor(away, awayAbbr) ? 'away' : sideFor(home, homeAbbr) ? 'home' : undefined } : {}),
  }
}

export function appleFeaturedPlayer(
  play: ESPNPlay, summary: ESPNSummary, sport: Sport, scoringSide?: string,
): Player | undefined {
  const normalize = (value: string) => value.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
  const playText = (play.text ?? '').replace(/^(?:\([^)]{1,50}\)\s*)+/, '')
  // An NFL passing touchdown starts with the quarterback, then identifies
  // the receiver after "pass ... to". Play text often uses "K.Monangai".
  const passTarget = sport === 'nfl' && scoringSide && /\btouchdown\b/i.test(playText)
    ? /\bpass\b[^.!?]{0,100}?\s+to\s+(.+)/i.exec(playText)?.[1] : undefined
  const description = normalize(passTarget ?? playText)
  const nameMatch = (name: string) => {
    const [first, ...rest] = name.trim().split(/\s+/)
    const initials = first.replace(/[^A-Z]/g, '')
    const variants = sport === 'nfl' && rest.length
      ? [name, `${first[0]} ${rest.join(' ')}`, `${initials} ${rest.join(' ')}`] : [name]
    return variants.map(normalize).some(value => value.length >= 3 &&
      (description === value || description.startsWith(value + ' ')))
  }
  const player = (name: string, headshot: unknown, team?: string): Player[] => {
    const image = applePlayerPortrait(headshot)
    return image && name ? [{ image, name: name.trim().slice(0, 70), team }] : []
  }
  const participants = play.athletes ?? []
  if (sport === 'mlb' && participants[0]) {
    const { displayName, headshot } = participants[0].athlete
    return player(displayName, headshot?.href, play.team?.id)[0]
  }

  const matches = [
    ...participants.flatMap(({ athlete }) =>
      nameMatch(athlete.displayName) ? player(athlete.displayName, athlete.headshot?.href, scoringSide) : []),
    ...(summary.boxscore?.players ?? []).flatMap(({ team, statistics }) => statistics.flatMap(group =>
      group.athletes.flatMap(({ athlete }) =>
        nameMatch(athlete.displayName) ? player(athlete.displayName, athlete.headshot?.href, team.abbreviation) : []))),
  ]
  const identities = new Set(matches.map(match => match.name.toLowerCase()))
  if (identities.size === 1) return matches.find(match => match.team) ?? matches[0]
  if (!passTarget && !matches.length && participants.length === 1) {
    const { displayName, headshot } = participants[0].athlete
    return player(displayName, headshot?.href, scoringSide)[0]
  }
  return undefined
}
