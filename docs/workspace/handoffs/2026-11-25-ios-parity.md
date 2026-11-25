# SlipSurge iOS product continuity

- Date: 25 November 2026
- Task branch: `codex/ios-parity-20261125`
- Source baseline: `99d15a53d4a8da23dadb8c1c0e4bfcb93a9d74e8`
- Scope: iOS parity/source audit and Mac implementation handoff; no product code
  changed and no native app build claimed.

## Owner direction

Bring the full SlipSurge website experience to iOS: its actual tools, backend
data, accounts, profiles/headshots, themes and functionality, improved for iOS
interaction and native capabilities such as notifications. Use proper relevant
skills. Do not substitute a generic mock app or duplicate the research system.
The owner is on a Mac and reports downloading/opening Xcode. This conversation
still executes in Linux Cloud and cannot inspect or control that Mac's Xcode.

The owner also has Codex open on Windows and wants one continuous project with
Windows as the web/Android hub and Mac for iOS. Follow [the device workflow](../DEVICES.md).
Keep decisions/checkpoints available through GitHub; do not promise automatic
conversation or unsaved-file mirroring. This workflow is saved on the iOS branch;
other task sessions can fetch/read it without replacing their own checkout.

## Concrete audit

Read [the iOS baseline](../../ios/README.md) and its complete page/handler source
index before implementation. The site feature ledger remains canonical for
panels, query-driven tools and dated verification evidence.

Findings: some backend routes already accept bearer sessions through requireTier,
others still use browser-cookie clients. Existing remote push is Web Push/VAPID,
not APNs token delivery. Reuse the notification records/preferences and add a
native delivery design. No Apple association file or SwiftUI app target was
found. The active framework stylesheet overrides older global colors; preserve
its effective Light/Dark palette, real photos and identity metadata.

Existing Expo app is a sign-in/API prototype. Its TypeScript check passed in
Cloud before this documentation-only branch. Neither Expo iOS nor SwiftUI was
built. SwiftUI was recommended; the framework choice has not been explicitly
answered. Preserve the scaffold until that is resolved.

## Skills and next work

SwiftUI UI Patterns and its deep-link reference were read for the architecture;
iOS Debugger Agent establishes the Mac build/run verification path. App Intents
was consulted for possible later system entry points, not implemented. Read the
actual relevant owner-requested design skills from ../SKILLS.md on the Mac.

Open a Mac-local Codex project at the SPORTSSITE repository root. Fetch and resume
this branch, preserving existing local work. Verify full Xcode and an installed
iOS Simulator runtime; no Apple tools are available in this Cloud task. Confirm
SwiftUI versus extending Expo, then implement the shared identity/design and
session/data foundation plus a first real research workflow. Completing a first
slice does not remove any remaining feature from the full parity scope.

No app logic, API behavior, schema, production credentials, website deployment,
collector, Discord grant or member notification was changed or run. Publication
of the earlier Cloud environment does not supply a Mac/iOS build environment.

## Mac implementation checkpoint · 25 November 2026

- Continued `codex/ios-parity-20261125` from Cloud checkpoint `c2f4a07b` after
  fetching. Verified the branch descends from current main `99d15a53` and
  retains the required recovered NFL ancestry. The latest Vercel production
  deployment for that main commit was READY. The Mac's main checkout was clean
  before switching. Windows-local work and its recovery branch were untouched.
- Chose SwiftUI for the first native slice, with an iOS 17 minimum and a
  development-only bundle identifier. The Xcode project and shared scheme live
  in `ios/`. The original Expo prototype remains available in `hub/mobile/`.
- Implemented the signed-out Sideline odds preview. It uses the deployed
  read-only `/preview/nfl/data` dispatcher with
  `resource=/api/the-sideline/odds-board`. The backend chooses the single game
  and enforces the preview scope. The app renders the returned exact game,
  market, sportsbook, lines, prices, observation timestamps and real artwork.
  It uses the existing Light/Dark colors, native pickers, a local appearance
  preference and unavailable/retry states. Upcoming quotes are revalidated at
  the server proof's freshness limit or scheduled start, whichever comes first.
- Built with Xcode 27.2 (27B52), without distribution signing, and installed and
  launched on an iPhone 18 Pro running iOS 27.2. Observed real TB at CHI
  (8 November 2026) with logos, Colston Loveland's headshot and FanDuel
  receiving-yard prices in Light and Dark. The public endpoint returned 140
  FanDuel and 229 DraftKings receiving-yard quotes for the same matchup.
  The alternate sportsbook was checked at the endpoint. Picker interaction,
  timed future-game revalidation, denied/unavailable branches and accessibility
  still need Simulator interaction coverage.
- No API, schema, shared web code or production configuration changed. The
  default research reader remains the existing server implementation. The
  public preview uses no member session. No account, permission or notification
  flows are certified by this checkpoint.

Next milestone: implement and verify native session handling and one
member-only research route using the existing bearer contract. Trace secure
persistence, refresh, revocation, account-switch isolation and server-side tier
checks before expanding to saved research and social features. Keep the full
parity ledger in scope. APNs provisioning, owned device registration, native
routing and real delivery still need implementation and physical-device
verification. The installed SwiftUI UI Patterns and iOS Debugger Agent skills
guided this slice. The owner-listed web design skills were absent from the
Mac's personal skill directory and were not applied to this native screen.

## Xcode and Device Hub review · 25 November 2026

- Mac-local branch `codex/ios-parity-20261125`, app source checkpoint
  `5dbfa649fa8fc9432a541efc82ddd0bd637af4e0`. Opened
  `ios/SlipSurge.xcodeproj` in the Xcode GUI, used Run with the SlipSurge
  scheme and iPhone 18 Pro destination, and verified the debugger attached.
  Opened the iPhone simulator window in Device Hub for owner review. The
  earlier build used `xcodebuild` and `simctl` from the terminal.
- Verified the sportsbook interaction in Device Hub. Switching TB–CHI
  receiving yards from FanDuel to DraftKings kept the matchup and changed
  Colston Loveland's 20-yard price from −1450 to −720. Timed refresh,
  denied/unavailable states and accessibility still need coverage.
- Installed the owner-requested local Codex skills from their named upstream
  repositories: `swiftui-pro`, `developing-ios-apps` and `mobile-ios-design`.
  Verified that each installed directory contains its `SKILL.md`.
- GitHub read/write, primary Supabase project metadata read and Vercel
  production deployment read were verified from the Mac Codex session.
  Mobbin screen, flow and collection tools are available in this session.
  Apple team signing and APNs delivery are independent follow-ups.
- The Mac is the iOS development and interactive review workstation. Cloud
  and Windows can retrieve the pushed checkpoint and handoff. Windows stays
  the web/Android development workstation. The full site remains in scope for
  native parity, including accounts, access rules, live and frozen research,
  saved work, social/creator features and notifications. The next code
  milestone is native session handling and one member-only research flow.
  This review checkpoint changes documentation only.

## Native account and research checkpoint · 25 November 2026

- Scope confirmed by the owner: complete website parity with phone-sized SwiftUI
  flows across guest, regular, Ultimate, creator and admin accounts. Covers
  authentication with Discord, X and Whop, payments, social/feeds, all research
  and existing brand/team/player/sportsbook artwork. See the native acceptance
  table in `docs/ios/README.md` and the full web source inventory and page ledger.
- Implemented native Home, Research and Account navigation, configured email
  sign-in for the Mac's development build and added Keychain persistence,
  serialized renewal, TOTP challenge handling, sign-out and the website's
  existing onboarding check. External registration, recovery and browse links
  remain available while native work continues.
- Added The Court's scoped pregame preview, including real team artwork,
  roster, player details, observed averages and sportsbook prices. Added
  site-sourced primary and secondary gradients, portraits and sportsbook logos
  to the Court and Sideline. The member Sideline client uses the existing
  protected odds endpoint. Added branch-only aliases for the member Court
  schedule and board, with account, MFA and onboarding checks ahead of the
  original tier-gated readers.
- Simulator: signed Debug build and launch on iPhone 18 Pro / iOS 27.2.
  Observed the saved Detroit–Orlando snapshot and John Collins's team artwork,
  11.1 points average and the FanDuel 12.5 line (over −102, under −125).
  Verified one synthetic invalid login shows the native error and clears the
  password. The Simulator Keychain initializes with simulator-only signing
  entitlements. No successful member login, refresh/logout round trip or
  actual authenticator challenge has been claimed.
- Server fixtures verified native Court rejections and exact delegation, and
  the existing public workspace checks still pass (8 total). The unchanged web
  production source smoke suite passed 134/134.
- Backend aliases have not been deployed. No production database, payment,
  access grant, connected-account setting or notification delivery was changed.
  The user can enter an existing account directly in Simulator if available for
  a positive check. Never request credentials through chat.
