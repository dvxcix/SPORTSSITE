# SlipSurge context

Last reviewed: 24 November 2026. This is the starting context for any computer or
Cloud chat, not a claim that every historical checklist item is certified today.

## Product and design

SlipSurge combines NBA/NFL research, player drawers, odds and market research,
member posts/picks/watchlists, communities and creator memberships. Preserve all
research tools, real player/team/league/book imagery and paid access boundaries.
Use existing site tokens and shared components across desktop/mobile and
Light/Dark. Inspect the actual user flow; avoid duplicate controls, clipped
badges/status, oversized text-only panels or disconnected creator/admin shells.
Use installed relevant design skills and official provider documentation. Keep
internal formulas and infrastructure details out of customer-facing copy.

The signed-out experience must expose limited actual one-game research with real
available data, not an invented board or an immediate sign-in wall. Creators
and communities are different destinations. Creator Studio is a dedicated
business workspace. Free groups are supported; paid creators use self-service
Whop setup with the existing subaccount arrangement. Do not introduce a new 10%
fee. VOLT remains a small floating mascot on phones with its Coming soon teaser;
the AI backend is not authorized merely by this document.

## Repository map

- Web app: `hub/src/`, Next 16.4.6 / React 19.2.4; read the installed Next guides.
- Shared code: `hub/packages/core/`.
- Existing mobile scaffold: `hub/mobile/`, Expo/React Native. Inspect it before
  deciding the iOS implementation; do not assume it is a finished native app.
- Private credential-free UI review: `npm --prefix hub run dev:ui-review`, then
  `http://127.0.0.1:4180/design-review`.
- Current design ledger: `hub/docs/design/page-by-page-checklist.txt`.
- UI inventory/evidence: `hub/docs/design/`; operations: `hub/docs/operations/`.
- Root `AGENTS.md` contains operational identifiers, pregame freeze invariants,
  historical migration state and release rules. Never replay the migration tree.

## Latest published work

Baseline main at setup start: `8d44fc497e729b94ddde79b2da88f6773a338eda`.
Published creator Discord branding sources: `b5ed4808`, `54fbbf57` plus the
`8d44fc49` review receipt. Production was READY on both SlipSurge domains.
See `hub/docs/design/creator-discord-brand-2026-11-24.txt` and its private/live
layout receipts. The shared Discord glyph, connected identity, server/role cards,
member claim/preview and theme-readable Whop mark are implemented.

The prior guided Discord flow and functional multi-role rollout are documented
in `creator-discord-guided-2026-11-24.txt` and `creator-discord-2026-11-24.txt`.
The approved `20261124132320_creator_discord_multi_role` migration is already
applied. Do not replay it. Real creator Discord server installation/role grants
need the consenting creator/member; private fixtures do not certify that step.

Other recent durable records include `nfl-game-markets-2026-11-24.txt`,
`sideline-comparison-2026-11-24.txt`, `community-unified-2026-11-23.txt`,
`unified-experience-release-2026-11-23.txt` and the creator workspace/wallet
records linked by the page ledger. Read the relevant one before altering it.

## Verification and remaining work

The latest Discord correction passed 225 focused checks, scoped lint/TypeScript,
18 private and 12 live creator layout/theme observations, plus the shared mark
follow-up. These are scoped results. Eleven older auth-fixture failures were
recorded on unchanged main; do not hide them or claim complete certification.

Continue from the task-specific handoff and current ledger. Browser checks are
not physical-phone certification. Missing upstream prices/injury/archive inputs
remain honestly unavailable, never zero-filled or presented as fresh. NBA/NFL/MLB
default research stays frozen at the game's start; changing data belongs only
in explicit Live mode. Stale quotes stay blocked; unavailable players do not
lead actionable rankings.

## Work and release boundaries

This setup task authorizes shared repository instructions, setup helpers and a
Codex Cloud environment. It does not authorize production credentials in Cloud,
data migrations, collection replays, role grants, payments or new running jobs.
All collectors stay in their existing cloud services. Do not duplicate them on
the MacBook, this PC or Codex Cloud. Push reviewed source to GitHub; main's
existing Vercel integration remains the production path.

At task completion/device handoff, update a focused note in `handoffs/`, commit
only reviewed files and push the task branch. Refresh main before merging.
Keep credentials in the appropriate local/cloud secret store, not in context
files. Existing browser logins and old local chats remain attached to their host.
