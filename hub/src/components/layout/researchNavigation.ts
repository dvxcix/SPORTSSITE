export type ResearchSport = 'mlb' | 'nfl'

const mlbRoutes = ['/dugout', '/sports', '/weather-lab', '/pitcher-report', '/slate-breakdown', '/batter-cost', '/odds-terminal', '/synergy', '/daily-recap', '/spray-charts', '/the-public']

export function researchSportForPath(path: string): ResearchSport | null {
  if (path === '/the-sideline' || path.startsWith('/the-sideline/')) return 'nfl'
  return mlbRoutes.some(route => path === route || path.startsWith(route + '/')) ? 'mlb' : null
}

export function researchHome(sport: ResearchSport, nflAccess: boolean) {
  return sport === 'nfl' && nflAccess ? '/the-sideline' : '/dugout'
}

/** Keep game context when changing NFL tools; do not leak unrelated query parameters. */
export function researchToolHref(href: string, path: string, search: { get(key: string): string | null }) {
  if (path !== '/the-sideline' || href.split('?')[0] !== '/the-sideline') return href
  const params = new URLSearchParams(href.split('?')[1] ?? '')
  for (const key of ['game', 'date', 'sample', 'at']) {
    const value = search.get(key)
    if (value && !params.has(key)) params.set(key, value)
  }
  return '/the-sideline' + (params.size ? '?' + params.toString() : '')
}

export function researchToolActive(href: string, path: string, search: { get(key: string): string | null }) {
  const [target, query] = href.split('?')
  if (target === '/the-sideline') return path === target && (search.get('mode') ?? '') === (new URLSearchParams(query).get('mode') ?? '')
  return path === target || path.startsWith(target + '/')
}