- Continue with real member verification, secure native Discord/X/Whop handoff,
  the public/member feed and remaining parity ledger. The web cookie feed
  pagination endpoint responds 401 for signed-out callers. Reuse its existing
  RLS, filtering and spoiler rules in a bounded native read interface before
  certifying the guest or member feed.

## Native feed, providers and account surfaces · 25 November 2026

- Continued from account and research checkpoint
  `e37930f0fe70c70b09f940612ef2e74439aefd01`. Added a native Feed with Latest,
  Top and Picks for guests, Following and cursor pagination for signed-in
  members, and NBA/NFL selection. Preserves the source visibility and
  two-way-block filtering, stable repost identity, spoiler reveal, real
  post counts and public share links. Added native text, analysis and poll
  composition with a stable draft ID, plus server validation of audience,
  ownership and retry identity. Pick and media composition, votes, reactions
  and native post detail remain open.
- Local end-to-end guest check: Next 16.4.6 on loopback with the primary
  publishable client key returned HTTP 200, 12 public posts across text,
  poll and parlay, no guest cursor, and HTTP 401 for Following. A separate
  build displayed real rows in Device Hub and switched from Latest to Picks.
  The guest Picks route returned eight visible parlay posts.
  The local transport override is outside the task branch. No fixture or
  collected feed data is committed.
- Added the SwiftUI system-browser sign-in handoff for Discord, X and Whop.
  The existing website provider flows remain intact. The server seals a
  short-lived, proof-bound handoff and uses a one-use Supabase exchange. The
  app then performs its existing MFA and onboarding checks. Live provider
  sign-in still depends on the reviewed server release, an authorized
  handoff-key configuration and provider/account tests.
- Added the native Profile & Membership read view and basic-tier Notifications
  inbox, with read, filter, mark and confirmed removal actions. Their adapters
  reuse the server's verified account, MFA, completed onboarding and existing
  subscription access policy. No production membership, payment or inbox was
  altered. Creator/admin action screens and device push are still open.
- Ran the signed build directly from Xcode. The Court opened Detroit–Orlando
  in saved Pregame research, showed the observed 89–73 score only after
  selecting Live, and returned to the score-free frozen snapshot. Added the
  existing SlipSurge app icon to the native target. Hub TypeScript and 165
  focused and production-source checks passed. Live checks were scoped to public read data and
  synthetic rejected login. Local auth status correctly reported unavailable
  without its server key, exchange returned 503, and guest notifications
  returned 401. These checks do not certify authenticated or payment flows.
- Next: verify provider and member flows through an authorized staging setup.
  Continue native composition and social interactions, onboarding and recovery,
  full research/tool parity, and creator/admin UI. Commerce needs actual Apple
  products and a reviewed entitlement bridge for the existing Whop accounts.
  See the acceptance table and Apple guidelines link in `docs/ios/README.md`.

### Preview build receipt

Vercel's Git integration built source checkpoint
`0a4ba3fa738dc0d225f0cd43fb7892308f82cd3b` as the protected branch preview
`dpl_8n2uPwMkjXz6dnbMhLVub8wjSyyL` and reported READY. Guest feed runtime was
verified locally. Protected preview HTTP and real signed-in roles remain
unverified. Production still reports READY at its main baseline `99d15a53`.

The Mac has the project open in Xcode with the standard build running on
iPhone 18 Pro in Device Hub, left on The Court's Pregame screen. The temporary
Mac-local feed server was stopped after verification. The Mac reports zero
valid Apple signing identities. TestFlight and physical-device push need
device signing, and payment testing needs the Apple product configuration.

## Native research boards and slate selection · 25 November 2026

Checkpoint on `codex/ios-parity-20261125`, based on `e2dc4d9b`.

- Research leads to The Sideline and The Court. Home no longer duplicates the
  research promotion. Public previews retain the one matchup selected by the
  server. The full workspaces use the existing account and entitlement checks,
  including NFL early access. A preview remains reachable if the member read fails.
- The signed-in screens have a native calendar, day arrows and team-logo matchup
  buttons. Dates use the Eastern slate day. Court keeps the board on the same
  screen while changing matchups. The new authenticated Sideline schedule reader
  follows the site's initial NFL date and returns an exact empty slate for an
  off day. It reads through the existing account and NFL access checks.
- The Court's Player Board has player search, market, sportsbook and Over/Under
  selectors, a reference line with the observed sportsbook price, its baseline,
  and L5/L10/L20 results. The calculation follows the site's reference selection
  and excludes pushes from decisions. Pregame uses the saved snapshot once tipped.
  Explicit Live mode continues to use the corresponding live reader.
- The Sideline Game Day shows moneyline, spread and total by sportsbook. Props
  group verified prices in one expandable player row, with historical opening
  and prior prices when present. The Odds Board also shows the other games on the
  selected slate. Game markets and dates remain usable when player quotes fail.

### Verification and next work

- Xcode 27.2 built the SlipSurge scheme and installed it on the iPhone 18 Pro
  simulator. The real Court preview changed modal market selection from Points
  to Rebounds and recalculated the displayed line and hit rates. Player detail
  kept the selected sportsbook and market. The real Sideline preview switched
  from FanDuel TB/CHI moneylines +220/−270 to DraftKings +240/−298 and showed
  grouped Receiving Yards from the public board.
- Device Hub confirmed the date arrows and graphical calendar. A separately
  installed test build supplied two controlled Court matchups and an empty
  date. Selecting the second matchup replaced the board, Next day cleared it,
  and Previous day restored the first real fixture's player rows. That test
  build was removed. The standard build still uses SlipSurge's actual readers.
- Hub TypeScript, 143 native access, public scope and production-source tests,
  and Git whitespace checks passed. The native Sideline tests cover anonymous
  denial, native onboarding and entitlement checks, exact off days, the default
  slate, invalid dates, no cache and schedule failure.
- Both standard-build member slate requests reached the retry state in the
  local simulator. End-to-end Ultimate, NFL early access and real multi-game
  slate verification require a working authorized backend environment. The
  branch adds the NFL mobile readers. Production was not deployed.
- Continue Court MM, the remaining proprietary boards, historical timelines and
  saved picks from the web implementations. The remaining role-specific flows,
  community and creator/admin workflows, production OAuth and payments,
  and physical-device notifications remain tracked in `docs/ios/README.md`.

### Research preview receipt

Vercel's Git integration built `1ea85c5ff311b813c557346573580f7bfaba64e5`
as the protected Preview `dpl_HVnJajnBG13NCQ3Eam9L4sWYqZK5` and reported READY.
Production returned 404 for the mobile account and Court/Sideline slate routes
with an invalid test bearer. That confirms the standard build's production host
is unsuitable for verifying member reads from this branch. This Mac session had
no existing CLI or short-lived Vercel credential for testing the protected
preview over HTTP. The standard build remains open on the real Court public
preview in Device Hub. The Cloud continuity chat received the code checkpoint.

## Released member backend and native research tools · 25 November 2026

- The owner authorized the narrow live backend release and enabling Discord, X,
  and Whop. PR #9 landed on main as `020603d73f474e82a869265a448e03b18fd4cff7`.
  Vercel Preview `dpl_5suz3GbuhRcVYZJ7LePu8rEVmEMt` and production
  `dpl_61D1VtYf5tRqXzCrg35c63TtTL7g` reported READY. The dedicated native OAuth
  handoff secret is configured as production-sensitive in Vercel.
- Live native account, NBA schedule/board/Odds Board, and NFL schedule/market
  returned 401 for an intentionally invalid bearer instead of 404. OAuth status
  reported available, rejected an invalid exchange with 401, and sent each
  provider's native start to the real Discord, X, or Whop site. The App Account
  screen showed all three options and opened each provider in iOS's web
  authentication session in a temporary fresh build. The temporary build was
  removed. No test account was used to finish the provider authorization steps.
- Public Home, web sign-in, Feed, Pricing, health, and both web previews kept
  their baseline responses. Signed-out protected research still redirected
  to login. Hub TypeScript and 146 auth, MM, public scope and web source tests
  passed. This release contained no client web UI, database, payment or job changes.
- The updated Xcode build on the iPhone 18 Pro restored the existing member
  session. NBA switched from the three-game 24 November slate to the nine-game
  25 November slate. The NFL calendar loaded the 8 November archive and selected
  TB at CHI from 13 games, and the default schedule loaded GB at LA. The NBA and
  NFL Odds Boards displayed real lines, opening comparisons, movement and team
  artwork. The NBA price-history sheet displayed saved observations.
