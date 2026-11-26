# Community and player artwork · 26 November 2026

- Web branch `codex/community-simplification-20261126`, based on production
  main `f4ca5783`. The related native work is on
  `codex/ios-parity-20261125` and recorded in its existing handoff.
- Groups, live rooms, direct messages, Feed, Saved and Activity remain
  available. Removed Events, Articles, Discussions and Pages from mobile,
  desktop and admin navigation, search and Explore. Old public URLs redirect
  to Communities. The retired admin sections point to group administration.
  Legacy mobile discovery responses retain empty arrays for older decoders.
  Retired rollout keys resolve off and are excluded from editing. Stored
  community content and existing database rows were preserved.
- Removed the site-wide VOLT Coming Soon bubble. The hidden watchlist, picks
  and matrix panel hosts remain reachable from their regular controls.
- NBA and NFL web board headshots fill their existing boxes from the top,
  with their team backdrops and badges. The legacy MLB fit still applies.
- Private browser review passed at 390 and 1280 pixels on Communities,
  Explore and Search, and checked old Community bookmarks. HTTP checks
  returned 307 to Communities for former forum, page, event and article URLs.
  TypeScript passed. The combined source run passed 284 of 286 checks. The
  Court access fixture cannot resolve `@opentelemetry/api` and the MLB
  matrices fixture lacks `isBlockedEitherWay`. Both failed identically on
  unchanged `f4ca5783`. No production data mutation was performed.
