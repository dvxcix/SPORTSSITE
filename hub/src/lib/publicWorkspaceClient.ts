import type { PreviewSport } from './publicResearchPreview'

export const PUBLIC_WORKSPACE_ACCESS_EVENT = 'slipsurge:preview-access'
export function publicWorkspaceAccessOr(action: () => void) {
  if (currentPublicWorkspace()) window.dispatchEvent(new Event(PUBLIC_WORKSPACE_ACCESS_EVENT))
  else action()
}
export function currentPublicWorkspace(): PreviewSport | null {
  if (typeof window === 'undefined') return null
  return /^\/preview\/(nba|nfl)$/.exec(window.location.pathname)?.[1] as PreviewSport | undefined ?? null
}
export function publicWorkspaceHref(href: string) {
  const sport = currentPublicWorkspace()
  if (!sport || !href.startsWith('/') || href.startsWith('//')) return href
  const url = new URL(href, 'https://slipsurge.invalid')
  const root = sport === 'nba' ? '/the-paint' : '/the-sideline'
  if (url.pathname === root) return '/preview/' + sport + url.search + url.hash
  if (!(url.pathname.startsWith(root + '/') || url.pathname.startsWith('/api/nba-') || url.pathname.startsWith('/api/nfl-') || url.pathname.startsWith('/api/the-sideline/'))) return href
  url.searchParams.set('resource', url.pathname)
  return '/preview/' + sport + '/data?' + url.searchParams
}
export async function publicWorkspaceFetch(input: string, init?: RequestInit) {
  if (currentPublicWorkspace() && init?.method && !['GET','HEAD'].includes(init.method.toUpperCase())) {
    window.dispatchEvent(new Event(PUBLIC_WORKSPACE_ACCESS_EVENT))
    return Response.json({ error: 'Sign in to use your saved tools.' }, { status: 403 })
  }
  const response = await fetch(publicWorkspaceHref(input), init)
  if (currentPublicWorkspace() && response.status === 403) window.dispatchEvent(new Event(PUBLIC_WORKSPACE_ACCESS_EVENT))
  return response
}