- Court MM reused the existing ranking engine for the exact scoped game,
  observation, market and sportsbook. Device Hub showed John Collins at MM +2
  with book rank 9 and production rank 7 for points. NBA Matchup Lab and
  Availability, and NFL The Public and Sportsbooks, were exercised against the
  real saved team analytics, injury listings, public counts and source prices.
  The app remains open on the signed-in Court Odds Board.

Remaining parity includes the rest of the proprietary tools, including
Cheatsheets, NFL MM and Matchup Lab, NBA First Basket, Slate Edge, Cross-market,
and the complete pick and publishing flows. The Court Availability screen
currently supports all players, injury listings and draft class. The NFL Public
screen displays captured counts and shares; its full outcomes and ladders still
need porting. Real-account OAuth callbacks, role-by-role tests, payments and
physical-device push are still open.

## Native research and sign-in design checkpoint · 25 November 2026

- Task branch `codex/ios-parity-20261125` carries the signed SwiftUI build. The
  existing member app and `SlipSurge Sign-in Test` use separate Keychain
  identities. The test copy opens the real production Discord, X, and Whop
  flow from Account. Branded marks come from SlipSurge source. Whop uses
  orange, with native Liquid Glass for Discord and X. The owner's full
  provider callback checks are still pending.
- Reviewed the live login and both public workspaces at 390 CSS pixels.
  Compared targeted player-chart and logo-filter references in Mobbin.
  Native work follows SlipSurge's team palette, artwork, and product labels.
  The Court now has First Basket, Cheatsheets, Slate Edge, and player trends
  with exact line selection, hit/miss/push colors, L3/L5/L10/L20 and a per-game
  plot and log. The Sideline now has MM, Slate Edge, and Cheatsheets with
  Market Edge, Exact Lines, Explosive Plays, Run Gaps, Defense vs. Position,
  and recorded player trends. Research selectors add press feedback and
  respect Reduce Motion. Book and team sheets display their source marks.
- Xcode built the signed Debug app on iOS 27.2. On the separate iPhone 17e,
  Device Hub loaded the real Detroit at Orlando pregame board. Opened
  Collins, applied his 11.5+ line at Bally Bet, and inspected the colored
  form bars and dated hit/miss log. Opened First Basket, selected FanDuel
  using its logo, and switched to saved history with 20/20 games covered.
  Those were production public responses. The signed-in role and complete
  provider credentials were not exercised at this checkpoint.
- Narrow backend PR #10 has reviewed source `11ba9b40559467b3a4807bde2e0ccf7319b1b7d9`.
  Protected Vercel preview `dpl_3dd1HY58jdpSynGhpGyiE9Vxh3er` reported READY.
  TypeScript and 147 auth, NBA, public scope, and web checks passed. The NFL
  odds/context run passed 104 checks and one integration fixture failed before
  tests because esbuild could not resolve `server-only` and
  `@opentelemetry/api`. The identical error reproduced against the unchanged
  main commit. No migrations or historical replays were run.
- Next work includes authenticated verification of all new boards, native
  Feed and post interactions, replacing the old Home shortcut list with
  native destinations, remaining Court and Sideline tools, account lifecycle,
  community and creator operations, administration, payments, and physical
  push verification.

## Native Feed, Discover, account, and deeper Court checkpoint · 25 November 2026

- PR #10 merged as `5d49efd5df2d9ed9c1c36debe4cb419c9c9ce387`. Production
  `dpl_2NeXbkcYX8itKrcA1GefoJQ6MvmV` reported READY. A signed-in iPhone 18 Pro
  simulator exercised real NBA Cheatsheets and Slate Edge. The existing
  account loaded Franz Wagner's 70% form, +3.9 form gap and Slate Edge score
  of 76 from saved production observations. The new NFL tools still need an
  equivalent authenticated interaction pass.
- Native Feed is the initial tab. It has a composer, a post and threaded
  comments view, reactions, polls, reposts and bookmarks. Discover has native
  scores, community membership and invitations, creator discovery and follows,
  and member records. The old Home shortcut list was removed. The canonical
  web queries and views still back both apps. PR #11 deployed the social
  endpoints from `64fa7eeae67a6314d3bf9ff51b0f137d3fc51f29`, production
  `dpl_5XeLm8HCBtVkGgCCGvKCmDNU6hYV`. PR #12 routed the narrowly scoped guest
  reads from `3eb6af9c109a9cf804954e5afca2fb5b5f8e024c`, production
  `dpl_54zKfjuM8BBKfGTT3Rg6J9T97mq1`. On production, guest Feed returned 12
  posts, a public post returned three comments, the Nov. 25 scores included
  nine NBA games, and all three Discover resources loaded. A malformed member
  token and an unauthorized post write both received 401. Desktop sign-in,
  Feed, Groups, Creators, Sports, Leaderboard, Pricing and both preview routes
  returned 200. The signed-out build displayed real Feed cards on iPhone 17e.
- Task-branch source adds native email registration and reset forms with PKCE,
  account onboarding and preferences, role-gated Creator Studio and Admin
  overviews, Whop membership and checkout access for the U.S. storefront,
  and Court Intelligence, Starting Lineups, The Public and Cross-market.
  Signed Debug built under Xcode 27.2 and iOS 27.2. Hub TypeScript and 192
  focused auth, visibility, board, frontend contract and billing checks passed.
  The account, billing, role and extended Court endpoints in this checkpoint
  have not deployed. No purchases, cancellations, emails, messages, other
  member mutations, database changes or historical replays were performed.
- Remaining device checks include owner-completed Discord, X and Whop OAuth,
  live native email redirect allowlisting, role permissions, and physical
  push delivery. Direct and group messages, deeper play-by-play, the full
  publishing and creator/admin workflows, App Store purchases, and remaining
  research and account controls still need implementation and verification.

## Native messages, branded picks, and NFL player access · 25 November 2026

- The previous signed build checkpoint is `ff272c5f320efbc9a8032f7ecdc57a511c5232ec`.
  Its handoff was sent to the existing Codex Cloud chat.
- PR #13 deployed Court Intelligence, Starting Lineups, The Public and results,
  Cross-market and saved estimates from `cb414e44f311ac9ba56777f345599a41c3d8958c`.
  Preview `dpl_AabyX9QCcniGGZbCeHmm4dpBJhpV` and production
  `dpl_BxQypJjD17N2LiG9kHzik1P5BJgx` reported READY. All six production requests
  rejected an invalid token with 401. Desktop login, Feed and both research
  previews still returned 200. Signed-in visual checks remain open.
- PR #14 merged account and membership APIs in `e8c36c450471987896d205a7d0329298e0f4432a`.
  Preview `dpl_3axy6qek7Xd85UPuAEXsDJMMpG5M` reported READY. Production
  `dpl_J1HxEX4xRziHbMG1WJubmp2uot6H` was still building when this was recorded.
  Whop billing uses the existing server attribution and webhooks. Live email
  registration and reset depend on confirming the Supabase redirect allowlist.
- The task branch now includes native direct and group messages, member search,
  group creation, requests, text replies and edits, reactions, direct pins,
  group membership controls, and existing image display. It reuses the site's
  inbox and RLS policies. The thread refreshes while visible. Live typing,
  forwarding, native attachments and live member-to-member QA still need work.
  Notifications deep-link to in-app posts, messages and community invitations.
  The native Bookmarks screen uses the same Basic membership gate as the web.
- Feed pick cards now render saved league, player and team assets, team palettes,
  sportsbook marks, quoted prices and result colors. NFL MM opens the exact
  player's saved-game chart with the selected sample and sportsbook and keeps
  missing history visible. Xcode Debug and Hub TypeScript passed. The focused
  suite passed 198 checks, including private chat access, reply scope, and
  duplicate-send prevention. Device Hub temporarily lost native window access,
  so post-deployment interactive QA needs a fresh pass. No live messages,
  transactions, or owner account changes were made as part of QA.

## Native composer and device alert staging · 25 November 2026

- Native message and branded Feed checkpoint `baa7d48d3e700d10f55c3636effd700ef11fec12`
  is on the task branch. PR #14 production is READY and responded 401 to invalid
  onboarding, settings, admin and Whop requests. The app's known-pattern email
  and checkout callback URLs returned 303 into their respective iOS schemes.
  The public web login, registration, Pricing and Feed kept returning 200.
- PR #15 deployed Messages, Bookmarks and Feed artwork as
  `63cd99edd4652c3dfc9cac061ff910c364fb1cbf`, with READY production
  `dpl_5xfD75Kj8PCmUMeK8esafTTEwHnP`. Production guest picks included 33 player
  portraits and team palettes, team marks, and eight posts with book data.
  Messages, Bookmarks and Activity kept rejecting unauthenticated requests.
  The signed iPhone 17e build displayed the branded pick cards and live Feed.
