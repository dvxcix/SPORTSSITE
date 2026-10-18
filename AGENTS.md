# SlipSurge verified laptop baseline

This checkout is the temporary SlipSurge development home base. The web app is `hub/`; also read `hub/AGENTS.md` for framework instructions.

## Required starting point

- Verified live baseline commit: `6c3811b0882e1b1a6694a30849273f3e210cd69c`.
- Local baseline branch: `laptop/live-baseline`. Subsequent instruction-only commits on this branch are expected.
- Baseline parent: GitHub `main` at `d114e066f2286ad5737c20944d89fb9833e23d9a`.
- Live deployment verified October 17, 2026: `dpl_HkUqZ62VGsvmdyuuexPPbjKCDLz8` in Vercel project `hub`, team `parlaypartys-projects`.
- The baseline preserves nine added files and four modified files from the deployed NFL live score center. Those changes were absent from GitHub main. All 1,384 uploaded files matched this checkout after CRLF/LF normalization.

Before editing, inspect Git status and confirm `git merge-base --is-ancestor 6c3811b0882e1b1a6694a30849273f3e210cd69c HEAD` succeeds. Preserve user changes. Start task branches from this baseline branch or a verified descendant, not from `origin/main` alone. For a new worktree, specify the verified local baseline ref explicitly; do not accept a remote-default-branch starting point silently.

Do not reset, replace, or discard the recovered live-only source. Do not assume a fresh clone of GitHub contains it. If HEAD does not include the baseline, inspect and reconcile safely before editing; do not force a checkout over local work.

Cloud state can change. Before release, refresh GitHub/Vercel state and reconcile any newer approved work. Keep this guard until evidence establishes that the live-only changes are preserved in the canonical GitHub branch, then update these instructions accordingly.

## Operations boundaries

Vercel project ID: `prj_ItG1pVUbVbwWHtdoqBgL5qQVqHlK`; team ID: `team_S2ipF2Ok3Pd45nLq8hmCjYs0`.
Repository: `dvxcix/SPORTSSITE`. Production: `www.slipsurge.com`.
Supabase projects: SlipSurge `hkldweedwnxartkfhror` and legacy MLB dependency `emllcbynioctxkbsdlwp`.

Production collectors and recap exports run in existing cloud services. Do not create duplicate laptop collectors just because the desktop is unavailable. Do not copy or print production secrets. Review and obtain task-specific authorization before deployment, merge to a deploying branch, database mutation, secret change, or job replay. Read-only inspection and ordinary local development may proceed.

## Validation and saved evidence

Baseline typecheck passed and synthetic NFL game-center tests passed 9/9. The earlier general production smoke suite had seven existing source-contract failures (127/134 passing). Do not treat the setup as a full release certification or hide those failures. Run checks appropriate to each change.

Setup and comparison reports are in the enclosing workspace's `outputs/SlipSurge-READY.txt` and `outputs/SlipSurge-live-source-comparison.txt`. Full recovered uploads are in `../vercel-source-compare/live/hub` and `../vercel-source-compare/previous/hub`, relative to this repository root. These are evidence copies, not the development checkout.
