// A bounded image keeps rendering and download work predictable. The full
// watchlist remains available across pages, in its original order.
export const WATCHLIST_SHARE_PAGE_SIZE = 12

export function watchlistSharePage<T>(items: readonly T[], page: number): T[] {
  if (!Number.isInteger(page) || page < 0) return []
  return items.slice(page * WATCHLIST_SHARE_PAGE_SIZE, (page + 1) * WATCHLIST_SHARE_PAGE_SIZE)
}