- New source adds Photo Library selection and the existing storage pipeline for
  Feed posts, direct and group messages, and onboarding. The native pick builder
  uses the web's exact NBA and NFL pregame composer markets, including league,
  matchup, player, line and book artwork. It keeps the web's same-book parlay
  rules, tracked grades and pricing verification. A dedicated Supabase migration
  makes native draft retries atomic with the web pick transaction. It has not
  yet been applied or released. No live picks or media uploads were used for QA.
- Added iOS device alert registration, service-only APNs storage, and alert
  routing using the existing notification inbox. APNs checks are staged in source.
  The Mac's default simulator build leaves APNs disabled. To enable on a signed
  device, set `SLIPSURGE_DEVICE_ENTITLEMENTS = SlipSurgeDevice.entitlements` and
  matching `SLIPSURGE_APNS_ENVIRONMENT` in the local Xcode configuration. The
  server needs approved environment-specific `SLIPSURGE_APNS_DEVELOPMENT_*` or
  `SLIPSURGE_APNS_PRODUCTION_*` variables for `TOPIC`, `TEAM_ID`, `KEY_ID`, and
  `PRIVATE_KEY`. Physical-device signing, key configuration and delivery remain
  unverified. The proposed APNs migration has not been applied.
- Hub TypeScript, 199 focused checks and signed Xcode Debug passed for the new
  source. Production tracked-pick schema inspection confirmed the current web
  writer is service-only, atomic across posts/picks, rate-limited and preserves
  spoilers. Native draft and APNs tables were absent before these changes.

## Native member profiles and Game Center · 25 November 2026

- Composer checkpoint `4430c9dc3c25689d9ef15f7b8c0c5e6f008b764a` is on the task
  branch. PR #16 merged as `d0798dca1574255100c08790933dff780646f16b`. Preview
  `dpl_2TY3LPrEaDpiMv8juKUR3A4cBL7P` and production
  `dpl_7wKnas9dZZPSiyANdzbaBtff7WqC` reported READY. Production rejected invalid
  credentials for both composer leagues, tracked picks, upload, mobile push,
  the push trigger, and targeted Activity. Public Feed, sign-in, Pricing and
  both research previews still returned 200.
- Supabase applied `20261125045717_native_tracked_pick_requests` and
  `20261125045900_native_apple_push` individually. Those are the canonical
  repository filenames. Both storage paths have RLS with service-role access,
  ordinary clients cannot execute the new pick writer, and the original
  writer hash stayed `50adf6918216aeea6609b576f2fc8fee`. APNs provider settings
  require a signed device configuration and authorized Apple credentials.
  No provider delivery, uploads, live picks, or account mutations were used
  in testing.
- New task-branch work adds native member profiles with authentic profile art,
  records, badges, favorites, verified socials, post/repost/media/reply and
  community tabs, Follow, Message, Block and Report. Feed authors and follow
  alerts can open the profile in app. Posts support editing in the same
  ten-minute window, deletion by the author, hide, mute, block and reporting.
  Read routes use the original block, privacy, membership and MLB visibility.
- Live Scores now opens a native game detail with Summary, Play-by-play,
  Box Score, exact-game Picks and Game Room. It reuses the same ESPN and
  stored NFL feeds, canonical NBA pick crosswalk, and room storage. It retains
  the MLB offseason pause. Team and player art comes from those data sources.
  The native reactions and room writes require existing member permissions.
  Task checkpoint `b26a294a856a972419e247ac686db973676aea78` is pushed. PR #17
  merged to main as `8f4904a56c9c097ab94a08eeee268a3e6faa8350`. Vercel preview
  `dpl_9LWVjYQVFvD4rF2pQ7TBHmAskB7U` and production
  `dpl_5quAzFjfJK7ENAzkR1tHDyTFigxb` reported READY.
- Six production guest profile sections returned 200. The archived NBA game
  returned 220 plays and two team stat groups. The archived NFL game returned
  173 plays, six stat groups, and two period rows. Both games returned 200 for
  picks and game room reads. Invalid bearer profile reads and unauthenticated
  writes returned 401. No member or room content was changed for QA.

## Native Research Workspace and My Picks · 25 November 2026

- SwiftUI adds Watchlist, four-slot comparison, notes, collaboration, and
  archived evidence through Research. The pick builder saves exact offers to
  Watchlist. My Picks reuses the owner-scoped web query for active and settled
  picks. Team palettes and league, book, and player assets appear on saved
  cards. Existing web/Android entries keep their prior behavior.
- Native workspace reads can display authorized evidence, collaboration, and
  the signed-in member's own library. The current shared board stores bare
  item IDs without per-item sharing provenance. Existing foreign IDs survive
  editing, and the native endpoint does not resolve them into private items.
  Concurrent web and native saves can still race inside the existing RPC.
  Direct Matrix creation and editing still need native screens.
- Signed Xcode Debug, Hub TypeScript, and 199 focused checks passed. The signed
  build was installed and launched on the Mac's iPhone 17e simulator. The
  task checkpoint `6e5fc4d527f14adfd9b132054712fc46d646e13d` is pushed. PR #18
  merged as `d15d2eb4a92a0714a99ffd292b8c522303a26eda`. Preview
  `dpl_9E8f9M3CN4rj376owxL9NbYoyAGp` and production
  `dpl_8H6QVeooxiN21rLoWa1TfM9tqooB` reported READY. Invalid and unauthenticated
  reads and writes returned 401. An existing account opened its saved Workspace
  and both My Picks tabs on the Mac's iPhone 18 Pro. The All tab returned a real
  graded archived parlay. No live member data was changed as part of QA.

## Native account security and data · 25 November 2026

- Account now includes email and password changes, the existing password
  change alert, authenticator setup, QR and manual key, authentication code
  verification, factor removal, and revoking other device sessions. Supabase
  owns validation, factor state, and session rotation. Native export and
  deletion use the existing owner-scoped request workflows. Files saves the
  private JSON export and permits re-export of a delivered request before its
  existing expiry. The deletion screen shows state, billing guidance, and the
  cancel action where the current workflow permits it.
- Signed Xcode Debug, Hub TypeScript, and the 199 focused checks passed. The
  built app was installed and launched on iPhone 17e. These API changes have
  deployed through PR #19 from `8a6f19898b84523dd2e455096d6271f250970acb`.
  Preview `dpl_5FoRUEbQAmVRCWgsLQ4sSsoTvDnV` and production
  `dpl_HAJWXS3BZ3RoSjpkPq6Lj2GCXZU6` reported READY. Invalid and anonymous
  requests to export status, creation, download, deletion, and the password
  alert returned 401. Public login, Pricing, Feed and both previews returned
  200. Tests did not change passwords, revoke sessions, download account
  exports, or request account deletion. Task checkpoint
  `5c3441a3d689b59f9d3a0058d43ffd747f971220` is on GitHub and was sent to Cloud.
  The existing signed-in iPhone 18 Pro account reached the native Account
  Security screen, including authenticator status and session controls.

## Profile photos, favorites, and compact Workspace · 25 November 2026

- Native Edit Profile adds username, avatar and cover changes with a live
  preview. Uploaded photos must use the signed-in member's own storage path.
  Existing custom imagery stays in place while unrelated fields are edited.
  Favorites uses the canonical league and player directories and existing
  mutation paths with the same MLB visibility and eight-player limit. The
  Workspace now shows Watchlist, Compare, Notes and Evidence together at
  standard text sizes. Legacy MLB pick rows use saved IDs and original team
  palettes and marks when those values are available.
- The signed iPhone 18 Pro Feed visibly rendered real NFL portraits, team
  palettes, both team marks, the Fanatics mark and colored result glyphs. This
  checkpoint adds coverage for older MLB cards. Signed SwiftUI, TypeScript and
  focused source checks were run on the Mac. Native profile and favorites
  writes remain to verify with a designated test account.
  Task checkpoint `4469d92f11799c1c5ad0cb88796f8fd1336c0eac` is on GitHub and
  PR #20 deployed `8788312db103234ba81deb0bd86d98463e4a421f`. Preview
  `dpl_BC6HhDHgcVRsc2dh49xjowNwEU3Y` and production
  `dpl_5qUZPCr3APLb2BeLmYyHZoNbCbvo` reported READY.

## Native connected accounts · 25 November 2026

- Account settings now offers branded Whop, Discord and X connection cards.
  Discord and X use the current member's Supabase identity linking, exchange
  proof on the device and refresh badges from the verified server identity.
  Whop uses its existing authorization and entitlement checks. The return
  requires a short-lived encrypted proof, the initiating device's verifier,
  and the same authenticated member. The existing Whop web callback also
  rechecks the initiating member before saving the connection.
