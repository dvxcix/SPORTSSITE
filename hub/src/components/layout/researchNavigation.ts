import { isNbaToolHref } from '@/lib/nbaAccessPolicy'

export type ResearchSport = 'mlb' | 'nfl' | 'nba'

const mlbRoutes = ['/mlb', '/players', '/dugout', '/sports', '/weather-lab', '/pitcher-report', '/slate-breakdown', '/batter-cost', '/odds-terminal', '/synergy', '/daily-recap', '/spray-charts', '/the-public']

export function researchSportForPath(path: string): ResearchSport | null {
  if (isNbaToolHref(path)) return 'nba'
  if (['/the-sideline', '/nfl'].some(route => path === route || path.startsWith(route + '/'))) return 'nfl'
  return mlbRoutes.some(route => path === route || path.startsWith(route + '/')) ? 'mlb' : null
}

export function availableResearchSports(nflAccess: boolean, nbaAccess = false): ResearchSport[] {
  return ['mlb', ...(nflAccess ? ['nfl' as const] : []), ...(nbaAccess ? ['nba' as const] : [])]
}

/** A persisted sport preference never grants access or exposes hidden tools. */
export function resolveResearchSport(sport: ResearchSport, nflAccess: boolean, nbaAccess = false): ResearchSport {
  return availableResearchSports(nflAccess, nbaAccess).includes(sport) ? sport : 'mlb'
}

export function researchHome(sport: ResearchSport, nflAccess: boolean, nbaAccess = false) {
  const selected = resolveResearchSport(sport, nflAccess, nbaAccess)
  return selected === 'nba' ? '/the-paint' : selected === 'nfl' ? '/the-sideline' : '/dugout'
}

/** Keep a sport's shared research context; never leak a panel, selection, or unrelated query. */
export function researchToolHref(href: string, path: string, search: { get(key: string): string | null }) {
  const target = href.split('?')[0]
  if (path !== target || !['/the-sideline', '/the-paint'].includes(target)) return href
  const params = new URLSearchParams(href.split('?')[1] ?? '')
  const keys = target === '/the-paint' ? ['game', 'date', 'market', 'book', 'side'] : ['game', 'date', 'sample', 'at']
  for (const key of keys) {
    const value = search.get(key)
    if (value && !params.has(key)) params.set(key, value)
  }
  return target + (params.size ? '?' + params.toString() : '')
}

export function researchToolActive(href: string, path: string, search: { get(key: string): string | null }) {
  const [target, query] = href.split('?')
  if (target === '/the-sideline') return path === target && (search.get('mode') ?? '') === (new URLSearchParams(query).get('mode') ?? '')
  if (target === '/the-paint') {
    const views = ['research','odds','ladders','movement','cheatsheets','usage','tracking','matchup','availability','game-markets','public','score','dvp','divergence','slate']
    const requested = search.get('view') ?? 'research'
    const current = views.includes(requested) ? requested : 'research'
    return path === target && current === (new URLSearchParams(query).get('view') ?? 'research')
  }
  return path === target || path.startsWith(target + '/')
}
