// A same-request retry is expensive because it repeats every FanDuel tab in a
// fresh Browserbase session. Only retry immediately for markets observed on
// every complete event. FHR and Player Combos can legitimately be unavailable
// on an otherwise healthy page, while 110+ and standalone first-PA HR are no
// longer consistently offered. Treating any of those as mandatory produced
// five-minute timeouts and abandoned pipeline runs.
export const CORE_RETRY_MARKETS = ['rbi3_fd', 'laser105_fd', 'moonshot_fd'] as const
export type CoreRetryMarket = typeof CORE_RETRY_MARKETS[number]

// The lineup-triggered opening capture may requeue once when FHR has not been
// posted yet. That retry happens five minutes later, not by immediately
// repeating the entire event in the same request.
export const OPENING_RETRY_MARKETS = ['fhr_fd', ...CORE_RETRY_MARKETS] as const
export type OpeningRetryMarket = typeof OPENING_RETRY_MARKETS[number]

export function missingCoreMarkets(counts: Partial<Record<string, number>>): CoreRetryMarket[] {
  return CORE_RETRY_MARKETS.filter(k => (counts[k] ?? 0) === 0)
}

export function missingOpeningMarkets(counts: Partial<Record<string, number>>): OpeningRetryMarket[] {
  return OPENING_RETRY_MARKETS.filter(k => (counts[k] ?? 0) === 0)
}