- Signed SwiftUI, Hub TypeScript, and 202 focused checks passed. New tests
  cover proof expiry, purpose separation and same-account redemption. Task
  checkpoint `78d6907ca1a3f2a0b435c1ca4f0d0417747709bb` is pushed. PR #21
  merged as `1193ea33c5bb0ddeb93ef522355c7f9b2a30a186`. Preview
  `dpl_66ibbp16xyHyDvPgQrhcgva5Raan` and production
  `dpl_7rtdFQPfCiLZjkSPSsaVLnVMYQth` reported READY. Production rejected invalid
  connection, badge sync and Whop unlink requests with 401. A synthetic
  callback returned 303 to the native scheme and an invalid Whop ticket
  returned 400. Web sign-in, Feed, Pricing and both previews returned 200.
  Linking or disconnecting real provider identities and completing provider
  login with member credentials remain unverified.

## Creator scheduling and native admin queues · 25 November 2026

- Creator Studio now opens the member roster and supports drafting, editing,
  scheduling, canceling and deleting unpublished posts through the site's
  existing scheduler. Requests use stable draft IDs and only update the
  version last seen by the creator. Community destinations use their actual
  artwork. Existing ownership, creator eligibility and MLB visibility apply.
- Native admin queue pages cover moderation reports, legacy creator
  applications and account-deletion reviews with filters and audited existing
  decision routes. The native gate uses the current admin role and the usual
  account assurance rules. Content previews respect the original private-post
  restriction. No live creator or admin decisions were submitted in testing.
- Signed Xcode Debug, Hub TypeScript and 202 focused tests passed on this
  milestone. The native app opened a real Green Bay at LA NFL slate, rendered
  its FanDuel game lines, loaded Ronnie Rivers' MM +11, and showed his colored
  player trends, exact FanDuel +1900, saved cutoff and game log control. The
  creator and admin APIs deployed through PR #22 from
  `f2ba2772bc578fac35d9518da1b562526e459616`. Preview
  `dpl_9yW3VezKFqra1n6MP3GjxqrP4GXy` and production
  `dpl_Gr1sm6rALR1RHB2PGZoS8n638Gwn` reported READY. All ten unauthenticated
  creator and admin checks returned 401.
  Task checkpoint `5b2bd7e8ef479b556d29a950db362f9a2662bf3b` was pushed and
  sent to the existing Cloud chat.

## Native public information and game markets · 25 November 2026

- SwiftUI now presents Terms, Privacy Policy, FAQ, Support, About, Responsible
  Gambling and a Free/Ultimate membership comparison. The public endpoint
  projects the same authored content and membership feature list as the web.
  Internal research, privacy, account, plan and provider links open their
  native screens. Contact and external resources use the system URL handler.
- NBA and NFL game market rows now use their actual team colors and logos.
  The sportsbook selector shows vendor marks inside the selection sheet.
  The previous signed-in NFL review confirmed the actual MM rankings and an
  open branded player sportsbook sheet on the iPhone 18 Pro. No prices or
  historical research were synthesized.
- The local Next route served Terms (18 sections), Privacy (14), Responsible
  Gambling (9), About (5), FAQ (8), Support (4), and the 10-feature membership
  comparison. FAQ preview and connected-account links and the support email
  were preserved. Unknown pages returned 404. Signed Xcode Debug, TypeScript
  and 203 focused checks passed. PR #23 merged as
  `b0636692bb4bbecbda4e23971205a025439b48d6` after preview
  `dpl_GKyqY2tXP6BiGxYrGbjfedVs6NHt` and production
  `dpl_7swDB4k7xP8dFjz65ZYNHXTdSJ3E` reported READY. All seven production
  responses matched the local content counts. Unknown keys returned 404.
  Pricing, login, Feed, and both previews returned 200. The signed-in iPhone
  18 Pro rendered the live Free and Ultimate comparisons in SwiftUI.

## Native Live Rooms and community settings · 25 November 2026

- Discover opens Live Rooms and community detail opens the member's accessible
  channels. The native thread uses existing message history and permissions
  for images, replies, reactions, edit, delete and moderation. The last-read
  marker advances against the server's message order. Group channels are
  filtered against the same view and send permissions used by the site.
- Community and Creator Studio open native group settings for authorized
  accounts. Changes use existing RPCs for profile, rules, channels, invites,
  member roles, custom roles and per-channel overrides. Private communities
  and MLB keep their existing visibility checks. The roster currently shows
  at most 500 members. Channel history currently shows the latest 80 messages.
- Signed Xcode Debug and TypeScript passed. Native group and Live Rooms
  production walkthroughs, chat typing, channel mentions and older message
  pagination remain to verify or implement. No member or community changes
  were submitted in QA. Task checkpoint `c174278662dc533b0dd83c79c6a8e5e41d6c6fa1`
  is pushed. PR #24 deployed `692a6f6646e82a847f83c18817172ae96f09ca51`.
  Preview `dpl_BhGuX7uAPQkfKN6ib2qGjEmh9oof` and production
  `dpl_4dWWBMEeczJtkY1T17hmcMToxonA` reported READY. Five invalid or anonymous
  channel and settings requests returned 401. Groups, Feed and NFL preview
  returned 200. The signed-in iPhone 18 Pro opened the production Live Rooms
  directory and General Sports. The selected room showed its empty history
  and available composer. No message was sent.

## NFL Matrices and live Simulator research · 25 November 2026

- The Sideline tools include native NFL classic and pipeline Matrices, with
  sportsbook marks, colors, imports by code or marketplace, publishing, editing,
  activation and deletion. Version-aware edits and deletion protect against
  stale writes. Existing website callers keep the same behavior when no
  version is supplied.
- Native NFL MM tags and filters matching players. Website and iOS apply the
  same rule evaluation to eligible players, frozen sample windows, posted
  offers, public picks and TD baselines. Personal Matrix queries remain bound
  to the verified member. Native evaluation is withheld if player availability
  is stale. NFL ladder board highlights remain open.
- Signed iPhone 18 Pro opened an actual NFL Cheatsheets board, with market
  edge, projections and public-pick counts. Slate Edge opened and showed
  a FanDuel +170 price and public-pick data. No real Matrix writes were made.
- Signed Xcode Debug and Hub TypeScript passed. The broader NFL subset passed
  76 of 93 checks, including the new Matrix match test. All 17 pregame suite
  failures reproduced with the same test names on the parent checkpoint,
  where 75 of 92 passed. The task checkpoint was
  `533bd3f5321c7779fc869a9bcb8a3a29bb10a83d`. PR #25 preview
  `dpl_8oW7QWBdqeKWgf37Xd2YUYu9zEeX` reported READY and merged as
  `c71145c7c6cd155c582eefbfaf1903165cd16321`. Production
  `dpl_4qNiLgrDzRc3eiDuuNdCksRExRZk` reported READY. All six invalid
  Matrix requests returned 401 and NFL preview returned 200.

## Native NBA Matrices · 25 November 2026

- The Court now opens native personal and community NBA Matrices with the
  shared rule editor. NBA conditions support the saved lineup of fields,
  season-verified tracking inputs, home and away samples, First Basket
  contracts, branded sportsbook selection, and Filter, Rank, Group and
  Unless pipeline steps. Imports and publishing use the existing NBA routes.
- The Court player board labels and filters matching players. Evaluation
  runs on the server for the selected game and explicit Pregame or Live
  mode, including the existing season and missing-input checks. It preserves
  the saved Matrix definitions and supports version-aware edits and deletion.
- Signed Xcode Debug, Hub TypeScript, and all 31 focused NBA/NFL Matrix
  checks passed. Backend deployment, signed-in Simulator evaluation on an
  existing or disposable Matrix, and slate-wide displays follow. Task
  checkpoint `062c46b19390ad2239b315095d86857c008da1d0` is pushed. PR #26
  preview `dpl_7tVdHcrv85VqKabkdo2NE5y8mjZf` and production
  `dpl_7YDp2TSkQ1fSnrhjPcG3hMCFcAFY` reported READY on
  `b80534c365ad2977d0e08e5bf6c885a855fd553f`. Five invalid Matrix requests
  returned 401. NBA preview and Feed returned 200.

## Native Stories · 25 November 2026

- Feed reads active Stories behind the existing member-aware Stories rollout.
  It groups them by author and uses their photos, logo and ring color. The
  full-screen viewer supports progress, pause, previous and next, swipe,
  retry, and profile navigation. Basic and eligible members can compose
  text or photo stories with the site's background palette and league marks.
  Native writes use the existing 24-hour retention and owner-scoped rows.
- The native API respects account blocks and MLB visibility. It uses existing
  upload ownership and allows only the exact guest read route. Stories are
  currently disabled for public visitors by the live feature flag. The
  website rollout was preserved. No real Stories were published in QA.
