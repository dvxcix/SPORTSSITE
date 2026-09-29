# September 29: off-day Index and feed posting

## Index

- Production commit: f54a594d7905992de0f844b47a89175d1eb7ed2b.
- A successful MLB schedule response with zero games was marked unavailable.
- Schedule fetching now distinguishes a valid off-day from failed/malformed responses.
- Cancelled games are excluded from officially played final-game checks.
- No score formulas, ranking weights, or advertised/hidden logic changed.
- 18 targeted regression tests passed. Worktree-aware TypeScript check passed.
- Production deployment dpl_GvAKjNbcoEMCBgmPSLukRLJ6ABDT reached READY.
- Re-ran the audit and mechanics precompute using the deployed source locally
  with the existing maintenance DB credentials (production cron secret cannot
  be exported). Recorded trigger: manual-offday-repair.
- Result: four games, 16 snapshots, 114 players with non-null overall Index
  in each of Last 1/3/5/10.

## Feed

- Live composer POST returned HTTP 400. Its payload includes is_spoiler,
  but the production posts table lacked that column.
- Applied the existing post_spoiler_controls migration to production and
  requested a PostgREST schema reload. Live REST schema read now succeeds.
- Member-role transactional text, analysis, poll, repost, unrepost and counter
  checks passed. Separate server-role tracked-pick transaction returned
  picksTracked=true. All test writes were rolled back.
- No separate repost failure reproduced. Browser end-to-end posting was not tested.
- RLS, ownership policies and rate limiting were left intact.

## Not resolved by this repair

- Postseason pitch ingestion remains a separate regular-season-filter issue.
- Stored schedule coverage still counts the cancelled BAL/NYY game as absent;
  the explicit official-day audit no longer blocks today's off-day scores.
- Security advisor returned pre-existing unrelated notices; none were changed.
