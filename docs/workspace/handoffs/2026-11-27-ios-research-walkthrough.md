# November 27 native research follow-through

Continue on `codex/ios-parity-20261125` from `61993831`. The Xcode project and
scheme edits in the primary Mac checkout were preserved. This checkpoint is
native iOS source only. It uses the existing production contracts, archived
research observations, and entitlement checks.

## Research changes

- The NBA Trends tool has Props and Volume views. Props compares actual prices
  and named recent, recorded season, venue, or opponent samples, sorts by
  the recorded hit rate, and allows a minimum sample and price filter. Pushes
  are displayed separately from decisions. Each row opens player research at
  the exact sportsbook and line. The old volume deep link still opens Volume.
- Volume presets now restore the team if that team is in the current matchup.
  Presets saved before this change still open. Both Trends views keep controls
  visible at compact widths and summarize active menu choices. Presets remain
  local to each account and device.
- The NBA matchup comparison stacks on narrow windows and switches to columns
  at regular widths. Defense reloads with the correct matchup and observation
  revision. Rotation and availability links carry the complete matchup context
  into the player view.
- The NBA opponent log retains scope, season, minutes, and venue between player
  panels. It displays the reference sportsbook and line, includes historical
  opponent identity where available, and offers one-tap recovery to other games.
  A row with a missing quote remains a recorded result without a hit/miss grade.
- NFL player drill-in opens directly to a game log with a companion Chart tab.
  The same opponent and game-count filters apply to both views. NFL records show
  week, matchup, observed result, and outcome against the selected contract.
  Past meetings still require verifiable team codes in the archived game IDs.

## Reference and device verification

- The signed-in PropFinder Research screen was opened on the physical iPad.
  Its other sections could not be opened from this host. Device Hub input did
  not dismiss the iPad’s system Home Screen tip. A separately signed XCUITest
  runner timed out twice before executing, including with Device Hub screen
  sharing stopped. Accessibility Inspector listed the device but did not expose
  a physical app process or actionable tip. The user has been asked to dismiss
  the tip on the iPad and verify Settings → Developer → Enable UI Automation.
- [PropFinder Trends](https://blog.propfinder.app/release-notes-10-19) documents
  situational priced props as a separate flow from
  [Volume Trends and saved filters](https://blog.propfinder.app/release-notes-11-17).
  [November matchup notes](https://blog.propfinder.app/release-notes-11-24)
  were used for the comparison and log controls. The research payload supports
  observed player head-to-head history and position aggregates. League-wide
  player-level logs allowed by a defense and historical starter filters still
  require archived fields that the current native payload does not have.
- The signed-in iPhone 18 Pro simulator opened the NBA Props board, selected a
  five-game sample, and opened a ranked betPARX line with the exact 13.5 value
  and five observed games. The plus-money filter narrowed the same board
  from 184 to 98 quotes. The NBA opponent log broadened into 17 games, narrowed
  to 16 using a 30-minute floor, and restored that filter after a panel switch.
  A saved NYK Volume preset restored the team after toggling to Both teams.
  NFL player detail opened directly to ten recorded games with hit/miss.
  Switching to the empty Buffalo sample and back worked.
- The iPad mini simulator showed the public research sample in a narrow
  window, then maximized the same matchup without a selection reset. The
  ratings changed from stacked rows to side-by-side comparisons. Opened
  Austin Reaves through Rotations and saw POR, SAC, and MIA opponent labels
  from the carried snapshot. This exercised the preview and window behavior
  separately from the signed-in iPhone tests.
- Xcode 27.2 simulator and signed device builds succeeded. The separate
  SlipSurge Launch QA bundle installed and opened on the signed-in physical
  iPad. Device captures show the updated native Matchup Lab and the populated
  Props Trends board behind the system tip. Physical taps and physical resize
  remain unverified. The iPad
  does not expose Apple’s resizable-app automation capability, so a real
  window-control tap or corner drag is required after clearing the overlay.
- All 23 targeted backend freeze, native MM, and research preferences tests
  passed. Visual captures and test result bundles are local to the Mac and
  excluded from Git. The local evidence receipt is
  `/private/tmp/slipsurge-launch.MpPdfJ/evidence/research-walkthrough-visual-evidence.json`.

After touch works, walk PropFinder’s tabs and genuine player/defense drill-ins.
Then run the named XCUITest methods for saved filters, matchup sections, and
opponent logs in both physical iPad window sizes. The device controls named
in this handoff are the current dependency for those checks. The signed scratch
runner and the two Xcode results are under `/private/tmp/slipsurge-ipad-uitest.zdkjnA`
on the Mac.