- Signed Xcode Debug, Hub TypeScript and 203 focused checks passed. The prior
  NFL research fixture was updated to test the new same-member Matrix check
  while retaining its verification of frozen kickoff-time data. Task
  checkpoint `7bb7a6bfde6bcde1ab89033aa01175abe2121b2a` is pushed. PR #27
  merged as `a9a24ffdc0e16b906e1ea411a78775996f297a3f` with preview
  `dpl_HjdF7MjYq5UwCHKbnACozWQmYM3w` and production
  `dpl_3mP75ThDmVi1FvcaYkMMdqRvPtoS` READY. The guest request returned 200
  with the existing feature disabled. Invalid reads and writes returned 401.

## Creator storefront, membership and payouts · 25 November 2026

- A verified account can open guided SwiftUI setup through Account or Studio.
  It saves the same storefront draft, owner media, sports and topics. It can
  link a compatible community or create one through the canonical setup,
  publish changes and manage the availability of paid offers. Whop onboarding
  and offer creation reuse the existing payment and membership checks.
- Studio now opens a native balance, payout history, payout details and 30- or
  90-day revenue chart. The verified Whop portal handles withdrawal and
  identity verification in a system browser sheet. Test accounts cannot
  request the portal. The iOS app receives display data and a hosted link.
- Creator and community cards open native membership details. Members can
  restore access, open their actual community, and manage eligible Whop plans.
  The signed-in checkout route binds a random app return to the existing offer
  and buyer. The app still fetches actual provider-backed access after return.
  New external checkout is shown for the US App Store storefront, consistent
  with the existing native Ultimate billing screen.
- Signed Xcode Debug and Hub TypeScript passed. The focused creator, Discord,
  Whop, wallet, research access and production suites passed all 281 checks.
  They exercise native buyer identity and return state, denied native wallet
  authorization, and the existing cookie workflows. No actual checkout,
  provider enrollment, withdrawal or storefront publication was submitted.
  Task checkpoint `58c56d9e747935a6fd9c8e1e42186720c0e3f56e` is pushed and
  was sent to the existing Cloud chat. PR #28 merged as
  `3be11d042c43ddfcff732f38bba496cf7db9457f`. Preview
  `dpl_FxDMA2kLqBWJNUCqT3ULjZd4cs7A` and production
  `dpl_GosnpX68PYHSyXGdDLbTWpyAMHRr` reported READY. All 13 invalid requests
  returned 401. Creators, Feed, Pricing and both previews returned 200.

## Native NFL prop ladders · 25 November 2026

- The Sideline opens a native, per-game ladder with branded team and book
  filters, milestones, Over and Under, grouped line thresholds, opening odds,
  movement, anytime-TD ratio, observed and estimated picks, and Matrix
  highlights. Player cards open their existing trend screen. Exact contract
  details can save to Watchlist or prefill a tracked pick when pregame is open.
- The server uses the same canonical NFL ladder and archived market inputs.
  Missing or opening-only observations stay distinct from posted odds.
  Different opening thresholds suppress probability movement. A stale
  availability observation yields no actionable current selection.
- Signed Xcode Debug, Hub TypeScript and 51 focused checks passed. The iPhone
  18 Pro loaded the personal NFL Matrix editor and saved a disposable private
  Matrix. The app now percent-encodes plus signs in query values so exact
  timestamp versions survive deletion. The app showed no saved Matrices after
  deleting the fixture, and a read-only database check counted zero remaining
  rows for that fixture. Matrix primary controls use the SlipSurge lime fill
  and dark text for contrast.
- Task checkpoint `4afcc4b10b7ddc2d74e19007428b28b98bc4a33a` is pushed.
  PR #29 merged as `9e82b9f9cf35637bb48ab9c5163107962b3e8044`.
  Preview `dpl_5Hm2o24MrJjigc3JYfXbwCXx3AFd` and production
  `dpl_FvNntvgXXCs3xk5jzLwSbFdtxJ5L` reported READY. Invalid member ladder
  requests returned 401. Public Feed and NFL preview returned 200. On the
  signed iPhone 18 Pro Simulator the production receiving-yards ladder loaded
  for Green Bay at Los Angeles with team and FanDuel marks, and a 25+ contract
  displayed the posted FanDuel +550 and its distinct opening quote.

## Native community posting and preferences · 25 November 2026

- Members can review the rules and choose their community display name,
  role flair, and favorite channels. A new member can finish these details
  after joining or accepting an invitation. Favorites rise to the top of
  the channel directory after channel permissions have been checked.
- Members can compose analysis, polls, photos, and tracked picks inside a
  community. Server-side membership and the existing group policies govern
  posting and viewing. Retries retain the original destination. Private
  community posts avoid broad mention and follower notifications while
  recipient-level eligibility is pending.
- Signed Xcode Debug, Hub TypeScript, and 146 focused social, message,
  access, and production checks passed. The private-scope fixture verifies
  that a nonmember cannot post and that changing the destination of a
  saved draft fails on retry. Real community publishing and preference
  writes still need an appropriate test community. Discord claims, older
  room history and typing remain in the community backlog.
- Task checkpoint `ba869b43a3a2f060e38f0448c820a20b94a2dbbf` is pushed.
  PR #30 merged as `da7b70554db77bb080d1eb50fa89bdb233137d05`.
  Preview `dpl_GZsCJkhZ6gjAmUv4fJPCrt35dskp` and production
  `dpl_FezXZHkysKUnPJowemvrxGxPXSN3` reported READY. Invalid community
  detail, preferences, post and pick requests returned 401. Guest Feed
  returned 200.

## Native MLB Dugout board · 25 November 2026

- An eligible member can open The Dugout from Research and select an exact
  date, matchup and explicit Pregame or Live mode. SwiftUI renders confirmed
  and projected lineups, probable pitchers, team colors and art, batter
  headshots, actual outcomes, market filters with sportsbook marks, opening
  and posted quotes, and the existing MM, Matrix matches, and Statcast
  windows. The team and book pickers carry their marks. Up to four batters
  can be compared, with signed MM bars across L1, L3, L5 and L10.
- The mobile route delegates to the canonical tier-scoped Dugout pipeline.
  Hibernation eligibility and same-account membership are checked before data
  loads. Frozen games with missing research do not use a projected roster or
  current Statcast as historical data. Opening-only prices are labeled.
- Signed Xcode Debug, Hub TypeScript and 23 focused freeze, access, slate
  and favorites tests passed. A broader run also found three legacy failures
  in the responsive Slate Edge and MLB route-guard tests. The changed
  files do not implement those asserted browser components or route guards.
  A dated, eligible production walkthrough remains pending, along with
  editing MLB Matrices and the other standalone MLB tools.
- Task checkpoint `d66fc4c9543cf234b7a18f52a687a6fcb1d77a86` is pushed and
  was sent to the existing Cloud chat. PR #31 merged as
  `8d0ef7d6acae583362df6b70895e0c1dacd85b2e`. Preview
  `dpl_3UxeGASE4mRqoa2zxZkqc8y1eZEk` and production
  `dpl_7UbHsEXbtRvmsXwrfh1X5Jk5A6K7` reported READY. Invalid access,
  Pregame, and Live requests returned 401. Guest Feed returned 200.
- The signed iPhone 18 Pro Simulator opened the gated board. The November
  25 slate correctly showed no games. The date picker loaded the September
  25 slate with team marks and confirmed Cubs and Red Sox lineups. Pete
  Crow-Armstrong’s detail showed real results and archived book prices,
  alongside an explicit missing pregame research state. Doubleheader game
  numbers now distinguish the two matchup cards.

## Native community Discord · 25 November 2026

- Eligible members can view community Discord roles, authorize the required
  Discord scope, join or open the server invitation, and claim or recheck
  member access. The flow binds the Discord proof to the active SlipSurge
  user and keeps provider credentials in memory for the request.
- Community owners can see server icons, check managed servers and bot
  permissions, create and select member roles, validate a server invite,
  publish an access panel to a chosen text channel, and disconnect the
  mapping. The app uses the existing provider proofs, owner and role gates,
  delivery queue, and site endpoints. Browser writes retain same-origin
  checks and native bearer requests must pass account verification.
- Signed Xcode Debug, Hub TypeScript and 181 focused Discord, account,
  creator and production checks passed. The owner test checks that invalid
  bearer requests cannot fall back to browser credentials and that another
  creator’s community remains unavailable. Discord consent, bot installation,
  role delivery and access-panel publishing still require a suitable
  dedicated Discord server and authorized provider interaction to verify.
- Task checkpoint `f02645548544994307ba835a4b83195b73f7e602` is pushed.
  PR #32 merged as `ae23dc156e8745dea14844de5fcd4d6c5b3a54bc`. Preview
  `dpl_5U54miuwzp3jgoTbw4Q6jfH5YKEt` and production
  `dpl_HweevYW3KsLkuvPJT9VCUyyiK6Yz` reported READY. Five invalid
  native Discord read and write requests returned 401. Guest Feed returned 200.

