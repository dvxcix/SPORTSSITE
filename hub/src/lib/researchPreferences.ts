/** Private member defaults. IDs are stable; destinations never come from stored URLs. */
export const RESEARCH_BOOKS = [
  ['fanduel', 'FanDuel'], ['draftkings', 'DraftKings'], ['betmgm', 'BetMGM'],
  ['caesars', 'Caesars'], ['fanatics', 'Fanatics'], ['betrivers', 'BetRivers'],
  ['betparx', 'betPARX'], ['ballybet', 'Bally Bet'], ['pinnacle', 'Pinnacle'],
  ['kalshi', 'Kalshi'], ['polymarket', 'Polymarket'],
] as const

export const LAUNCH_PAGES = [
  { id: 'feed', label: 'Feed', group: 'Workspace', href: '/feed' },
  { id: 'picks', label: 'Picks', group: 'Workspace', href: '/picks' },
  { id: 'sports', label: 'Live Scores', group: 'Workspace', href: '/sports' },
  { id: 'bookmarks', label: 'Bookmarks', group: 'Workspace', href: '/bookmarks' },
  { id: 'workspace', label: 'Research Workspace', group: 'Workspace', href: '/workspace' },
  { id: 'activity', label: 'Activity Replay', group: 'Workspace', href: '/activity' },
  { id: 'missions', label: 'Missions', group: 'Workspace', href: '/missions' },
  { id: 'explore', label: 'Explore', group: 'Community', href: '/explore' },
  { id: 'community', label: 'Community', group: 'Community', href: '/community' },
  { id: 'leaderboard', label: 'Leaderboard', group: 'Community', href: '/leaderboard' },
  { id: 'messages', label: 'Messages', group: 'Community', href: '/messages' },
  { id: 'notifications', label: 'Notifications', group: 'Community', href: '/notifications' },
  ...[
    ['court', 'The Court', 'research'], ['nba-odds-board', 'Odds Board', 'odds-board'],
    ['nba-odds', 'Odds', 'odds'], ['nba-ladders', 'Ladders', 'ladders'],
    ['nba-movement', 'Market Story', 'movement'], ['nba-first-basket', 'First basket', 'first-basket'],
    ['nba-cheatsheets', 'Cheatsheets', 'cheatsheets'], ['nba-trends', 'Player trends', 'usage'],
    ['nba-tracking', 'Tracking', 'tracking'], ['nba-score', 'SlipSurge Score', 'score'],
    ['nba-slate', 'Slate Edge', 'slate'], ['nba-dvp', 'Defense × position', 'dvp'],
    ['nba-cross-market', 'Cross-market', 'divergence'], ['nba-matchup', 'Matchup Lab', 'matchup'],
    ['nba-availability', 'Availability', 'availability'], ['nba-games', 'Game markets', 'game-markets'],
    ['nba-public', 'ThePublic', 'public'],
  ].map(([id, label, view]) => ({ id, label, group: 'NBA', href: `/the-paint?view=${view}` })),
  ...[
    ['sideline', 'The Sideline', 'core'], ['nfl-odds-board', 'Odds Board', 'odds-board'],
    ['nfl-touchdowns', 'Touchdowns', 'touchdowns'], ['nfl-props', 'Props', 'props'],
    ['nfl-usage', 'Usage', 'usage'], ['nfl-tracking', 'Tracking', 'tracking'],
    ['nfl-team', 'Team', 'team'], ['nfl-all', 'All columns', 'all'], ['nfl-custom', 'Custom columns', 'custom'],
  ].map(([id, label, view]) => ({ id, label, group: 'NFL', href: `/the-sideline?view=${view}` })),
  ...[
    ['nfl-public', 'The Public', 'public'], ['nfl-books', 'Sportsbooks', 'markets'],
    ['nfl-cheatsheets', 'Cheatsheets', 'cheatsheets'], ['nfl-matchup', 'Matchup Lab', 'research'],
  ].map(([id, label, mode]) => ({ id, label, group: 'NFL', href: `/the-sideline?mode=${mode}` })),
]

export type ResearchPreferences = { version: 1; launchPage: string; books: string[]; primaryBook: string | null }
export const DEFAULT_RESEARCH_PREFERENCES: ResearchPreferences = { version: 1, launchPage: 'feed', books: [], primaryBook: null }
const bookIds = new Set<string>(RESEARCH_BOOKS.map(([id]) => id))
const launchIds = new Set(LAUNCH_PAGES.map(page => page.id))

export function validResearchPreferences(value: unknown): value is ResearchPreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const item = value as Record<string, unknown>
  if (Object.keys(item).length !== 4 || item.version !== 1 || typeof item.launchPage !== 'string' || !launchIds.has(item.launchPage)) return false
  if (!Array.isArray(item.books) || item.books.length > RESEARCH_BOOKS.length || item.books.some(book => typeof book !== 'string' || !bookIds.has(book)) || new Set(item.books).size !== item.books.length) return false
  return item.books.length === 0 ? item.primaryBook === null : typeof item.primaryBook === 'string' && item.books.includes(item.primaryBook)
}

export function launchDestination(preferences: ResearchPreferences, access: { nba: boolean; nfl: boolean }): string {
  const page = LAUNCH_PAGES.find(item => item.id === preferences.launchPage)
  if (!page || (page.group === 'NBA' && !access.nba) || (page.group === 'NFL' && !access.nfl)) return '/feed'
  return page.href
}

/** Only display selection changes. Never narrow model/slate ranking inputs. */
export function preferredBookIds(available: readonly string[], preferred: readonly string[]): string[] {
  const selected = available.filter(book => preferred.includes(book === 'williamhill_us' ? 'caesars' : book))
  return selected.length ? selected : [...available]
}

export function initialResearchBook(explicit: string | null | undefined, preferences: ResearchPreferences, fallback = 'all', comparison = false): string {
  if (explicit === 'all' || (explicit && (bookIds.has(explicit) || explicit === 'williamhill_us'))) return explicit
  if (comparison && preferences.books.length > 1) return 'all'
  return preferences.primaryBook ?? fallback
}

/** Shared comparison links carry only bounded display-book IDs, never source URLs. */
export function comparisonBookDefaults(query: string | null, explicitBook: string | null, preferences: ResearchPreferences): string[] {
  if (query === 'all') return []
  if (query && query.length <= 1024) {
    const books = query.split(',')
    if (books.length <= 32 && books.every(book => /^[a-z0-9_]{1,40}$/.test(book))) return [...new Set(books)]
  }
  return explicitBook ? [] : preferences.books
}
