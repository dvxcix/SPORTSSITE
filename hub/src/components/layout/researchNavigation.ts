import { isNbaToolHref } from '@/lib/nbaAccessPolicy'

export type ResearchSport = 'mlb' | 'nfl' | 'nba'

const mlbRoutes = ['/mlb', '/players', '/dugout', '/weather-lab', '/pitcher-report', '/slate-breakdown', '/batter-cost', '/odds-terminal', '/synergy', '/daily-recap', '/spray-charts', '/the-public']

export function researchSportForPath(path: string): ResearchSport | null {
  if (path.startsWith('/sports/nba/')) return 'nba'
  if (path.startsWith('/sports/nfl/')) return 'nfl'
  if (path.startsWith('/sports/mlb/')) return 'mlb'
  if (isNbaToolHref(path)) return 'nba'
  if (['/the-sideline', '/nfl'].some(route => path === route || path.startsWith(route + '/'))) return 'nfl'
  return mlbRoutes.some(route => path === route || path.startsWith(route + '/')) ? 'mlb' : null
}

export const NBA_UPGRADE_HREF = '/pricing#plan-ultimate'

/** Discovery is public; access is checked separately before opening a tool. */
export function availableResearchSports(nflAccess: boolean): ResearchSport[] {
  return ['mlb', ...(nflAccess ? ['nfl' as const] : []), 'nba']
}

/** A persisted sport preference selects a menu, never grants access. */
export function resolveResearchSport(sport: ResearchSport, nflAccess: boolean): ResearchSport {
  return availableResearchSports(nflAccess).includes(sport) ? sport : 'mlb'
}

export function researchHome(sport: ResearchSport, nflAccess: boolean, nbaAccess = false) {
  const selected = resolveResearchSport(sport, nflAccess)
  return selected === 'nba' ? (nbaAccess ? '/the-paint' : NBA_UPGRADE_HREF) : selected === 'nfl' ? '/the-sideline' : '/dugout'
}

export function researchNavigationHref(href: string, path: string, search: { get(key: string): string | null }, nbaAccess: boolean) {
  return isNbaToolHref(href) && !nbaAccess ? NBA_UPGRADE_HREF : researchToolHref(href, path, search)
}

/** Keep a sport's shared research context; never leak a panel, selection, or unrelated query. */
export function researchToolHref(href: string, path: string, search: { get(key: string): string | null }) {
  const target = href.split('?')[0]
  const selectedMode = search.get('mode')
  if (isNbaToolHref(href) && researchSportForPath(path) === 'nba' && (selectedMode === 'live' || selectedMode === 'pregame')) {
    const selected = new URLSearchParams(href.split('?')[1] ?? '')
    if (!selected.has('mode')) selected.set('mode', selectedMode)
    href = target + '?' + selected.toString()
  }
  if (path !== target || !['/the-sideline', '/the-paint'].includes(target)) return href
  const params = new URLSearchParams(href.split('?')[1] ?? '')
  const keys = target === '/the-paint' ? ['game', 'date', 'market', 'book', 'side', 'contract', 'target'] : ['game', 'date', 'sample', 'at']
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
    const views = ['research','odds','ladders','movement','cheatsheets','usage','tracking','matchup','availability','game-markets','public','score','dvp','divergence','slate','first-basket']
    const requested = search.get('view') ?? 'research'
    const current = views.includes(requested) ? requested : 'research'
    return path === target && current === (new URLSearchParams(query).get('view') ?? 'research')
  }
  return path === target || path.startsWith(target + '/')
}
