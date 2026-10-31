/** Baseball-only routes, including direct APIs and mobile bearer requests.
 * Shared NFL/NBA pages and APIs are intentionally not included. */
const MLB_PATHS = [
  '/dugout', '/mlb', '/players', '/batter-cost', '/pitcher-report',
  '/spray-charts', '/slate-breakdown', '/weather-lab', '/the-public',
  '/odds-terminal', '/research', '/synergy', '/daily-recap', '/allstar2026',
  '/api/dugout', '/api/mlb', '/api/players', '/api/pitcher-report',
  '/api/spray-charts', '/api/slate', '/api/weather-lab', '/api/synergy',
  '/api/odds-terminal', '/api/matrices', '/api/matrix-marketplace',
  '/api/allstar', '/api/odds/mlb', '/api/search/sports', '/api/research/mechanics', '/api/composer/games',
  '/sports/mlb',
] as const

export function isMlbOnlyPath(pathname: string): boolean {
  let path: string
  try { path = decodeURIComponent(pathname).toLowerCase() } catch { return false }
  if (/^\/marketplace\/[^/]+\/?$/.test(path) && path !== '/marketplace/sell' && path !== '/marketplace/sell/') return true
  return MLB_PATHS.some(prefix => path === prefix || path.startsWith(`${prefix}/`))
}

/** Routes whose current implementation calls an MLB data provider, including
 * for historical dates. Stored-data routes remain available to admins. */
export function isMlbPullPath(pathname: string): boolean {
  let path: string
  try { path = decodeURIComponent(pathname).toLowerCase() } catch { return true }
  const prefixes = [
    '/api/mlb', '/api/slate', '/api/odds/mlb', '/api/search/sports',
    '/api/research/mechanics', '/api/synergy/today', '/api/allstar',
    '/api/weather-lab', '/api/spray-charts', '/api/pitcher-report/live-window',
    '/api/dugout/team-bullpen', '/api/dugout/data', '/api/composer/games', '/sports/mlb', '/mlb/teams',
  ]
  return prefixes.some(prefix => path === prefix || path.startsWith(`${prefix}/`))
    || /^\/api\/players\/[^/]+\/today\/?$/.test(path)
}
