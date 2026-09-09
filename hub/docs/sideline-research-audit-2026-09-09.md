# NFL research expansion: verified scope and remaining work

The Sideline remains admin-only and excluded from public navigation. This is not a claim of complete NFL launch readiness.

## Implemented in this change

- Explicit board samples: prior regular season, current preseason, current regular season. No automatic cross-season fallback.
- Primary TD selection cannot silently use a multi-TD alternate.
- Invalid American prices are unavailable. Profit-price percentages are continuous across +100/-100; probability-point displacement remains a separate metric. Large valid longshot changes are not artificially clamped.
- Paginated play-by-play samples rather than an unpaged 7,000-row request. PBP and box scores exclude the selected game date and later dates.
- Dedicated per-game NFL Public view with captured counts, search, category filters, timestamps, pagination and filtered-count share. These counts are not betting handle or a census of all bettors.
- Dedicated per-game sportsbook view with logos, all normalized player market offers, exact line/side separation and individual timestamps. Different threshold conventions are deliberately not merged without a canonical settlement definition.
- No new public navigation entry or ingestion-provider branding.

## Data/feature coverage audit

All 18 reference categories were inspected through the user's signed-in browser. Some detailed rows remain subscription-gated. Only permitted UI was reviewed; no source code or proprietary datasets were copied.

| Research capability | Remaining implementation/data requirement |
| --- | --- |
| TD matchups | Validate per-opportunity role and red-zone rates, not guaranteed scoring grades |
| Role matchups | Historical role assignment and player/team transfer reconciliation |
| Market grades | Calibrated, backtested methodology with confidence and missing-data handling |
| Coverage matchups | Charted defensive shells and receiver results by shell |
| Alignment matchups | Slot/wide/inline/backfield exposure data |
| WR vs CB | Alignment overlap and charted defender targets; distinguish estimates from assignments |
| Rushing matchups | Validated gap-level carry and defensive results aggregation |
| Red-zone matchups | Drive/trip denominators and full phase-specific play coverage |
| Line matchups | Pressure/blocking attribution feed |
| Hit-rate matrix | Per-game logs and exact market settlement rules for each threshold |
| Team share | Complete team denominators, transfers, per-game/window reconciliation |
| Defensive stats | Complete samples and explicit denominators rather than zero-filled missing feeds |
| Coverage matrix | Charted shell usage and result data |
| Team tendencies | PBP-derived rates; validate neutral-state definitions and sample coverage |
| Coverage players | Individual coverage snaps, assignments and attributed outcomes |
| Odds discrepancies | Basic same-line comparison implemented; canonical alternate equivalence and freshness controls remain |
| Receiving value | Routes, targets per route, yards/EPA per route and charted drops |
| Explosive plays | Validated per-game cumulative thresholds and defensive/matchup views |

## Explicit launch gaps

- Raw FanDuel tabs remain archived, but raw retention does not mean every raw team/combo/drive market is normalized and rendered. This change expands access to normalized player markets only.
- The board sample selector does not yet govern the separate Routes + history view.
- Some older tracking aggregates have no exact as-of date. Current-season historical replay still needs week/date-safe tracking reconciliation.
- Per-player last-N games can differ from a team's last-N weeks (bye weeks/injuries). Reconcile before labeling every derived window as exact player-game history.
- The legacy score and player detail/comparison cards still need field-by-field missing-data validation. Missing tracking must not create a false neutral score.
- Charted coverage, route and defender-assignment feeds are not present in the inspected schema. Do not derive these from unrelated box scores or fabricate a grade.
- NFL weather and full MLB-tool parity remain separate implementation work.

## Verification

Regression suite, TypeScript and targeted ESLint are run with this change. Local authenticated board, preseason selector, Public and sportsbook views were exercised. Mobile sportsbook layout was inspected at 390×844. This is not exhaustive all-device or full-source reconciliation.