## Native channel history · 25 November 2026

- Live Rooms and community chat can load earlier messages in chronological
  order without jumping the current reading position. Replies and reactions
  stay scoped to the same room. The cursor carries the original microsecond
  timestamp and message UUID, so simultaneous messages do not repeat or
  disappear at page boundaries. Room authorization is checked for each page.
- Signed Xcode Debug, Hub TypeScript and 145 focused native message, channel,
  MLB visibility, and production checks passed. The same-timestamp fixture
  loaded all 85 entries without duplication and returned 404 after access
  was removed. The separate Channels directory browser fixture failed to
  bundle its existing CSS module and was excluded from the 145. A live room
  with more than 80 messages still needs a Simulator walkthrough. A read-only
  production count found no public room above that threshold.
- Task checkpoint `35a28da6e9bcda652f462c4a9c6fbca0c4fe249c` is pushed.
  PR #33 merged as `7a5efa5dd23e858428473d05c647b2eeacadccf2`. Preview
  `dpl_9EMo21EtY7StRWpd9HFzNJK1HweQ` and production
  `dpl_DR4iW3zPj8ZH8LASfwpsaa1cUJBn` reported READY. Invalid latest and
  earlier channel requests returned 401. Guest Feed returned 200.

## Native Weather Lab and Spray Charts · 25 November 2026

- The Dugout opens native Weather Lab and Spray Charts for the selected
  date. Weather Lab uses the same venue orientation, roof status, forecast
  and current conditions, wind direction, carry calculation, and park home
  run history as the site. The native field uses the existing traced park
  geometry and honors Reduce Motion.
- Spray Charts plots the recorded MLB and Statcast coordinates by game,
  supports multiple batters and result filters, animates selected contact,
  labels projected coordinates, and exposes the contact and archived odds
  inspector. Points and heat views share the chart and can export a PNG or
  share the existing deep link.
- Signed Xcode Debug, Hub TypeScript and 30 focused tests passed, including
  retained Basic and Ultimate floors, indoor carry, actual recorded
  coordinates and park geometry. Production replay, chart interaction and
  PNG export still need Simulator verification after release.
- Task checkpoint `61f71265b418fb6603aeef2e028b955df85aec73` is pushed and
  was sent to the existing Cloud chat. PR #34 merged as
  `61e4b1f0049468fd1dde0f521e3c44bea86b8cbe`. Preview
  `dpl_A9CyzqtCsjMcGdoZ4ScKH4wF29Zf` and production
  `dpl_BMNi6g9fJAFwGGKPYHoSgCBDKJeR` reported READY. Invalid weather,
  park history and spray requests returned 401. Guest Feed returned 200.
- On the signed iPhone 18 Pro Simulator, the September 25 Spray Charts
  slate loaded Fenway Park with 111 captured batted balls and two near
  home runs. The existing traced field, marks, and selected date rendered
  from production. Direct marker and PNG export checks are still pending.

## Native Pitcher Report, The Public and Batter Cost · 25 November 2026

- Pitcher Report opens from the selected starter or the Dugout tools. It
  uses the existing dated, matchup-bound 3, 5 and 10-start pregame samples.
  Pitch usage, handedness, pitch colors, batter splits, top pitches and
  manual pins use the actual saved samples. Missing samples stay
  unavailable, including after the first-pitch boundary.
- The Public carries the existing dated market categories, observed pick
  counts and movement, exact prices and cleared lines, result states, and
  game filters with both team marks. Same-game observations take precedence
  over legacy rows. The app keeps zero outcomes neutral until final.
- Batter Cost shows the canonical opening and current FanDuel prices,
  movement, Power Vehicle signal, and HR/FHR season comparisons. Historical
  season baselines come from the same game's archived inputs where present.
  The Public retains the Advanced floor; Batter Cost retains Ultimate.
- Signed Xcode Debug, Hub TypeScript and 41 focused freeze, public movement,
  tier and tool contract checks passed. Dated production walkthroughs follow
  for these three boards.
- Task checkpoint `94de6d9467d19f1e4f96a0356b9a5bc91ee6b449` is pushed.
  PR #35 merged as `aac35dd2d452cb01d7ed4b27b3433dd4311d36de`. Preview
  `dpl_CLZihugqNAZWuNDiZQN96aHM6ztY` and production
  `dpl_5SdVy63HcSgcNcFzQdLYf4gkbkVz` reported READY. Both the Dugout and
  Pitcher Report APIs returned 401 without a native account. Guest Feed
  returned 200.

## Native NBA Shot Map, Role & Minutes, and Game Tracking · 25 November 2026

- Court player details open the native Shot Map for completed appearances
  within the selected matchup's pretip sample. The half court uses the
  provider's feet-based coordinates. Made and missed markers, quarter and
  shot-value filters, heatmap, and the attempt inspector retain missed
  locations and incomplete coverage as explicit states.
- Role & Minutes uses the app's selected NBA sample for L5/L10/L20 minutes,
  period-over-period movement, attempts, and points per 36. Season scouting
  uses the saved provider usage, potential assists, rebound chances and
  drives. Game Tracking keeps original completed-game observations,
  canonical metric groups, home and away splits, and the per-player graph.
- Signed Xcode Debug, Hub TypeScript and 76 focused NBA route, source
  coverage, matchup-snapshot, and public-preview checks passed. Preview
  access remains scoped to the featured matchup. Simulator walkthroughs
  of the new NBA panels remain pending production rollout.
- Task checkpoint `f6f867316b8e030900bdddd4cc1ab4ecc610dd09` is pushed.
  PR #36 merged as `740c5c08c08309f3f10fceb6aafbb35891b7342c`. Preview
  `dpl_4dRFeQVwNSoseezJQzSyXUMhBEMT` and production
  `dpl_Aye8Vo5FmRqVMe52wN3HnJ5X7oqj` reported READY. The new shot,
  tracking, and scouting reads returned 401 without a native account.
  Guest Feed and the public NBA preview board returned 200.
- The signed iPhone 18 Pro Simulator loaded the November 25 NBA slate and
  rendered Role & Minutes with L5, L10, L20, minutes change and points per 36.
  Game Tracking and player Shot Map still need their own signed walkthrough.

## Native research links and Spray Charts verification · 25 November 2026

- Research notifications can open the matching native board. The app handles
  validated SlipSurge research paths and registers `slipsurge-research://` for
  explicit device routing. Sports dates, MLB matchup and Spray filters, and
  exact NFL/NBA matchup identifiers use the normal signed-in views and gates.
  Public HTTPS delivery still requires the production Associated Domains setup.
- On the signed iPhone 18 Pro Simulator, the September 25 link loaded the exact
  Cubs–Red Sox matchup `824703` at Fenway, with 111 batted balls and two near
  home runs. Selecting a marker showed the recorded 110.8 mph exit velocity.
  Image export opened the native share sheet and generated a 1040 × 667 PNG.
- The signed Simulator loaded the September 25 Weather Lab and open-roof Fenway
  park card. The Public opened on the same date, showed missing pregame pick
  snapshots, and reported no matching rows for the selected market.
- Remaining after this checkpoint include the MLB pick builder and Watchlist,
  MLB Matrix editing, Odds Movement Terminal, Synergy, native message history
  and typing, and full role and provider walkthroughs.

## Native MLB tracked picks and Watchlist · 25 November 2026

- The native branded pick selector now follows the account’s MLB visibility.
  During the existing offseason pause it shows the posting pause before
  loading prices. When the site resumes MLB posting, the selector uses the
  browser composer’s schedule and odds sources, exact books and MLB player
  and game IDs. The native posting path rechecks each quote and first pitch.
  It omits prices whose recorded threshold cannot be graded accurately.
- The signed-in Dugout player and pitcher views save the exact displayed
  pregame quote to the existing personal Watchlist. The server rechecks the
  selected game, athlete, property, book, and captured price. A saved opening
  quote is supported when the board has only the opener. The Watchlist displays
  the MLB player and team art with both club colors.
- Signed Xcode Debug, Hub TypeScript, and 60 focused market, archive, settlement,
  NBA privacy, posting and Watchlist checks passed. The production pause and
  opening and removing a disposable saved market remain the runtime checks.
- MLB posting remains paused at the source. The native archive view preserves the
  existing seasonal visibility, and no change to baseball jobs is part of this release.
- Task checkpoint `b8322c29a4f109448fb89b9169d875ebfb5f4e16` is pushed and was sent
  to the existing Cloud chat. PR #37 merged as `7a3e4b66a6562e85e907773f5fa47642d46ed5b0`.
  Preview `dpl_H5SByLhuLnn8Nyb9Q2pQDLwJe3H5` and production
  `dpl_JCofGSS1xERRweuHMyJoQBBpMNtN` reported READY. Invalid MLB picks and research
  library requests returned 401. Guest Feed returned 200.
