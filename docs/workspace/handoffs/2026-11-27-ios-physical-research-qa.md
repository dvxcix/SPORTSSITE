# Physical iPad research QA on November 27

Continue on `codex/ios-parity-20261125` from `58ca775f`. The test device was
Devin’s iPad mini on iPadOS 27.2.1. Owner dismissed the system tip and enabled
UI Automation. A standalone Xcode UI test runner then sent taps and gestures
to the installed apps using their existing signed-in sessions.

## PropFinder walkthrough

- Opened installed NFL Cheatsheets, Trends, and Games. The H2H control on
  Trends became selected and showed one active situational filter.
  Games showed model scores, consensus odds, and tracked outcomes.
  The deeper game-card walkthrough timed out in the installed app.
- Switched leagues and opened NBA Defensive Matchups for MIA at NYK. The
  results paired player, position, line, recent average, and opposing team.
  Scrolled the Cheatsheets tool row, opened Volume Trends, and inspected the
  loaded full-season and recent-game average columns. The player row opened
  individual research.
- In the Karl-Anthony Towns player page, scrolled to Gamelogs and selected
  Opponent. The Opponent tab exposed position comparisons and reported
  that this player’s archetype was unavailable. This is a comparison against
  players faced by the defense. SlipSurge’s player logs show the individual
  player’s recorded history and its Defense view shows position aggregates.
  Complete opponent-player rows and historical starter flags still require
  archive support.

## Native changes

- Made the full header of each NBA Cheatsheet, Props Trends, Volume Trends,
  and rotation row tappable. The baseline physical test found that a
  center tap in the space between the player name and chevron could leave
  Cheatsheets open. These links still open the existing exact player routes.
- Volume Trends uses one filter row at regular width with standard text,
  and two rows at narrow widths. The control state survives layout changes.
  Larger text keeps the controls stacked where needed.
- The NBA player tools rail now scrolls only as far as needed to show the
  chosen tool. At 375 points, centering Opponent log cut into the adjacent
  Trends hit area and made the return tap unreliable.

## Checks

- Xcode 27.2 physical device and simulator builds succeeded. SlipSurge
  Launch QA was installed and launched on the physical iPad. Targeted backend
  freeze, native MM, and research preferences checks passed 23 of 23.
- The original physical window was 756 × 1158 points. Corner drags produced
  375-point-wide windows with heights of 720 and 724 points and reflowed the
  existing matchup from two columns into stacked rows.
- At both widths, the saved filter test restored NYK and Minutes after
  changing the team and usage metric. The runner removed its temporary
  preset at the end of each run.
- At both widths, the signed-in Matchup Lab test opened Overview, Rotations,
  and Defense, then returned to the MIA–NYK comparison.
- The opponent-log tests tapped the center of the Cheatsheet header and
  opened Davion Mitchell’s FanDuel 15+ Points log. The matchup sample showed
  its empty state, All opponents showed 17 games, and the 30-minute minimum
  showed 16. Returning from Trends preserved the filter at both widths.
- Closed the background PropFinder and HOF views during the narrow retest
  after their animations held Xcode's device gestures.
- The primary Mac checkout’s existing Xcode project and scheme edits were
  preserved. The production Vercel deployment from `fdfeb1f8` was READY.
  This checkpoint contains iOS files and QA notes.

Xcode runner and results are local under `/private/tmp/slipsurge-ipad-uitest.zdkjnA`.
The six selected captures are under
`/private/tmp/slipsurge-launch.MpPdfJ/evidence/slipsurge-physical-research`.
