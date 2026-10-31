# MLB off-season retirement and 2027 return

The owner requested that MLB collection stop for the 2026–27 off-season and
that retired MLB tools and historical data be accessible only to administrators.
Preserve the existing data, other sports, member accounts, and original capture
times throughout retirement and reactivation. Do not replay old observations,
bulk retry queued messages, or expose data by merely hiding navigation.

## What is paused

- `MLB_HIBERNATING` in `hub/src/lib/mlbOffseason.ts` stops the MLB-only cron
  handlers, direct collectors/importers and live-source routes, and suppresses
  MLB work in shared jobs. NFL and NBA jobs remain enabled.
- The 36 removed Vercel schedules and their former UTC times are recorded in
  [mlb-offseason-schedules-2026.json](mlb-offseason-schedules-2026.json). The
  first 32 were paused on October 27; four additional archive/model and contact
  processing schedules were removed for this retirement. This is an inventory,
  not a recommended 2027 schedule.
- Primary Supabase pg_cron job `compact-pregame-odds-history` (job id 3,
  `17 */2 * * *`) was set inactive after identity and command preflight. Its
  job definition and history remain. It only compacts the MLB pregame history.
- Primary migration `20261031154624_mlb_offseason_admin_visibility` (tracked
  source `20261031153027_mlb_offseason_admin_visibility.sql`) adds restrictive
  admin-only SELECT policies to 24 baseball-only relations, including the
  directly accessible 2026 pitch-log partition. Existing grants, permissive
  policies and service-role access are retained. Do not replay this migration.
  This does not by itself restrict mixed-sport tables, user favorite columns or
  shared RPCs; those require separate review when assessing direct API access.
- Primary migration `20261031155149_mlb_offseason_mixed_visibility` (tracked
  source `20261031154942_mlb_offseason_mixed_visibility.sql`) adds restrictive
  SELECT policies to eight shared social and creator tables, including nested
  MLB pick legs. The existing permissive policies remain, and the admin
  exception does not expand owner-only access. The policies do not redact MLB
  values from public profile favorite columns or cover privileged RPCs and
  service-role routes. Direct INSERT behavior also requires separate review.
  Do not replay this migration.
- MLB slate retries, contact alerts and recap exports are retained, not sent;
  scheduled MLB posts, MLB grading and MLB watchlist auto-archiving are paused.
  Review old pending items individually before enabling any replay or delivery.
- MLB-only pages and APIs are restricted to administrators; hibernating routes
  that would call live sources fail closed. The admin archive view reads only
  saved primary-database data. Missing archives/cutoffs stay unavailable.
- Public MLB marketing copy was removed in several places and requires an
  editorial review during the 2027 return; the switch does not restore that copy.

## 2027 reactivation checklist

1. Refresh GitHub `main`, production deployment and database state. Confirm the
   2027 season dates, supported markets, billing and provider limits. Review
   changed provider schemas and authentication; never place secrets in this file.
2. Audit the 36 historical schedules individually. Reintroduce only the needed
   MLB jobs, with measured cadence, bounded concurrency, explicit failure
   cooldowns, Browserbase spending controls and a staged rollout. Keep NFL/NBA
   schedules and their limits unchanged. Do not turn the old high-frequency
   schedule on wholesale.
3. Review the paused queue and stale scheduled posts/recaps with the owner.
   Preserve uncertain delivery state; do not blindly replay messages or captures.
4. Test saved/admin data, current players and 2027 rosters; restore only verified
   sources. Captures must retain first-observed openings, exact quote timestamps,
   true movements and pregame/live separation. Never manufacture a history or
   replace missing prior data with current prices.
5. Review [mlb-2027-restore-access.sql](mlb-2027-restore-access.sql) and restore
   access in the reverse of the retired database policies after authorization,
   change `MLB_HIBERNATING` only in a tested Git release, and restore intended
   navigation, feeds, selection controls and marketing copy. Keep admin access
   and ensure public MLB data is exposed only when the 2027 release is ready.
6. If historical compaction is useful again, preflight the exact primary job
   name, id, schedule and function. Re-enable its existing job with
   `cron.alter_job(job_id := 3, active := true)` only after authorization and
   live verification; do not create a duplicate or modify historical rows.
7. Review the Discord `/slate` command's actual registration and desired 2027
   definition before targeted re-registration. Preserve unrelated commands.
8. Run authentication and direct-API tests for admin/member/anonymous, saved
   data and shared NFL/NBA flows; test source and queue pause controls. Verify
   the Git production deployment, aliases, active schedules and natural
   captures, then confirm representative member-visible opening/movement data.

This document records the intended controls. Confirm actual deployment, applied
database policies, external command state and production evidence in the release
report before assuming a control is live.
