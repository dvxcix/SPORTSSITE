# SlipSurge iOS parity baseline

Owner direction, 25 November 2026: bring the existing SlipSurge product to iOS,
including its full tools, data, profiles, imagery, themes and access rules.
Improve the iPhone experience using native capabilities. The website remains
the product specification; this is not authorization to redesign the product
or replace its research with invented data.

Source baseline: `99d15a53d4a8da23dadb8c1c0e4bfcb93a9d74e8` on GitHub main.
Read [shared context](../workspace/CONTEXT.md), [root instructions](../../AGENTS.md)
and the [existing page/tool ledger](../../hub/docs/design/page-by-page-checklist.txt).
This document records the implementation contract and original source audit.
The Mac build checkpoint and acceptance table below describe the current
SwiftUI implementation. The iOS handoff tracks verified behavior and open work.

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

## Integration gaps found in the Cloud audit

The following observations describe the original audit. The Mac build, native
APNs source, and sign-in integration now have separate implementation and
verification records in the handoff.

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

- The GIF picker can attach a validated Tenor or GIPHY image link or upload
  an animated GIF from Photos. Search uses the official GIPHY iOS SDK with
  a native search field and GIPHY attribution. Set the app’s iOS SDK key as
  `SLIPSURGE_GIPHY_IOS_SDK_KEY` in `ios/LocalAuth.xcconfig` or the equivalent
  build setting. Keep local configuration out of Git. A build without the
  SDK key offers link and Photos attachments. The old Tenor API retired in
  June 2026. The SDK requires Xcode 26.4 or later. Review GIPHY’s SDK privacy
  disclosures and production key status before App Store submission.
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

## Original Mac handoff

This chat is attached to Linux Cloud. The owner reports downloading/opening
Xcode; its version, Simulator setup and local checkout are not yet observed.
Use [Mac setup](../workspace/MACBOOK.md), open the repository root in a Mac-local
Codex session, then fetch and resume the task branch recorded in the handoff.
Verify Xcode/Simulator before creating or claiming a runnable native app.
No production secret, migration, deployment, collector or notification send is
needed for this source audit or an isolated UI foundation.

## Mac build checkpoint

The first native target is [SlipSurge.xcodeproj](../../ios/SlipSurge.xcodeproj),
with a shared `SlipSurge` scheme and a minimum deployment target of iOS 17.
Open the project in Xcode, choose the `SlipSurge` scheme and an installed
iPhone simulator, then press Run. On the verified Mac with Xcode 27.2, the
interactive iPhone view is in Device Hub, available from Xcode's
**Open Developer Tool** menu. Use normal Simulator signing so the app can read
its Keychain. The Mac's Xcode run and verification records are in the [iOS
handoff](../workspace/handoffs/2026-11-25-ios-parity.md).

Run the signed build from the repository root.

```sh
xcodebuild -project ios/SlipSurge.xcodeproj -scheme SlipSurge \
  -configuration Debug -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /tmp/slipsurge-ios-derived build
```

The public NBA and NFL research previews and Feed read SlipSurge's hosted
services directly. They need an internet connection. Sign-in uses the same
primary Supabase project, and account changes appear where that website and
iOS share the same account workflow.

## Native parity acceptance

Use the website source inventory and the dated page-by-page ledger together.
A route counts as verified when its mobile interactions, server permissions,
data fidelity and failure states have been exercised for the applicable roles.
Track implementation and live verification independently in the handoff.

| Flow | Current native coverage | Still open |
| --- | --- | --- |
| Visitor and discovery | Public Feed, scores, profiles, communities, creators, records, NBA and NFL previews, native information reader and membership comparison | Remaining public content and interactions, guest flows on compact screens, production checks on newly staged information routes |
| Identity | Email/password, OAuth, Keychain, registration and recovery screens, onboarding, account security, connected providers, export and deletion request | Complete Discord, X and Whop using consenting accounts. Verify email redirects and delivery, signed-device setup and all role gates |
| Research | NFL and NBA slate dates and matchups, Odds Boards, player trends, frozen pregame policies, explicit Live mode, MM, Cheatsheets, First Basket, Slate Edge, NFL Matrix editing and MM matches, My Picks, Watchlist, notes and collaboration | Full board coverage, NBA and MLB Matrices, shared item provenance, other leagues, resume and verification across each role and date |
| Social | Feed, post details and interactions, polls, comments, picks, images, messages, Live Rooms, role-based community settings, notifications, bookmarks and moderation controls | Live write QA with test accounts, community creation, complete media formats, older channel history and physical APNs |
| Membership, creators and admins | Whop checkout for eligible storefronts, existing-plan management, Creator Studio, scheduled posts and member lists, admin previews and review queues | Real checkout and restore, StoreKit and Apple signing, detailed creator and admin operations, full role and write-path verification |

