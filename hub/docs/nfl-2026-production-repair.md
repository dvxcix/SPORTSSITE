# 2026 NFL production repair

## Causes
- Combined player_stats asset does not supply 2026 rows; job completion previously said nothing about season coverage.
- The board did not select PBP air_yards; aDOT/air share depended on qualification-limited NGS.
- Current-week NGS/season aggregates could leak into a pregame view, selecting an L1 week with no eligible PBP.
- A red-zone abbreviated-name fallback could match an opponent (M. Washington).

## Production changes
- Service-only, SECURITY INVOKER refresh_nfl_production(season) derives completed-game weekly production, keeping source provenance. It updates only its own derived rows, never overwrites provider rows, and leaves raw plays intact.
- Excludes deleted/nullified plays and two-point attempts. Retains signed air yards, lateral receiving yards, and separate player yardage rather than penalty-inclusive yards_gained.
- Board computes targets/share, air total/aDOT/share, RZ targets/carries and separate shares from the selected PBP window. Unknown air/tracking remains unavailable; zero is a valid value.
- Team aliases and GSIS IDs govern identity. Matrix evaluation no longer treats unavailable values as zero.
- Current-season NGS uses only prior weeks; no current-season aggregate is used as a historical snapshot.
- Schedule/PBP polling is hourly, NGS every three hours. PBP sync rebuilds weekly stats and immediately expires NFL data cache. This polls published data; it does not make a delayed upstream feed live.
- Missing completed-game coverage produces a non-successful job with coverage details. NFL sync success records the coverage report in pipeline health.

## Verification on September 21 ET / September 22 UTC
- 616 player-week rows, 31 completed games (16 Week 1, 15 Week 2).
- All 616 rows reconciled with the board accumulator; 492 player-weeks with target air samples checked.
- All 16 Week 2 pregame board loaders tested against production Supabase; L1 resolves prior-week plays, not current-week tracking.
- 137/139 weekly NGS receiving rows agree on targets/receptions/yards/TD. Two differences were inspected: London's nullified play (PBP excludes it), and Shakir's 10 lateral receiving yards (PBP includes them).
- Anonymous/authenticated database roles cannot run rebuild. Only service_role may invoke it.
- Raw data, odds, market captures, picks, and user entitlements are unchanged.

Run read-only reconciliation with configured server environment:

```
node --env-file=<project-env-file> node_modules/tsx/dist/cli.mjs scripts/verify-nfl-production.mts 2026
npx tsx --test scripts/nfl-2026-production.test.mts scripts/nfl-volume-integrity.test.mts
```

MNF game data was not in the published/stored PBP at audit time. It must pass the same completed-game coverage checks when imported; do not manufacture its stats.
