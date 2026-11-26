import { getTeamLogoPngUrl, MLB_TEAM_IDS } from '@slipsurge/core/mlbTeamColors'

/** Return public artwork only for existing system-generated sports alerts. */
export function nativeNotificationArtwork(type: string, actor: string | null, source: unknown): string | null {
  if (actor !== null || typeof source !== 'string' || source.length > 1024) return null
  let url: URL
  try { url = new URL(source) } catch { return null }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null
  if (type === 'lineup_confirmed') {
    const id = url.hostname === 'www.mlbstatic.com' && /^\/team-logos\/(\d+)\.svg$/.exec(url.pathname)?.[1]
    if (!id) return null
    const team = Object.entries(MLB_TEAM_IDS).find(([, value]) => value === Number(id))?.[0]
    return getTeamLogoPngUrl(team) ?? null
  }
  if (type !== 'pick_result' || url.search || url.hash) return null
  const path = url.pathname
  if (url.hostname === 'a.espncdn.com' && /^\/i\/headshots\/(?:nfl|nba|mlb)\/players\/full\/\d+\.png$/.test(path)) return url.href
  if (url.hostname === 'cdn.nba.com' && /^\/headshots\/nba\/latest\/\d+x\d+\/\d+\.png$/.test(path)) return url.href
  if (url.hostname === 'img.mlbstatic.com' && path.startsWith('/mlb-photos/image/upload/') && /\/v1\/people\/\d+\/headshot\/silo\/current$/.test(path)) return url.href
  if (url.hostname === 'static.www.nfl.com' && /^\/image\/upload\/[a-zA-Z0-9_,./-]+$/.test(path)) return url.href
  return null
}
