# November 27 iOS research workflows

Continue on `codex/ios-parity-20261125`. This checkpoint follows `2ca4eaa0`.
The primary Mac checkout still has its original Xcode project and scheme edits.
This checkpoint contains native app source and this handoff. Hub production and
the database continue to use the existing source and endpoints.

## What changed

- NBA Cheatsheets open player research with the chosen sportsbook, prop market,
  side, exact line or milestone, and venue. Volume Trends compares the recent
  3, 5, or 10 games with earlier recorded games for minutes, shot attempts,
  three-point attempts, or free-throw attempts. It supports venue, team, player,
  and confirmed current starters when the slate supplies the lineup.
- NBA Matchup Lab organizes offense against opposing defense, rotations, and
  defense. The recorded game markets remain available in the overview.
- NBA opponent logs show a player's recorded meetings with the matchup opponent,
  or all opponents. Users can choose the available season, venue, and minimum
  minutes. Rows show the recorded team and venue when they resolve from the
  archived team catalog, the result, and hit, miss, or push for the selected line.
- NFL Prop Trends compares recent and earlier results from the selected pregame
  sample and prop market. Its player drill-in includes a game log with a scoped
  opponent option. NFL opponent matching requires the recorded game ID to contain
  the current matchup teams. Historical team attribution after a roster change
  would need additional player-log data.
- Saved filters can be applied, renamed, updated, or removed in NBA Cheatsheets
  and Volume Trends and in NFL MM, Cheatsheets, and Prop Trends. Saved filters
  are scoped to the account and board on the current device. A date-and-game pin
  carries one matchup across tools within each league and reopens it in pregame.
  Research links that require a session offer native sign-in and retain the
  requested destination.
- Existing access checks and archived pregame data remain the source of truth.
  An unavailable snapshot or missing observation is shown as unavailable.
  Available history does not include a complete historical starter flag or
  league-wide opponent-allowed logs by comparable player.

## Reference evidence

Opened the signed-in PropFinder Research board on Devin’s iPad. The visible
board showed Cheatsheets, Trends and Games tabs, injury context, player lines,
book prices, and recent, season and head-to-head samples. Device Hub sent a
visible pointer over the tabs, but the app did not change screens. The Mac web
research link redirected to sign-in. The deeper interaction references came
from PropFinder’s own release notes, including
[board and drill-in updates](https://blog.propfinder.app/release-notes-10-25),
[game pins](https://blog.propfinder.app/release-notes-11-06),
[saved filters and volume](https://blog.propfinder.app/release-notes-11-17),
and [matchup and opponent logs](https://blog.propfinder.app/release-notes-11-24).
Mobbin’s [NBA reference](https://mobbin.com/screens/f38470ec-8fae-46c0-ac27-89bde58b0f3e)
informed the order of matchup, date and minutes in the result row.

## Verification

- Xcode 27.2 simulator and Apple Development iPad builds succeeded.
  The latest SlipSurge Launch QA installed and launched on Devin’s physical
  iPad mini on iPadOS 27.2.1. The signed-in iPad rendered NBA Cheatsheets,
  NBA Volume Trends, and the NBA Matchup Lab for Miami at New York, and NFL
  Prop Trends for Kansas City at Buffalo. The NFL screen displayed the
  recorded pregame cutoff alongside the player samples. Research links
  opened these destinations directly. Launch QA is a separate bundle from
  TestFlight. The mirror moved the pointer without opening Saved filters, so
  physical taps and live window resizing remain to be checked on glass.
- In the signed-in iPhone 18 Pro simulator, saved a Minutes preset, changed
  the metric to field goal attempts, and restored Minutes from the menu.
  Pinned Miami at New York, switched to Milwaukee at Detroit, and reopened the
  original game. Cheatsheets opened the selected FanDuel 15+ Points milestone.
  An empty Knicks opponent sample widened to 17 recorded games with All
  opponents, then narrowed to 16 games with a 30-minute floor. Final rows
  showed recorded opponent labels including at PHI and vs OKC. Verified the
  offense-versus-defense breakdown and game markets. NFL Prop Trends loaded
  the pregame sample and correctly showed an empty Buffalo opponent sample for
  a tested player.
- Twenty-three backend freeze, native MM, and preferences checks passed on the
  existing backend. The separate legacy Court access test fixture did not run
  to completion because its Sideline mock is missing current exports. The
  native changes did not modify that fixture or the Hub.
- Mac-only [visual evidence receipt](/private/tmp/slipsurge-launch.MpPdfJ/evidence/research-visual-evidence.json)
  records the simulator captures and the physical mirror limitation. The
  integrity helper reported the blocked physical interaction and missing local
  iPad image file. The signed-in iPad renders are in the Device Hub tool
  results from this session.

Next pass: walk the PropFinder tabs using physical touch, validate preset
management and player drill-in by touch in both iPad window sizes, and determine
which historical starter and opponent-allowed fields can be supplied by the
existing archive before adding more matchup filters.
