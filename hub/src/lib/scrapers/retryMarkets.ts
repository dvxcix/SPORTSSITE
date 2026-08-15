// Markets that should always have non-zero coverage in a healthy scrape of
// any real game — confirmed live (2026-07-25) across a full slate: a flat 0
// count for one of these across a WHOLE game's scrape is always a real
// miss (fanduelScraper.ts's per-tab section-expand/match can silently drop
// an entire market group with no error — see that file's own comments),
// never "this game just doesn't have that market." Other markets aren't
// listed here because they're legitimately allowed to be sparse per-player
// (e.g. laser110 only prices a subset of batters even in a healthy scrape)
// — the list below is markets where 0-across-the-whole-game never happens
// in healthy data, so it's a safe, unambiguous retry trigger.
//
// Shared by scrape-fanduel's own same-request retry (scrapeOneGame) and
// dispatch-scrapes' queued 5-minute-later retry so both react to the exact
// same signal — one list, not two that can drift apart.
// PA1 HR is intentionally not a retry trigger. FanDuel stopped offering the
// standalone "home run in first plate appearance" market on 2026-08-13 and
// replaced it with a combined Double/Triple/Home Run outcome. The scraper
// still visits the Plate Appearance tab and the importer will capture PA1 HR
// automatically if the standalone market returns, but an expected zero must
// not double every Browserbase scrape or push a game over its time budget.
export const RETRY_MARKETS = ['fhr_fd', 'rbi3_fd', 'combo1_min', 'combo2_min', 'laser105_fd', 'laser110_fd', 'moonshot_fd'] as const
export type RetryMarket = typeof RETRY_MARKETS[number]

export function missingMarkets(counts: Partial<Record<string, number>>): RetryMarket[] {
  return RETRY_MARKETS.filter(k => (counts[k] ?? 0) === 0)
}