- On the signed iPhone 18 Pro Simulator, Pete Crow-Armstrong’s September 25
  Anytime Home Run quote saved privately from The Dugout and appeared in
  Workspace at the exact BetRivers +500 with club art. The disposal check
  removed the temporary quote and showed an empty Watchlist. The signed Pitcher Report displayed an
  unavailable archived window and its three sample sizes for the same date.

## Native Odds Movement Terminal and Synergy · 25 November 2026

- The native Odds Movement Terminal uses the original dated, first-pitch
  bounded archive and validates both the matchup and its roster. The chart
  shows exact saved timestamps, odds, implied probability and movement from
  open. Team and sportsbook controls use the existing artwork. Filters include
  players, markets, sportsbooks and time windows, with a capture inspector,
  line pins, sorting, and six device-local presets.
- Native Synergy keeps the original batter and starter pairing, both affinity
  scores, matchup sorting and per-pitch home run evidence. During the baseball
  offseason, the app presents the provider pause. In season it reads changing
  inputs only after the member opens Live. The app does not synthesize a
  pregame archive for this tool.
- Signed Xcode Debug, Hub TypeScript, and 29 focused archive, identity, freeze,
  and access checks passed. Production and signed runtime checks follow.
- Task checkpoint `0af5df88e9ff80646d0f6c3a11ef11ca96f95942` is pushed. PR #38
  merged as `8ebfd9b7e0a040c928e0911593b869a67aec0720`. Preview
  `dpl_7XFiBRUxrVsviQD8CD552xg2UhXy` and production
  `dpl_A9Zn18NHynxS7G3P9ghiffdfkKRk` reported READY. Both new native requests
  returned 401 without a signed-in account.
- On the signed iPhone 18 Pro Simulator, the September 25 Cubs–Red Sox
  Odds Movement Terminal displayed 179 captures, the frozen first-pitch
  status, branded sports books, and the price chart. Synergy showed the
  existing offseason pause. The production guest Feed returned 200.

## Native MLB Matrix editor and marketplace · 25 November 2026

- The Dugout opens the existing account’s MLB Matrices. Native classic and
  pipeline editing use the website’s field keys, filters, market books, MM
  windows, ordered tie rules, rank and group steps, and Unless conditions.
  The app delegates to the existing tier and ownership rules, keeps the
  saved Matrix version on edits, and keeps the season visibility gate.
- The app opens and imports shared Element Codes, browses the existing
  Marketplace, and allows eligible members to publish a saved Matrix or
  remove a listing they own. Changes use the same account and saved library.
- Signed Xcode Debug, Hub TypeScript and 32 focused MLB, NBA and NFL Matrix,
  archive, and access checks passed. The signed create/edit/delete and basic
  listing/import walkthroughs need the narrow production release.
- Task checkpoint `1528501af4a1f784ce9c92a8b42b9543b624dac1` is pushed. PR #39
  merged as `640a749fab679402cbb8d1ef1a98c83816e5e250`. Preview
  `dpl_4RA9kKdg9tvQMhqe8DLdRaFajkTc` and production
  `dpl_5Xr5Pii9cAsU4GfCvjsUMveQmdTU` reported READY. The signed iPhone 18 Pro
  loaded existing MLB Matrices and opened a Pipeline editor with its saved
  rule and initial pool. The test account is at the website’s Matrix cap.
  Existing definitions were left intact during the walkthrough.

## Native direct and group conversation history · 25 November 2026

- Direct and group messages can load older pages with the existing stable
  timestamp and message ID cursor used by Live Rooms. The app retains the
  current scroll position, reply previews and reactions and rechecks each
  room’s current access on every page. Direct messages show the partner’s
  existing read receipt when visible to the signed-in member.
- Direct message and channel typing use the website’s authenticated Supabase
  Realtime presence topics. Presence runs only in an active, authorized room,
  sends no draft text and stops on leaving. The app preserves a failed draft
  if the member has already started entering the next message.
- Direct message forwarding uses the existing message table, source and
  destination privacy, and original copied payload. A stable forward ID
  prevents a duplicate if the app retries that same forwarding action.
- Signed Xcode Debug, Hub TypeScript and 15 focused history, forwarding,
  access and scroll checks passed. The tests cover same-timestamp boundaries
  and revoked memberships. Cross-device typing and real forwarding remain
  pending, and no real message or forwarding action was sent during testing.
- Task checkpoint `5c07375311f7a5d8c496d72be50019580f30229f` is pushed. PR #40
  merged as `b44ed3952c1db09658f594b48e162552a5c159cb`. Preview
  `dpl_CnpodBb6VJEV9sLcaA881ZCzbaG8` and production
  `dpl_BsUNdSAeBJBuab7jVXbiqE6o1JP5` reported READY. Invalid direct and group
  requests returned 401 and guest Feed returned 200.

## Native admin member support and feature rollouts · 25 November 2026

- Admin now opens a native member directory and banned-account list. Name,
  username, and email search use the same server records, organization roles,
  tier rules, verification, and Whop membership details. Discord, X, and Whop
  show their existing marks and verified connection state.
- Verification, role changes, grants, bans, deletion, existing account-support
  email actions and individual Whop reconciliation use the existing server
  handlers. Native callers pass the current bearer, onboarding and MFA checks
  and the live admin role. The browser still uses its existing cookie path.
- Feature rollouts open the original audience and cohort controls. A native
  save checks the version the administrator reviewed, and conflicts keep the
  current saved configuration. Confirmation is shown before requesting changes.
- Xcode Debug, Hub TypeScript and 18 focused admin, feature configuration and
  member access checks passed. No role, membership, email, ban, deletion or
  rollout was changed in QA.
- Task checkpoint `6c3ea856499917659bc6723bae8fb99609bc560d` is pushed. PR #41
  merged as `74a576f80819c1e4d3c83d207ac990002826b46e`. Preview
  `dpl_G8ECWNXfFEiru5EdDF58KbHjt54P` and production
  `dpl_6DohJQCyA7yZDVKFdtBtvrnSAH4r` reported READY. Invalid member and rollout
  reads returned 401 and the signed-out Feed returned 200. The Cloud handoff
  chat received the task and deployment checkpoint.

## Native MLB player pages · 25 November 2026

- Dugout batter and pitcher records open distinct native profiles using the
  website’s existing Basic gate and exact MLB IDs. Historical matchup cards
  keep the original freeze. Player profiles use the site’s player history,
  team artwork, season and career records, last-six-days comparison and
  qualified league pools for graded Quality of Contact.
- The SwiftUI profiles include sortable Statcast and pitch arsenal splits,
  batting stance, Swing/Take, recent home runs with opponent navigation, a
  branded opponent chooser, pitch filter controls, strike-zone and comparison
  grids, and selectable spray/heat markers over recorded ballpark outlines.
  Use `slipsurge-research://research/mlb-player?id=663611` for a direct link.
  The app also recognizes the existing same-site `/players/<id>` route.
- Signed Xcode Debug, Hub TypeScript and focused MLB profile and admin
  authorization checks passed. Task checkpoint
  `60ff8a5807dbe90ba0fcf4f054f31f2cff09e585` is pushed. PR #42 merged as
  `efccdc22f2876c1f01b4e517bf539fbd4ccf826c`. Preview
  `dpl_GP5P2a8SQ4PPJdLMBxo3Jf17xG2Q` and production
  `dpl_45YGJBXeZPbRdjo8pGaSXqxh8hmK` reported READY. Invalid profile and spray
  requests returned 401 and guest Feed returned 200.

## Native MLB Slate Breakdown · 25 November 2026

- Added a dated, game-selectable Slate Breakdown. The screen shows both
  booked starters and the saved opposing lineup. Use team-styled portraits
  to switch sides, a Season/L10/L5/L3 starter sample, pinnable pitch usage,
  sortable plate results, actual strike zones and player profile links.
- Existing Slate Breakdown tier rules remain in force. Free users see the
  featured matchup, pitch data needs Basic, and the full slate and staff
  filter need Advanced. Live requires the explicit selector, today’s date,
  and an active MLB season.
- Pregame uses the original matchup’s `board:v1` roster plus archived pitch
  and staff observations. Added individually reviewed migration
  `20261125061300_add_mlb_slate_breakdown_archive_resources.sql` for those
  exact sample types using the existing clock, locking, and grants. Test
  PostgreSQL accepted the migration, preserved prior complete observations,
  rejected writes after the earliest first-pitch cutoff, and retained
  service-only access. Production inspection confirmed the original guards
  and privileges. Migration and narrow release are next. Older games may
  have saved rosters with no corresponding pitch or staff observation.
