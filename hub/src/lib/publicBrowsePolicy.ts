const browsePages = new Set(['/feed', '/groups', '/sports', '/leaderboard', '/explore'])
const publicProfile = /^\/profile\/[a-zA-Z0-9._-]{1,80}$/
const publicCommunity = /^\/groups\/[a-zA-Z0-9_-]{1,100}$/
const publicPost = /^\/posts\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const publicInfoPages = new Set(['/about','/faq','/pricing','/support','/terms','/privacy','/responsible-gambling'])

/** Page access only. Request-scoped queries and RLS still decide visible content. */
export function isPublicBrowsePath(pathname: string) {
  return browsePages.has(pathname) || publicProfile.test(pathname) || (pathname !== '/groups/create' && publicCommunity.test(pathname)) || publicPost.test(pathname)
}

export function isPublicBrowseRequest(pathname: string, method: string) {
  return (method === 'GET' || method === 'HEAD') && isPublicBrowsePath(pathname)
}

/** The handler exposes availability booleans only, never rollout or account data. */
export function isPublicFeatureRequest(pathname:string, method:string) {
  return pathname === '/api/features' && (method === 'GET' || method === 'HEAD')
}

/** Chrome selection only; this never grants route or data access. */
export function usesVisitorBrowseFrame(pathname:string) {
  return isPublicBrowsePath(pathname) || publicInfoPages.has(pathname)
}

const nativePublicReaders = new Set(['/api/mobile/feed', '/api/mobile/discover', '/api/mobile/scores', '/api/mobile/scores/game', '/api/mobile/profiles', '/api/mobile/information', '/api/mobile/stories'])
const nativePublicPost = /^\/api\/mobile\/posts\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i

/** Exact guest reads use only public projections. Handlers verify any bearer independently. */
export function isNativePublicRead(pathname: string, method: string) {
  return method === 'GET' && (nativePublicReaders.has(pathname) || nativePublicPost.test(pathname))
}
