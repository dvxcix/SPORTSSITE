import type { NbaOddsMode } from './nbaOddsMode'
import { publicWorkspaceHref } from './publicWorkspaceClient'

export function nbaModeHref(href: string, mode: NbaOddsMode) {
  const url = new URL(href, 'https://nba.invalid')
  url.searchParams.set('mode', mode)
  return publicWorkspaceHref(url.pathname + url.search + url.hash)
}
