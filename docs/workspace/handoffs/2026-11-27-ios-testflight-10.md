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
