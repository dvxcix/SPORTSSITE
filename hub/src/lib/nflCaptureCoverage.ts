import type { FdTab } from './scrapers/nflFanduelMarkets'

/** A parsed-empty board is only pending when the capture completed and
 * contains team/game markets, not rejected player markets. Never save it over
 * a previously valid player board. */
export function emptyNflCaptureStatus(tabs: (FdTab & { incomplete?: boolean })[]): 425 | 502 {
  const sections = tabs.flatMap(tab => Object.keys(tab.sections ?? {}))
  const playerMarket = /player|receiv|reception|rush|pass(?:ing)?\s+(?:yard|td|touchdown|attempt|completion)|touchdown\s*scorer|(?:anytime|first|last|[2-9]\+)\s+touchdown/i
  return tabs.length > 0 && !tabs.some(tab => tab.incomplete) && sections.length > 0
    && !sections.some(section => playerMarket.test(section)) ? 425 : 502
}
