# SlipSurge iOS production checkpoint, 2026-11-27

- iOS task branch: `codex/ios-parity-20261125`. TestFlight build 1.0 (10) was archived from `b815b5b03611f9444043bcccb95ebd88a02d5b9a`. This handoff is a documentation checkpoint.
- Web main: [#104](https://github.com/dvxcix/SPORTSSITE/pull/104) merged as `50a1f87070c7144df2018c2c2634b14d7cd64604`. [#105](https://github.com/dvxcix/SPORTSSITE/pull/105) merged as `4272bba9e58b18ca1e4e1e6648d646795c339381`. Both retained the required ancestry from `6c3811b0882e1b1a6694a30849273f3e210cd69c`.
- Production Vercel releases: `dpl_FJEcphRgFKh3D7kmtqkTdxSwXkaL` for the native matchup archive and `dpl_7S1onrft6f4KXC4LfSwdfZakoUpW` for player identity in native Inbox. Both reached Ready and were assigned to `www.slipsurge.com` in sequence. The seven changed files cover mobile APIs, their helpers and regression tests. These releases required no database migration.
- Reviewed both exact PR heads and their successful previews. The combined source passed TypeScript and 195 of 212 selected tests. Untouched main passed 191 of 208 using the same selection. The same 17 legacy NFL snapshot tests failed in both runs. All four added regression tests passed.
- After production promotion the homepage, Feed and mobile scores returned 200. The NBA and NFL research pages returned the signed-out redirect, and both protected mobile APIs returned 401 without a session. The Apple universal link association returned the existing 404 and is tracked separately from these releases.
- Xcode 27.2 signed release build 10 for SlipSurge LLC. Verified the distribution signature, production APNs entitlement, Widget and Notification Service versions, and absence of matchup preview overrides in the release binary. Apple accepted the upload for internal TestFlight at 22:44 CET. The upload reported the existing missing GIPHY SDK dSYM warning.

## Devin’s iPad

The signed-in iPad mini is the physical QA target on iPadOS 27.2.1. The last confirmed installed TestFlight release was 1.0 (9). Verification of the internal group assignment, installation and production testing for build 10 is pending.

The separately installed Launch QA app was relaunched without preview overrides and reached the canonical production APIs. These checks are from Launch QA on the physical iPad:

- Full screen at 756 × 1,158 pt showed both NBA teams with 10/10 archived ATS and total lines for the selected package and a scored Miami opponent log. The automation assertions for some off-screen or combined labels failed. The actual archive values and expanded game log were verified visually.
- Full-screen NFL displayed its same-season projection, 21.8 for Denver and 21.2 for Pittsburgh. The test opened projection inputs and archived records.
- Full-screen Inbox Activity displayed named injuries from the saved production rows. Activity and Messages switched independently, and the new-message recipient picker opened and closed.
- Both standalone Swift projection and grading checks passed.

## Remaining release checks

- Confirm TestFlight build 10 is available to the existing internal QA group, install it, and verify the installed build before collecting production evidence.
- Test NBA/NFL Matchup Lab and Odds Boards, followed by Inbox Activity, Messages and the recipient picker, in full-screen and resized windows. Verify archived records and partial line coverage against the signed-in production APIs.
- Continue through Feed, Live Games, Community chat and the You tab. Track any repairs separately and repeat the affected device checks. Document account-dependent flows and multi-account or delivery checks with the evidence available.

## Build 11 native navigation follow-up

The production walkthrough reproduced a stale Odds Board filter sheet over Inbox and Community after an incoming link changed tabs. The app shell now presents and closes the sheet when it handles navigation. Both boards still use their original filters, including matchup, team, milestone and sort. This fix changes SwiftUI only.

- On signed-in Launch QA against production, NBA and NFL Matchup Lab and Odds Board filters opened at full screen and at 375 × 720 pt. The NFL records disclosed 4/10 archived lines for both ATS and totals. The NBA opponent log opened at both sizes.
- On the patched build at 375 × 724 pt, selected a different NFL sort and left the filter sheet open. The incoming Inbox link dismissed the sheet, Activity showed named production injuries, and Messages opened and dismissed the recipient picker. Returning to Research preserved the changed sort.
- Full-screen Community opened the joined private QA room. The composer showed Photo, GIF and Emoji and the keyboard dismissed on request. The You tab displayed the signed-in avatar and opened the Appearance setting. The run sent no posts or chat messages.
- Xcode archived and exported 1.0 (11) from the source in this checkpoint. Verified its SlipSurge LLC distribution signature, production APNs entitlement, embedded extension versions, and absence of preview overrides. Its internal TestFlight upload and installation are tracked in the next status update.

## Build 12 GIF picker follow-up

Apple accepted the internal build 11 upload at 23:05 CET. The iPad still reported TestFlight build 9 during the checks below.

The next signed-in walkthrough found the same navigation issue in the shared GIPHY picker. With a private room’s picker open, an incoming Feed link changed the tab behind it. The picker now dismisses itself when the app receives a supported URL or a notification open. The transition leaves composer draft state in the originating view.

- Opened the joined QA room and the real GIPHY catalog at 375 × 724 pt. Invoked the incoming Feed link with the picker open. XCTest confirmed the picker disappeared and the Feed’s Latest and Picks controls were available. No messages or posts were submitted.
- On-device functional checks are from the separate signed Launch QA bundle pointed at production. Verify the production TestFlight bundle version before recording release QA.

### Internal build 12 status at 23:10 CET

- Xcode built 1.0 (12) from `d46b03da6c2646c2e3db9037ae565770ac0ff68b` and Apple accepted the internal TestFlight upload at 23:10 CET. The verified distribution package uses SlipSurge LLC signing, the canonical app ID, production APNs and matching versions in both bundled extensions. Apple reported the pre-existing missing GIPHY SDK dSYM warning.
- Full-screen physical QA at 756 × 1,158 pt changed the NBA Odds Board sort, opened Inbox while the filter sheet was showing, and verified the sheet closed. Returning to Research retained the selected sort. The full NBA archive test also passed after giving the signed-in data time to load. The corresponding NFL-to-Inbox regression passed at 375 × 724 pt.
- Additional production smoke covered Feed, the room composer and GIPHY, the You avatar and Appearance settings, Workspace, Memberships, and Live Games. The NFL scoreboard opened Denver at Pittsburgh into Game Center with a live quarter, score, field diagram and play details. Workspace and Memberships checks were read-only.
- Devin’s iPad verified the installed production TestFlight bundle as 1.0 (9). The TestFlight product and eligible builds list also showed 9 as the newest available. App Store Connect requires a fresh sign-in before checking processing and assigning 12 to SlipSurge Internal QA. Resume with installation through TestFlight, confirm the installed build, and repeat signed-in research and Inbox in both window sizes. Live delivery, purchases and restore, and broader role-based tests still need release evidence.
- Rechecked homepage, Feed, scores and the signed-out protection for both reviewed mobile APIs. Preserved the existing Mac Xcode edits and the Windows workspace.

### Build 12 assigned and installed

Devin completed App Store Connect sign-in. Build 1.0 (12) was added to the existing SlipSurge Internal QA group and App Store Connect showed Testing. TestFlight automatically installed it on the iPad. CoreDevice verified the signed release bundle `com.slipsurge.ios` at 1.0 (12). The existing SlipSurge session remained signed in.

- The installed TestFlight build passed both Matchup Labs, both Odds Boards, and Inbox at 756 × 1,158 pt against production. The NBA projected score, market comparison, and archived opponent log loaded. Denver–Pittsburgh showed the archived scoring baseline and 4/10 ATS and total coverage.
- At full screen, an incoming Inbox link dismissed the open Odds Board filter sheet. Named injury entries showed in Activity. Messages switched independently and the recipient picker opened and closed. Returning to Research retained the NBA sort.
- The same signed-in app passed the archive and Inbox checks in the floating window at 525 × 931 pt and at 375 × 515 pt. At 375 × 724 pt, the NFL filter sheet dismissed on the Inbox link, named Activity alerts loaded, the Messages recipient picker opened and closed, and the NFL sort survived returning to Research. Retested the even shorter NFL Odds Board window by scrolling the filter button into view. Its filter sheet opened and dismissed.

### Extended TestFlight 12 coverage

- Verified same-player and same-line Sportsbooks and History on both Odds Boards. NBA showed Andrew Wiggins at 5+ points for MIA at NYK, and the comparison retained the matchup while switching to History.
- Opened First Basket Odds and History, NBA and NFL Cheatsheets, NFL MM and Slate Edge, and the MLB offseason slate’s empty state.
- Walked all four Workspace sections, signed-in search, an NFL scoreboard entry into Game Center, the You profile and Appearance, the joined QA room and live GIPHY catalog, and the Feed link from the open GIF picker.
- Verified Creator Studio, Admin queues, membership details showing Ultimate access, and the New Community form with the access selector available and creation disabled while empty. Alert Settings reported notifications enabled on the iPad and showed delivery and player-news controls.
- End-to-end purchase and restore, receipt behavior with another account, live APNs delivery, multi-account messaging, and actual community publication still require separate release verification.

### Compare odds follow-up

TestFlight 12 reproduced a separate case of a sheet remaining over the destination. The NBA and NFL same-line comparisons and their History panels worked, but the displayed Compare odds sheet stayed over Inbox when an incoming link switched tabs.

The shared Compare odds sheet now dismisses on the existing incoming-navigation signal, the same signal used by the GIF picker. Xcode built and signed the separate Launch QA bundle. With it pointed at production, the exact sequence passed for NBA at 756 × 1,158 pt and NFL at 375 × 724 pt. In each case the comparison opened with the same player and line, History opened, and the incoming link dismissed the sheet with Inbox accessible. The source fix is in this checkpoint for the next TestFlight build. The original TestFlight release on the iPad is 1.0 (12).
