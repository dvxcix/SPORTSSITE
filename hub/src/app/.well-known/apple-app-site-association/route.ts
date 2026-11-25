export const dynamic = 'force-dynamic'

const appIdentifier = /^[A-Z0-9]{10}\.[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/
const nativePaths = [
  '/home', '/feed', '/search', '/explore', '/hashtag/*', '/posts/*', '/profile/*',
  '/community', '/groups', '/groups/*', '/channels', '/channels/*', '/forum', '/forum/*',
  '/notifications', '/activity', '/missions', '/messages', '/messages/*', '/bookmarks', '/picks',
  '/events', '/events/*', '/blog', '/blog/*', '/pages', '/pages/*', '/creators', '/creators/offers/*',
  '/leaderboard', '/marketplace', '/marketplace/sell', '/workspace', '/pricing', '/pro',
  '/sports', '/scores', '/sports/nba/*', '/sports/nfl/*', '/sports/mlb/*', '/sports/nhl/*', '/sports/soccer/*',
  '/nba', '/nba/players/*', '/nba/teams/*', '/nfl/players/*', '/nfl/teams/*',
  '/players/*', '/mlb/teams/*', '/preview/nba', '/preview/nfl', '/the-paint', '/the-sideline', '/dugout',
  '/spray-charts', '/weather-lab', '/pitcher-report', '/the-public', '/batter-cost', '/odds-terminal',
  '/synergy', '/slate-breakdown', '/research', '/daily-recap',
]

export function GET() {
  const configured = (process.env.SLIPSURGE_IOS_APP_IDS ?? '').split(',').map(value => value.trim()).filter(Boolean)
  if (!configured.length || configured.length > 8 || configured.some(value => value.length > 240 || !appIdentifier.test(value))) {
    return Response.json({ error: 'No app association configured' }, { status: 404, headers: { 'Cache-Control': 'no-store' } })
  }

  const components = [
    { '#': 'no_universal_links', exclude: true },
    { '/': '/blog/create*', exclude: true },
    { '/': '/blog/edit/*', exclude: true },
    { '/': '/pages/create', exclude: true },
    { '/': '/groups/create', exclude: true },
    { '/': '/events/create', exclude: true },
    ...nativePaths.map(path => ({ '/': path })),
  ]
  return Response.json({ applinks: { details: [{ appIDs: [...new Set(configured)], components }] } }, {
    headers: { 'Cache-Control': 'public, max-age=300' },
  })
}
