import type { NbaOddsMode } from './nbaOddsMode'

export function nbaModeHref(href: string, mode: NbaOddsMode) {
  const url = new URL(href, 'https://nba.invalid')
  url.searchParams.set('mode', mode)
  return url.pathname + url.search + url.hash
}
