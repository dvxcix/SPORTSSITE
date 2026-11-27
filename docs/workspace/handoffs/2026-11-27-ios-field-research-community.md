# November 27 iOS field, research and community checkpoint

The native task continues on `codex/ios-parity-20261125` from `308aaa85`.
The Mac used a separate checkout of that branch and separate main-based worktrees
for Hub changes. The two locally modified Xcode files in the primary clone were
preserved. TestFlight 1.0 (9) remains installed beside SlipSurge Launch QA.

## Implementation

- NFL Game Center draws the reported start and finish of supported plays.
  The server checks that both spots agree with the provider’s recorded yardage.
  Turnovers, punts and other plays with ambiguous positions stay in the
  play-by-play. The field can show the last measured play with its original
  period and clock. Replay uses play IDs, respects Reduce Motion, and leaves
  the reaction and share IDs intact. The field is a diagram of the reported
  gain or loss. It has no player tracking coordinates.
- NBA and NFL game charts retain a selected result after a touch, allow a
  larger view with the game log, and offer a three-game rolling average.
  The NBA matchup trend uses observed same-season games, the selected venue
  and existing pregame cutoff to report results against the next opponent.
- Profiles use a continuous full-window background. Uploaded covers blend
  into it and profiles without an uploaded cover have no placeholder card.
- Membership has an explicit account access check. Checkout confirmation
  requires a purchased Ultimate plan as well as active Ultimate access.
  The access check reads the current SlipSurge account entitlement.
- Native community reloads can take the member count from the current feed
  response, falling back to the entry count on older servers.

## Evidence

- Backend field support merged on main in `6fa3e4f1` ([PR #102](https://github.com/dvxcix/SPORTSSITE/pull/102)).
  Vercel production was ready. DAL–PHI returned 116 measured diagrams across
  193 plays. KC–BUF returned 23 measured plays across 32 as play-by-play was
  updating. The iPhone 18 Pro Max displayed the live KC–BUF field, player art,
  the quarter cue and the Replay control. Opened James Cook’s five-yard
  touchdown diagram from the live play list and exercised Replay. The iPad mini simulator displayed
  the DAL–PHI diagram in a narrow iPadOS window.
- The independent UI critique found that the mirrored yard markers did not
  identify the ball spot. The revised iPhone and iPad captures name the exact
  yard line, and the coordinate caption is exposed through accessibility.
- On iPhone 18 Pro, opened Curry’s matchup trend, toggled the average, and
  verified that the enlarged chart retained it and exposed the game log.
- The updated device and simulator builds passed with Xcode 27.2, including
  the opponent sample and community count changes. The physical iPad builds
  were signed, installed and launched as
  SlipSurge Launch QA. The physical window opened full-width. Device Hub
  displayed the touch pointer but did not apply the resize gesture.
- The native owner account created an unlisted free community and invited a
  second controlled account. The second account used Safari on the iPhone
  simulator to complete rules, channel and notification setup with alerts
  muted. The backend showed the accepted invitation and two members. The
  owner published one labeled QA pick with no stake from the native composer.
  The second account could read it after joining. The signed-out post and
  community URLs did not expose the fixture. The unlisted community and post
  remain available to the two test accounts for follow-up.
- The native community reloaded with two members after the count release.
  The native paid setup accepted the existing provider-backed test offer as
  the membership requirement. The second account reached the membership
  gate on the existing paid test community. The current test offer is live
  billing. The native membership check displayed Ultimate administrator
  access and kept the purchased plan identified as Free.
- Main merged the mobile count API and the Discord fixture repair in
  `fdfeb1f8` ([PR #103](https://github.com/dvxcix/SPORTSSITE/pull/103)).
  The previous Discord test still mocked the route’s obsolete auth imports.
  The repaired test exercises the shared admin guard with browser and native
  requests. All 99 targeted backend checks and TypeScript passed. The
  preview rejected the anonymous community request without returning the
  count or the test post. The production deployment from this commit was ready.

## Research references and remaining gates

PropFinder on Devin’s iPad showed its Research, Cheatsheets, Trends and Games
tabs, injury context and prop cards comparing matchup rank, seasons, head-to-head,
short-window results and sportsbook quotes. Device Hub displayed PropFinder in
a narrow window but did not apply taps into the player detail. Product and
release notes documented saved filters, a game pinned across tools, and opponent
logs scoped by starters, minutes and season. Keep those as separate parity
checks and use only available SlipSurge history and permissions.
[PropFinder product](https://propfinder.app/)
[Game pin and line comparison](https://blog.propfinder.app/release-notes-11-06)
[Saved filters and volume trends](https://blog.propfinder.app/release-notes-11-17)
[Opponent game logs](https://blog.propfinder.app/release-notes-11-24)

HOF opened on the iPad with a live game card. TheReal reached its signed-out
screen, so this session used its published NFL replay notes for that comparison.
Mobbin supplied screen research. The AppLlama CLI server was configured but
its tools were not callable from the current session.
[HOF](https://apps.apple.com/us/app/hof-sports-stats-data/id6449443337)
[TheReal release notes](https://docs.realapp.link/updates/changelog)

The physical iPad narrow-window interaction, additional NFL/NBA chart gestures,
paid creator purchase and unlock, Free → Ultimate purchase and provider restore,
and live Discord role grant and removal still need end-to-end verification.
There is no verified SlipSurge Whop sandbox in this session. The second
account has no verified Discord connection or designated test server here.
Paid setup with a provider-ready test offer and test checkout should happen
before an App Store submission. Whole-app parity remains open.
