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
- The numeric and NBA snapshot regression suites passed. The signed-in Vercel
  route and physical device verification are part of the next checkpoint.
