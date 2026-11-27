# Archived team research on iOS

Continue on `codex/ios-parity-20261125` after `420fa9eb`. Keep the primary Mac
Xcode edits and Windows checkout intact. The live Vercel project was READY on
main at `fdfeb1f8` before the preview checkpoint.

## Archive route

- `/api/mobile/research/matchup-archive` requires a verified native account and
  the existing league permission. It reads at most ten prior finals per team
  and their recorded game spread and total. It does not call a collector.
- The NBA odds tape and NFL pregame research archive enforce the saved clock.
  The reader restricts results to dates before the target and keeps each book's
  timestamp. Missing and partial observations remain visible as missing
  coverage. Opening-only NFL quotes are excluded.
- Read-only production archive checks found ten prior finals with game captures
  each for Miami and New York on November 27. They also found Denver at 23.6
  points scored and 21.0 allowed and Pittsburgh at 21.4 scored and 20.1 allowed
  on ten same-season games each before the November 27 kickoff.
- The archive, NBA snapshot regression suite, and Hub TypeScript check passed.

## Native research

- NBA and NFL Matchup Lab → Projection → Last 10 games has separate spread and
  total records for the two teams. Each record displays its graded sample.
  Expand a team to see opponent, venue, score, spread, total and grade. The
  sportsbook benchmark applies separately to each historical game. A game
  without a captured line stays ungraded.
- NFL Matchup Lab retains its existing Overview and adds Projection. It
  averages each offense's recorded scoring with the opponent's recorded
  points allowed. Each side needs four same-season finals and uses up to ten.
  The model excludes lineup, quarterback, weather, and venue adjustments.
  The market comparison uses the existing pregame game-lines endpoint. The
  kickoff cutoff is shown with the scored/allowed averages and samples.
- The new route was deployed to the protected task-branch preview at
  `ee84c84e`. A signed-out request returned a native 401. The iPad Launch QA
  build uses that preview for the archive request and production for existing
  signed-in screens. The QA transport is local to the Mac. The standard app
  uses the canonical site and needs the archive route there for distribution.
  The four-file server change was verified on current main and prepared for
  review in [draft PR #104](https://github.com/dvxcix/SPORTSSITE/pull/104).

## Device verification

- Xcode 27.2 built for iPhone 18 Pro Simulator and Devin’s physical iPad mini.
  Xcode touch automation ran the live signed-in preview at 756 × 1158 and
  375 × 724 points. The corner drag and window controls exercised real
  device resizing.
- Miami–New York showed 10 of 10 archived spread and total lines for each
  team. Miami displayed 4–6–0 ATS and 5–5–0 O/U. New York displayed 8–2–0 ATS
  and 4–6–0 O/U. The Miami game log opened and showed the recorded
  Philadelphia result and graded lines.
- Denver–Pittsburgh showed an approximately 21.8–21.2 pregame projection,
  the recorded market comparison, and both teams’ source averages. The
  history recorded four graded games out of ten finals for each team at the
  tested benchmark. Missing captures stayed ungraded.
- The narrow Inbox check switched Activity and Messages, opened the native
  recipient picker, and dismissed it. The private QA community opened the
  joined Rooms tab and its room. The composer raised and hid the keyboard
  and offered Photo, GIF, and Emoji. The direct Swift grading and NFL
  baseline tests passed. Device captures and the temporary preview
  credentials are outside Git.

The production site is still on main. The remaining release work includes
merging and verifying the isolated archive route on the canonical host,
distribution build verification, and app-wide signed-in coverage.
