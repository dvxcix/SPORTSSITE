# SlipSurge iOS parity baseline

Owner direction, 25 November 2026: bring the existing SlipSurge product to iOS,
including its full tools, data, profiles, imagery, themes and access rules.
Improve the iPhone experience using native capabilities. The website remains
the product specification; this is not authorization to redesign the product
or replace its research with invented data.

Source baseline: `99d15a53d4a8da23dadb8c1c0e4bfcb93a9d74e8` on GitHub main.
Read [shared context](../workspace/CONTEXT.md), [root instructions](../../AGENTS.md)
and the [existing page/tool ledger](../../hub/docs/design/page-by-page-checklist.txt).
This document is an implementation contract and source audit, not a claim of
native feature completion. No iOS project has been built or run yet.

## Product and backend continuity

- Use the same member identities, Supabase records/storage, saved picks,
  watchlists, communities, membership entitlements and notification history.
  Account/session persistence is per device; do not copy browser cookies.
- Reuse SlipSurge's deployed data services and existing collection pipelines.
  No collector, provider secret, service-role key, settlement worker or privileged
  job belongs in the iOS app. The device must not generate replacement research.
- Preserve exact player/game identifiers, sportsbook identity, selected book,
  line, date, capture timestamp, filters and archived research context.
  Default pregame research remains frozen at game start; explicit Live mode
  stays distinct. Missing inputs and stale/unavailable odds stay explicit.
- Preserve server-side tier checks, RLS, block/privacy rules, creator access,
  account roles and moderation boundaries. Client visibility is not an access
  control. Existing membership verification remains authoritative.
- Swift cannot directly import the TypeScript `@slipsurge/core` package.
  For computations that currently exist only in TypeScript, expose/reuse a
  reviewed server contract or establish a tested sharing strategy. Do not
  independently translate scoring, ranking, grading or tier logic into Swift.

## Appearance and identity sources

| Concern | Existing source | iOS requirement |
| --- | --- | --- |
| Effective Light/Dark palette | `hub/src/app/framework.css`, imported after `globals.css` by the root layout | Derive native semantic colors from the effective cascade, not an older isolated palette. Preserve the member's explicit theme. |
| Base tokens and sportsbook colors | `hub/src/app/globals.css` | Preserve lime fills, semantic status meanings, book/team colors, surface hierarchy and density. Adapt control sizes to iOS accessibility. |
| Typography | `hub/src/app/layout.tsx`, `hub/public/fonts/` | Inspect usable font formats/licensing before native packaging; preserve the hierarchy with Dynamic Type support. |
| Member identity | `hub/src/components/social/MemberAvatar.tsx`, `AvatarDecoration.tsx`, `hub/src/lib/avatarStyles.ts`, `avatarDecorations.json` | Use the member's actual photo, ring/decoration, creator/tier badges and presence. Preserve missing-image fallbacks and Reduce Motion. |
| Player/team identity | `hub/src/lib/nbaPlayerPortraits.ts`, `nflPlayerPortrait.ts`, `hub/src/components/sports/PlayerAvatar.tsx`, `hub/src/app/the-sideline/SidelinePlayerAvatar.tsx` | Reuse verified IDs, source image URLs, existing logos and fallbacks. Never guess by surname or substitute unrelated portraits. |
| Theme selection | `hub/src/components/theme/ThemeProvider.tsx`, `hub/src/lib/appearance.ts` | Match Light and Dark deliberately; do not force an OS-selected theme over an explicit member choice. |

Effective base colors in `framework.css` at this baseline:

| Token | Dark | Light |
| --- | --- | --- |
| Background | `#0c1118` | `#edf0f4` |
| Surface | `#141b25` | `#ffffff` |
| Main text | `#f1f5fb` | `#182331` |
| Accent text | `#b4ff4d` | `#3f6a13` |
| Accent fill | `#b4ff4d` | `#b4ff4d` |

These are observed source values, not newly chosen branding. Component-specific
overrides still need comparison with the actual website before implementation.

## Feature coverage

Keep every website feature in the parity ledger. A first implementation slice
does not remove the remaining features from scope. Inventory includes account,
creator and privileged screens so omissions remain visible; operational endpoints
remain server-side even when an authorized admin screen consumes their results.

| Feature family | Source anchors | Required continuity |
| --- | --- | --- |
| Navigation and discovery | `hub/src/components/layout/navigationConfig.ts`, `hub/review/catalog.json` | Home, Research, Communities, Picks; search, account destinations, context/history and every linked tool remain reachable. |
| NBA / The Court | `hub/src/app/the-paint/`, `hub/src/lib/nba*` | Boards, odds, ladders, player drawers, comparisons, scores, first basket, market history, public data, matchups, trends, availability and slate research. |
| NFL / The Sideline | `hub/src/app/the-sideline/`, `hub/src/app/api/the-sideline/`, `hub/src/lib/nfl*` | Game/TD/props research, odds/books, comparisons, personal TD context, verified finals, injuries, replay and full player detail. |
| MLB / The Dugout and specialist tools | `hub/src/app/dugout/`, `hub/src/components/dugout/`, research entries in navigation | Retain tools, history and seasonal visibility: public/odds, pitcher/batter, weather, slate, synergy, spray charts and recap. Do not manufacture an active slate. |
| Social/member identity | `hub/src/app/feed/`, `profile/`, `hub/src/components/social/`, `hub/src/app/api/feed/` | Profiles, real media, follows, posts, picks, reactions, comments, sharing, spoilers, blocking/privacy and pagination. |
| Picks and saved research | `hub/src/app/picks/`, `bookmarks/`, `activity/`, `missions/`, `hub/src/context/WatchlistContext.tsx` | Existing saved records, grading, watchlists, matrices, sharing and exact research restoration; never create a separate iOS account history. |
| Communities and messaging | `hub/src/app/groups/`, `channels/`, `messages/`, `forum/`, `pages/`, `events/`, `blog/` | Membership and roles, private conversations, replies/media, moderation, free/paid community boundaries and creator/member distinctions. |
| Creator and commerce | `hub/src/app/creators/`, `marketplace/`, `pricing/` | Existing offers, creator workspace, analytics, wallet, connected accounts and entitlements. Assess purchase/restore/account-management behavior against current Apple rules before implementing checkout. Do not blindly embed the web purchase flow. |
| Account and security | `hub/src/context/AuthContext.tsx`, `hub/src/app/settings/`, `hub/src/app/api/account/` | Existing sign-in/onboarding, preferences, connections, security, MFA, blocked accounts, membership and account lifecycle. |
| Notifications | `hub/src/lib/notify.ts`, `notificationDelivery.ts`, `hub/src/app/notifications/`, `hub/src/components/settings/NotificationSettingsForm.tsx` | Same activity history, types, preferences, quiet hours and game priority, with a separate native delivery integration. |

