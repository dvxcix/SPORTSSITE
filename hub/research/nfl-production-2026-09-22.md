# NFL results and historical sample corrections

## Shipped scope

- NFL Public: separate result data, 30-second visible-tab refresh, exact-line outcome labels and expandable captured ladder results. Live unreached overs remain pending. Live reached lines are labeled reached, not final settlement. Final equality respects milestone versus over/under contracts.
- Anytime TD counts exclude passing TDs. First-TD result closes when the first scorer is known. An empty/failed feed is not proof of no TD.
- Missing/unsupported result fields stay unavailable, never fabricated zeroes. This is informational performance tracking, not sportsbook settlement or injury-void adjudication.
- The Sideline's Game Data panel and Cheatsheet coverage diagnostics require the trusted admin role, not merely NFL beta access.
- Cheatsheet PBP, tracking, weekly production, and DVP are bounded before the selected week. Board DVP is recomputed from prior-week production rather than today's cumulative table. Cache versions changed.
- Weekly production supplies low-volume players who do not qualify for NGS tracking. Missing NGS is not marked as tracking coverage. No ranking weights changed.

## Verification

- 21 regression tests passed (grading, historical cutoffs, access controls, production and volume integrity).
- TypeScript and targeted ESLint passed; production webpack build passed.
- Real DB: all 32 Week 1–2 regular-season games have reconciled game feeds; no missing game feeds. Weekly player records: Week 1 1,117; Week 2 1,106.
- Read-only real-module integration: NYG/LA Week 2 pregame sample max 1 prior game, 23 players; ATL/GB Week 3 max 2 prior games, 23 players.
- Final NYG/LA result verification: Adams 195 receiving yards, 2 anytime TDs, first TD; Nabers 1 receiving yard and 0 TDs. These results are separate from the Week 2 pregame sample.
- Actual Public component browser fixture at 375, 768 and 1440 pixels: live/final states, expansion, filtering, no horizontal overflow, no browser errors.

## Explicit limits

- Full-game box-score markets are supported where returned by the provider. Quarter/half yardage, longest completion, and other unavailable result fields are not inferred from full-game totals.
- Historical cutoffs prevent selected/future-game leakage; they do not reconstruct what a provider knew at an exact historical second. Later official corrections to prior games can update their history.
- Advanced tracking/charting remains subject to source coverage. Reconciled game feeds do not imply every player has NGS separation or complete route charting.
- Customer-authenticated production UI still requires verification with a real entitled session; synthetic browser tests do not replace that check.
