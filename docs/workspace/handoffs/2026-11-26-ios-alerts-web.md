# iOS alerts and NFL Game Center server changes

Branch `codex/ios-alerts-web-20261126`, based on production main `2a8749e0`. The paired native branch is `codex/ios-parity-20261125`.

- Apple push uses OS categories and generic grouping for messages, lineup updates and the rest of Activity. The payload still contains only fixed UI text and the notification ID. Authenticated iOS resolves and marks that row via the existing member endpoint. Browser push, preferences, quiet hours, account checks and delivery deduplication use their existing paths.
- NFL Game Center reuses public portraits for validated participants from the existing player directory. A matching display name and same game team must identify a single candidate; provider portraits take precedence. An unavailable directory leaves the normal scoreboard and timeline available. The integration is read-only and makes no historical research or ingestion changes.
- Verified locally with the NFL center, mobile score links and private push payload suites and the TypeScript compiler. Before marking production verified, check the exact deployed revision, a completed NFL game's portrait identity and the score resolution endpoint. Apple push delivery also requires a push-entitled app build and the configured APNs provider.

PR #89 merged as `7c9b57d4`. Production deployment `dpl_AefdQWYFm1Z7hhDLcPqAyK9RqJCV` was ready. Three representative 2026-11-22 games returned 157 portraits across 163 distinct players, up from 0 in the measured Saints–Bears play response. Directory reads confirmed the six remaining names differ by common suffixes or an established short name. The follow-up in `codex/ios-nfl-portrait-identities-20261126` adds those compatibility matches with the original team and uniqueness checks.
