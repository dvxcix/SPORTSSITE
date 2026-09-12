export type AuditState = 'complete' | 'partial' | 'missing'

export type ExperienceRoute = {
  route: string
  label: string
  family: string
  priority: 'P0' | 'P1' | 'P2'
  shell: AuditState
  responsive: AuditState
  states: AuditState
  interaction: AuditState
  accessibility: AuditState
}

type FamilySeed = {
  family: string
  priority: ExperienceRoute['priority']
  defaults: Pick<ExperienceRoute, 'shell' | 'responsive' | 'states' | 'interaction' | 'accessibility'>
  routes: Array<string | [string, string]>
}

const partial = {
  shell: 'partial',
  responsive: 'partial',
  states: 'partial',
  interaction: 'partial',
  accessibility: 'partial',
} satisfies FamilySeed['defaults']

const legacy = {
  shell: 'missing',
  responsive: 'partial',
  states: 'missing',
  interaction: 'partial',
  accessibility: 'missing',
} satisfies FamilySeed['defaults']

const shared = {
  shell: 'complete',
  responsive: 'partial',
  states: 'partial',
  interaction: 'complete',
  accessibility: 'partial',
} satisfies FamilySeed['defaults']

const FAMILY_SEEDS: FamilySeed[] = [
  {
    family: 'Public & marketing', priority: 'P2', defaults: legacy,
    routes: ['/', '/about', '/faq', '/support', '/terms', '/privacy', '/responsible-gambling', '/pro', '/pricing'],
  },
  {
    family: 'Authentication & onboarding', priority: 'P1', defaults: partial,
    routes: ['/auth/login', '/auth/register', '/auth/forgot-password', '/auth/reset-password', '/auth/desktop/start', '/auth/desktop/complete', '/auth/whop/complete', '/onboarding'],
  },
  {
    family: 'Social & discovery', priority: 'P1', defaults: partial,
    routes: ['/feed', '/explore', '/search', '/notifications', '/bookmarks', '/picks', '/hashtag/[tag]', '/posts/[id]', '/stories/create'],
  },
  {
    family: 'Identity & sports entities', priority: 'P1', defaults: partial,
    routes: ['/profile/[username]', '/players/[id]', '/mlb/teams/[id]', '/nfl/players/[id]', '/nfl/teams/[abbr]', '/leaderboard'],
  },
  {
    family: 'MLB research', priority: 'P0', defaults: partial,
    routes: ['/dugout', '/batter-cost', '/slate-breakdown', '/pitcher-report', '/weather-lab', '/spray-charts', '/synergy', '/the-public', '/odds-terminal', '/daily-recap', '/scores', '/sports', '/sports/[sport]/[gameId]', '/research', '/allstar2026'],
  },
  {
    family: 'NFL research', priority: 'P1', defaults: partial,
    routes: [['/the-sideline', 'The Sideline board and internal workspaces']],
  },
  {
    family: 'Community', priority: 'P0', defaults: legacy,
    routes: ['/community', '/groups', '/groups/create', '/groups/[slug]', '/groups/[slug]/settings', '/channels', '/channels/[slug]', '/forum', '/forum/new', '/forum/[category]', '/forum/thread/[id]', '/pages', '/pages/create', '/pages/[slug]', '/pages/[slug]/settings', '/events', '/events/create', '/events/[id]'],
  },
  {
    family: 'Messaging', priority: 'P1', defaults: legacy,
    routes: ['/messages', '/messages/new', '/messages/[username]'],
  },
  {
    family: 'Creator & commerce', priority: 'P2', defaults: partial,
    routes: ['/creators', '/creators/apply', '/creators/studio', '/creators/payouts', '/creators/[username]', '/creators/offers/[productId]', '/marketplace', '/marketplace/sell', '/marketplace/[id]'],
  },
  {
    family: 'Publishing', priority: 'P2', defaults: legacy,
    routes: ['/blog', '/blog/[slug]', '/blog/my', '/blog/create', '/blog/create/ai', '/blog/edit/[id]'],
  },
  {
    family: 'Settings', priority: 'P1', defaults: partial,
    routes: ['/settings', '/settings/profile', '/settings/account', '/settings/security', '/settings/privacy', '/settings/notifications', '/settings/blocked', '/settings/membership'],
  },
  {
    family: 'Admin operations', priority: 'P1', defaults: shared,
    routes: ['/admin', '/admin/live', '/admin/jobs', '/admin/pipeline-health', '/admin/audit', '/admin/browserbase', '/admin/changelog', '/admin/contact-recap'],
  },
  {
    family: 'Admin community', priority: 'P2', defaults: shared,
    routes: ['/admin/users', '/admin/users/online', '/admin/users/verify', '/admin/users/banned', '/admin/users/deletions', '/admin/reports', '/admin/content/reports', '/admin/content/posts', '/admin/content/blogs', '/admin/content/stories', '/admin/groups', '/admin/forum', '/admin/pages', '/admin/events', '/admin/creators', '/admin/marketplace', '/admin/badges', '/admin/emojis'],
  },
  {
    family: 'Admin research', priority: 'P1', defaults: shared,
    routes: ['/admin/fanduel-import', '/admin/mgm-import', '/admin/pikkit-import', '/admin/hr-intelligence', '/admin/market-dna', '/admin/matrix-backtest'],
  },
  {
    family: 'Admin configuration', priority: 'P2', defaults: shared,
    routes: ['/admin/notifications', '/admin/discord', '/admin/discord/compose', '/admin/ads', '/admin/monetization', '/admin/site-banner', '/admin/social-platforms', '/admin/settings/general', '/admin/settings/features', '/admin/settings/email', '/admin/settings/payments', '/admin/settings/social-login', '/admin/settings/ai', '/admin/settings/custom-code', '/admin/design-system'],
  },
]