### Local account configuration

Set the primary Supabase project's **publishable client key** as
`SLIPSURGE_SUPABASE_PUBLISHABLE_KEY` in the ignored `ios/LocalAuth.xcconfig`.
Use the simulator's normal Xcode signing for account work so that Keychain is
available. The repository still builds the public research app without account
configuration. Keep account credentials and tokens out of build settings and
the repository.

The Court's native member schedule and board use `/api/mobile/court/*`. The
production routes require a verified bearer account, MFA where configured and
completed onboarding before delegating to the existing tier-gated readers.

Apple's [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
sections 3.1 and 4.8 apply to the subscription and third-party login work.
Verify the eligible storefront, payment/restore test environments and account
linkage before certifying those flows.

### Provider sign-in and local feed review

iOS uses an ephemeral system web authentication session for Discord, X and Whop.
The existing provider callbacks still own profile setup and Whop access checks.
The native callback contains a short-lived sealed handoff, and its redemption
requires the verifier held by the initiating device. The app processes the
result through the same Keychain, MFA and onboarding checks as email sign-in.

The server reports native provider sign-in as available only with a valid
server-only `SLIPSURGE_NATIVE_OAUTH_HANDOFF_KEY` (32 random bytes in unpadded
base64url). Provision and rotate that value using the approved release
workflow. Verify that the hosted OAuth redirect configuration accepts the
native state parameter on the existing SlipSurge callback and exercise all
three providers using consenting test accounts after configuration. The local
unit tests cover wrong proof/state, expiry and tampering.

The signed Simulator builds run against production and have exercised the
public Feed and selected authenticated research, profile, Workspace and
security reads. Testing notes distinguish live reads from sample fixtures and
from member writes. Provider login completion and real-device push remain
open verification items.

### Apple device signing and universal links

The Mac Simulator keeps its existing development bundle identifier. For a
provisioned iPhone or TestFlight build, set `SLIPSURGE_IOS_DEVELOPMENT_TEAM`
and `SLIPSURGE_IOS_BUNDLE_IDENTIFIER` in the Mac’s ignored
`ios/LocalAuth.xcconfig`, or pass them as Xcode build settings in release CI.
Use the identifier registered for this app in Apple Developer and enable
Associated Domains and Push Notifications on that identifier. Configure
`SLIPSURGE_DEVICE_ENTITLEMENTS = SlipSurgeDistribution.entitlements` and the
matching `SLIPSURGE_APNS_ENVIRONMENT` for the provisioned build. The separate
`SlipSurgeDevice.entitlements` remains available for push-only device tests.

Set the corresponding full application identifier (`TEAMID.bundle.id`) as
`SLIPSURGE_IOS_APP_IDS` on the server hosting `www.slipsurge.com`. The public
Apple association route returns an association only for configured app IDs.
OAuth callback, API, admin and creator checkout return paths remain eligible
for their established browser and custom-scheme flows. Verify a supported
feed or matchup link from Notes on a signed physical iPhone and check the
Apple domain diagnostics before recording universal links as verified.

The native target includes the required-reason entries for app-owned settings
and the elapsed-time check used for research freshness. App Store Connect
privacy disclosures and third-party SDK declarations require a release review.

### Scoreboard widgets and notification actions

The `SlipSurgeWidgets` extension is embedded in the app. On iPhone, add
**Scoreboard** from the SlipSurge widget gallery. The small and medium Home
Screen widgets and the rectangular Lock Screen widget support a league selected
in **Edit Widget**. They read the same public, Eastern-date scoreboard as the app
and open the selected matchup in native Game Center. WidgetKit schedules
refreshes. The widget identifies an older in-progress snapshot by its update
time. It uses no member token, App Group, account or Ultimate data.

The extension’s bundle identifier is the app identifier plus `.widgets`. A
distribution build needs both identifiers provisioned under the same paid
Apple Developer team. The widget has no push entitlement of its own.

Onboarding and Alert Preferences show the iPhone’s alert control, separate from
account delivery preferences and quiet hours. Apple alerts group messages,
lineup updates and other activity. Their notification text is generic.
**Mark as Read** and the default tap resolve the ID through the signed-in
member API. For a development test, set the APNs environment and signing
entitlements as described above. Simulator injection can verify the OS
presentation and action; confirm the production APNs provider on a real,
push-entitled device before releasing.
