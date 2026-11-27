# November 27 iOS Matchup Lab projection

Continue on `codex/ios-parity-20261125`. This checkpoint follows `cc055576`.
The primary Mac checkout retains its local Xcode project and scheme edits. This
checkpoint is SwiftUI source. Vercel production was READY on main at
`fdfeb1f8` before publishing. The signed device install is SlipSurge Launch QA,
a separate bundle from the distribution build. Main and the existing iOS branch
have diverged since their shared required ancestry. Reconcile both before a
release that combines their changes.

## Physical reference

Opened PropFinder on Devin’s iPad and used Xcode touch automation to open its
NFL Games board and the Denver–Pittsburgh game. The detail displayed a spread
ruler with model and consensus positions, starting quarterbacks, Elo and QB
adjustments, market regression, and season offense versus defense metrics. Its
NBA Games slate showed projected team scores and sportsbook market context.
The iPad session directly verified the NFL detail. PropFinder also documents
the NBA game-detail inputs and ten-game ATS and O/U records.
[PropFinder’s NBA breakdown release notes](https://blog.propfinder.app/release-notes-11-24)

## Implementation

- The Court → Matchup Lab → Projection uses the selected NBA game and the
  same-season ratings from its existing pregame research snapshot. Average
  team pace sets possessions. Each team's expected efficiency averages its
  offense and the opposing defense. Those inputs produce the projected scores,
  margin, and total. Missing or mismatched inputs leave the projection
  unavailable. Live mode offers an explicit return to Pregame.
- The market benchmark switches between a median consensus and a captured
  sportsbook. The spread and total show their lines, differences in points,
  a comparison ruler, and consensus sample coverage. Moneyline chances remove
  the margin from paired book prices and are labeled as market estimates.
- The inputs disclosure explains the math and shows both teams’ rates.
  Captured quotes show the actual prices and observation time. Completed games
  show the final score, spread and total grading against the selected lines,
  and the baseline’s margin and total error.
- Continue encodes the date, game, research phase, Projection panel, and
  selected benchmark using the normalized sportsbook identifier. Score tiles
  stay on one line at compact width. The shared date control uses a shorter
  localized date when the full label does not fit. Both leagues' research
  scrollers clear the compact tab bar at the end of the content.

## Verification

- Xcode 27.2 builds passed for iPhone 18 Pro simulator and Devin’s iPad.
- On Devin’s iPad, full-screen touch automation switched from Consensus to
  FanDuel for Miami–New York and opened the model inputs and captured prices.
  The archived Philadelphia–Chicago test read the real 127–121 final, Chicago
  covered against the displayed spread, Over against the displayed total,
  and a 4.3-point margin error. The iPad window was physically resized from
  756 × 1158 to 375 × 720 points using its window corner.
- In the 375-point window, searched for and chose FanDuel, opened the inputs
  and captured odds, and scrolled to the archived margin error. Opened both
  signed-in Odds Boards and their filter sheets. Feed, Research, Community
  Joined, Inbox, and You all opened from the compact bottom bar. The iPhone
  simulator reopened the archived game with FanDuel already selected.
- On the full-screen iPad the existing Matchup Lab overview, rotations, and
  defense tabs opened. The opponent log widened to 17 games, then narrowed to
  16 at a 30-minute minimum and retained that filter after a panel switch. A
  temporary Volume Trends preset restored the exact team and metric after
  both changed. The QA preset was deleted after the check.
- Direct Swift checks passed for pace and efficiency, scores, invalid/missing
  inputs, median and ranges, pick’em, and no-vig probabilities. The 23 existing
  NBA freeze, native MM, and research-preference checks passed.
- Device logs and attachments are local to the Mac. No account data, device
  captures, or test runner files are tracked in Git.

Run the committed numeric check from the repository root:

```sh
swiftc ios/SlipSurge/Research/{GameMarketBook,CourtGameProjection}.swift \
  ios/Tests/CourtGameProjectionChecks.swift -o /tmp/slipsurge-projection-check
/tmp/slipsurge-projection-check
```

## Remaining work

The baseline excludes lineup, rest, venue, and calibrated win odds. Ten-game
ATS and O/U history needs a bounded historical read of each game's final score
and verified pre-tip market observation, plus visible coverage for missing
lines. The current board gives the selected game's lines only. A comparable
NFL team projection needs a validated, frozen team-level model. Existing NFL
player projection feeds are a separate workflow. App-wide signed-in release
certification remains open.