const ROUTE_OVERRIDES: Partial<Record<string, Partial<Pick<ExperienceRoute, 'shell' | 'responsive' | 'states' | 'interaction' | 'accessibility'>>>> = {
  '/': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/about': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete', accessibility: 'complete' },
  '/faq': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete', accessibility: 'complete' },
  '/support': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete', accessibility: 'complete' },
  '/terms': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete', accessibility: 'complete' },
  '/privacy': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete', accessibility: 'complete' },
  '/responsible-gambling': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete', accessibility: 'complete' },
  '/pro': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete', accessibility: 'complete' },
  '/pricing': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/auth/login': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/auth/register': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/auth/forgot-password': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/auth/reset-password': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/onboarding': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/community': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/groups': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/groups/[slug]': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/groups/[slug]/settings': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/channels': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/channels/[slug]': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/forum': { shell: 'complete', responsive: 'complete', states: 'complete' },
  '/forum/new': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/forum/[category]': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/forum/thread/[id]': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/groups/create': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/pages': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/pages/create': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/pages/[slug]': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/pages/[slug]/settings': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/events': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/events/create': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/events/[id]': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/messages': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/messages/new': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/messages/[username]': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/notifications': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/feed': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/explore': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/search': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/bookmarks': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/picks': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/hashtag/[tag]': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/posts/[id]': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/stories/create': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/auth/desktop/start': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete', accessibility: 'complete' },
  '/auth/desktop/complete': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete', accessibility: 'complete' },
  '/auth/whop/complete': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete', accessibility: 'complete' },
  '/profile/[username]': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/players/[id]': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/mlb/teams/[id]': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/nfl/players/[id]': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/nfl/teams/[abbr]': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/leaderboard': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/dugout': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/batter-cost': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/slate-breakdown': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/pitcher-report': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/weather-lab': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/spray-charts': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/synergy': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/the-public': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/odds-terminal': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/daily-recap': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/the-sideline': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/settings': { shell: 'complete', responsive: 'complete', states: 'complete' },
  '/settings/profile': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/settings/account': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/settings/security': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/settings/privacy': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/settings/notifications': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/settings/blocked': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/settings/membership': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/blog': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/blog/[slug]': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/blog/my': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/blog/create': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/blog/create/ai': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/blog/edit/[id]': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/creators': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/creators/apply': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/creators/studio': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/creators/payouts': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/creators/[username]': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/creators/offers/[productId]': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/marketplace': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/marketplace/[id]': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
  '/marketplace/sell': { shell: 'complete', responsive: 'complete', states: 'complete', interaction: 'complete' },
}

function routeLabel(route: string) {
  if (route === '/') return 'Home'
  return route
    .split('/')
    .filter(Boolean)
    .map(segment => segment.startsWith('[') ? segment.slice(1, -1) : segment)
    .map(segment => segment.replaceAll('-', ' '))
    .map(segment => segment.replace(/\b\w/g, letter => letter.toUpperCase()))
    .join(' / ')
}

export const PRODUCT_EXPERIENCE_ROUTES: ExperienceRoute[] = FAMILY_SEEDS.flatMap(seed =>
  seed.routes.map(item => {
    const [route, label] = Array.isArray(item) ? item : [item, routeLabel(item)]
    return { route, label, family: seed.family, priority: seed.priority, ...seed.defaults, ...(ROUTE_OVERRIDES[route] ?? {}) }
  }),
)

export const AUDIT_DIMENSIONS = ['shell', 'responsive', 'states', 'interaction', 'accessibility'] as const

export function routeCompletion(route: ExperienceRoute) {
  const values = AUDIT_DIMENSIONS.map(dimension => route[dimension])
  const points = values.reduce((sum, value) => sum + (value === 'complete' ? 1 : value === 'partial' ? 0.5 : 0), 0)
  return Math.round((points / values.length) * 100)
}
