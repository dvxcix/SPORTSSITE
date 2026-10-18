# SlipSurge development and operations

GitHub repository: dvxcix/SPORTSSITE. Web app: hub/. Production: www.slipsurge.com.
Approved work belongs on GitHub main. Refresh origin/main and live Vercel state
before changes/releases; do not leave released source only in CLI uploads.
Main reconciliation in this change preserves recovered live NFL source and all
approved resume releases. Required ancestry: 6c3811b0882e1b1a6694a30849273f3e210cd69c.
Inspect git status and preserve unrelated local work before editing. New task
branches use codex/ and start from verified current main or its descendant.
Read hub/AGENTS.md for framework guidance.

Vercel: hub / prj_ItG1pVUbVbwWHtdoqBgL5qQVqHlK.
Team: parlaypartys-projects / team_S2ipF2Ok3Pd45nLq8hmCjYs0.
Supabase primary: hkldweedwnxartkfhror. Legacy MLB emllcbynioctxkbsdlwp is out of scope.
Existing collectors and recap exports run in cloud services; do not duplicate
on the laptop. Never print or commit secrets.

Production deployments, database mutations, secret changes and job replays need
task-specific user authorization. The current task authorizes main reconciliation,
the reviewed three-file banner fix, and sequential remaining reviewed database
repair batches with live preflight and verification. Do not infer authorization
for unrelated jobs, feature enablement, payments or destructive resets.

Batch 1 is already applied as 20261018004741_restore_member_core_live. Its SQL is
tracked for history; do not replay it or the entire historical migration tree.
Database history diverges from local history: apply only individually reviewed
repairs, with guards and recorded migration names. Preserve existing flags.
Historical activity backfill is separate from schema repair; review before replay.

Resume automatic saving is verified. Physical phone restore was not verified;
the owner now prefers PC browser verification. The reviewed banner fix uses a
defined stacking layer and refreshes remote offers when an existing tab returns.
Do not claim end-to-end restore until real browser verification passes.

Baseline NFL tests passed 9/9. General smoke suite had seven existing source
contract failures (127/134); do not hide these or call this full certification.
Evidence and reports are in the enclosing workspace outputs directory.