[site-inventory.json](site-inventory.json) records the page and handler files
from this baseline. It is a source index, not a certified API specification.
It does not fully enumerate query-driven tools, drawers, server actions, direct
Supabase/RPC operations, subscriptions or permissions; those must be traced for
each row of the existing page/tool ledger before marking a feature complete.

## Confirmed integration gaps

1. **Native authentication is not covered by every endpoint.**
   `hub/src/lib/requireTier.ts` supports bearer sessions, and the Expo prototype
   sends them through `hub/mobile/lib/api.ts`. Other inspected routes, including
   push registration, poll votes, pick posts and message recipients, call the
   browser/server Supabase client directly. Audit each consumed operation before
   claiming native support. Any extension must preserve cookie clients, RLS,
   account checks, rate limits and existing failure responses.
2. **The existing push transport is Web Push.**
   `/api/push/subscribe` stores `endpoint`, `p256dh`, `auth`; `/api/push/send`
   uses `web-push`/VAPID. These are not native APNs device-token contracts.
   Add native delivery to the existing notification event model, rather than
   inserting duplicate activity or reusing a browser subscription as an APNs
   token. Native registration, ownership, token rotation/logout, delivery
   attempts and revoked-token cleanup need a reviewed backend design.
3. **Native deep-link association is not established by the audit.**
   No existing Apple association file, native entitlements or iOS app target was
   found. Reuse canonical SlipSurge content URLs and exact context parameters;
   validate host/path and route through one app router. Universal Links require
   an app/domain association and cannot be claimed from URL parsing alone.
4. **The existing mobile app is a prototype.**
   `hub/mobile/App.tsx` contains sign-in plus an API-call button; `app.json`
   still has generic mobile identity. Its TypeScript check passed, but there is
   no verified native product shell, APNs integration or Xcode build. A SwiftUI
   implementation is recommended; the owner has not explicitly selected the
   framework yet. Preserve the Expo scaffold while that decision is resolved.

## Native behavior and verification

- Secure session persistence/refresh, logout cleanup, foreground revalidation
  and cross-account cache isolation. Load authorized data before restoring a
  protected destination after login.
- Native navigation history, sheets/player details, keyboard-safe composition,
  share sheets, photo selection, safe areas, accessible touch targets, VoiceOver,
  Dynamic Type and Reduce Motion using the existing brand and content.
- Contextual notification permission; foreground/background handling, badge
  synchronization, per-device opt-out and cold/warm notification-tap routing to
  the exact message, post, player, pick or game. Preserve recipient preferences,
  timezone/quiet hours and game-priority semantics. Registering permission is
  not evidence that a remote notification was delivered.
- Never promise continuous background refresh: iOS schedules background work.
  Preserve last-observed timestamps, stale states and refresh on foreground.
- Test real APNs delivery and notification lifecycle on a consenting physical
  device in a dedicated development/test setup. Local simulated notifications
  and a successful Simulator build do not certify remote delivery.
- Use the SwiftUI UI Patterns skill for navigation/state and its deep-link
  reference; use the iOS Debugger Agent skill for Mac build/run/UI evidence.
  Apply performance and Liquid Glass skills when those concerns enter an
  implementation, while retaining SlipSurge's identity. App Intents are a later
  optional system integration, not a substitute for app functionality.
- Follow `docs/workspace/SKILLS.md` for the owner's design skills on the Mac.
  Install/read the relevant actual skills before applying them. Their presence
  in Cloud does not establish installation on the Mac.

Build and verify feature slices while retaining full product scope. For each
slice record its website reference, API/session contract, identity/theme match,
loading/empty/error/offline behavior, access/privacy checks, simulator evidence
and any necessary physical-device evidence. Fixtures must stay labeled and
isolated; production views must use the actual authorized site data.

## Immediate Mac handoff

This chat is attached to Linux Cloud. The owner reports downloading/opening
Xcode; its version, Simulator setup and local checkout are not yet observed.
Use [Mac setup](../workspace/MACBOOK.md), open the repository root in a Mac-local
Codex session, then fetch and resume the task branch recorded in the handoff.
Verify Xcode/Simulator before creating or claiming a runnable native app.
No production secret, migration, deployment, collector or notification send is
needed for this source audit or an isolated UI foundation.
