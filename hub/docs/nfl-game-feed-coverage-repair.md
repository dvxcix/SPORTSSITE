# NFL source-separated game data repair — 2026-09-22

## Changes
- Durable BDL event feeds, all cursor pages; strict game/team/ET-date identity.
- Final feeds require terminal event and matching BDL and schedule scores. Never substitute these event IDs for nflverse play IDs.
- Current weekly stats now use stats_player/stats_player_week_SEASON.csv, not the stale legacy combined file. Explicit column aliases and full raw field retention.
- Independent source captures for PFR snap counts and FTN charting; no fabricated routes/tracking.
- Provider totals retained; PBP-derived red-zone fields continue to refresh. Enriched coverage is measured from terminal PBP, not presence of box scores.
- Five-minute event polling (bounded eight games per run, oldest poll first), hourly weekly stats, three-hour snap/charting updates. Existing hourly enriched PBP and NGS jobs remain.
- The Sideline includes a collapsed, server-rendered Game data panel with source coverage, timestamps, full event feed, snap table and charted-feature counts.
- Touchdown feed reuses verified final captures and no longer truncates at three pages.
- NFL entitlement and ranking formulas unchanged.

## Verified production data at repair
- 32 completed games / 5,813 BDL events; all 32 final markers and scores reconciled.
- Enriched nflverse PBP: 31 games. NYG–LA still awaiting processed publication.
- 2,160 modern weekly rows, including full retained provider payloads.
- 616 offensive player-week and 492 air-yard checks match board computations; all 16 Week 2 pregame lenses use prior-week data.
- Snap counts: 2,901 rows / 31 games.
- FTN charting: 2,854 rows / 17 games; every charted ID joins an existing nflverse play.
- No targeted player in the published weekly sample is missing derived RZ targets.
- Service-only storage; RLS enabled, anon/authenticated grants denied. Existing NFL page gate controls rendered access.

## Limits
- Basic final-score reconciliation is NOT a claim of all player box-score/advanced-metric completeness.
- Snap/charting publication lag remains visible; full formations/route trees/assignments/22-player coordinates are not available from these feeds.
- No BDL text parsing to invent air yards, EPA, routes or player identities.
- Backfill runner is explicit and season-scoped: scripts/sync-nfl-game-feeds.mts.
- Browser/device visual verification was not completed in this environment; server-render tests, TypeScript, lint and production build are separate checks.
