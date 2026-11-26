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
  chat received the task and deployment checkpoint. The signed Simulator
  opened the native member directory and a member’s connection and
  membership details. This was a read-only walkthrough.

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
- The signed Simulator opened the exact Nick Madrigal profile from a deep
  link. Rays artwork loaded, the season panel showed .278 AVG and .365 OBP,
  and the native Spray view loaded recorded batted-ball data. Formatted the
  year without numeric grouping after visually reviewing the profile.

## Native MLB Slate Breakdown · 25 November 2026

- Added a dated, game-selectable Slate Breakdown. The screen shows both
  starters and the saved opposing lineup. Use team-styled portraits
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
  service-only access. Applied individually on the primary Supabase project
  as `20261125101930_add_mlb_slate_breakdown_archive_resources`; the new
  constraint is validated and both archive functions remain service-only.
  Older games may have saved rosters with no pitch or staff observation.
- Task checkpoint `24c8d60650f4b5f82668d5a22771af285cef0750` is pushed. PR #43
  merged as `cd45772c63bd12b3f2e556398c0413438e4b28b2`. Preview
  `dpl_cQ6FXiD6tWFBJrZkWjroM9gKUX63` and production
  `dpl_5QWMhb7CesNLfSzqo4Y8GRzfT7Gu` reported READY. No observations or jobs
  were replayed. Anonymous list and starter requests returned 401 and the
  guest Feed returned 200. The signed Simulator resolved the October 28
  selection `849799` to both confirmed lineups and showed the first-pitch
  seal. That game had no independent pitch sample. September 25 `824703`
  showed no archived roster; its separate Odds Terminal captures remain
  available.

## Native announcements and Leaderboard · 25 November 2026

- Added the site-wide banner and What’s New popup using the website’s
  existing announcements, colors, release artwork, audience and per-account
  dismissals. Banner dismissal lasts for the app session and edits appear
  again. Release dismissals use the signed account and sync to the website.
- Native Admin previews, edits and publishes the existing banner or changelog
  records. The editor supports the registered color presets and original
  screenshot upload route. Edits check the saved version and release status
  before writing. No production announcements were edited or dismissed in QA.
- Discover’s Leaderboard now includes podium cards, standard season and
  weekly ranking, branded league filters, win streaks, profile navigation,
  and the native pick composer. Weekly and sport order use the site’s win
  rate ranking with its existing overall order as the stable tie break.
- Signed Xcode Debug, Hub TypeScript and 10 focused archive, profile,
  announcements and admin-access checks passed. Task checkpoint
  `c4f12a10629e50d56dfc618cf95f44e6617cfa7d` is pushed. PR #44 merged as
  `820b9f6411cfd15e22a037216df7487f4910da21`. Preview
  `dpl_D7hZ23fQU3Ukt9S8KJthPENm7Zpq` and production
  `dpl_HC9d8VXMFTbfodS6MNvsMLWoFHSo` reported READY. A production check
  found that the proxy stopped guest banner reads before the handler. The
  next release adds the two exact read paths for announcements and events.

## Native Events and live-season Slate Breakdown · 25 November 2026

- Discover opens Events for members and visitors according to the website’s
  original rollout. Native pages show the existing Upcoming and Recent lists,
  host profiles, sport artwork, event details, links and attendee counts.
  Members can create an event, respond Going, Interested or Can’t Go, and
  remove their RSVP. The request targets only the signed member’s attendance
  row. A stable draft ID lets an interrupted create retry safely.
- Admin has the same dated event directory and confirmed event deletion.
  These actions continue using the original records and controls. No live
  events, RSVPs, deletions or rollout values were written for testing.
- For an active, open MLB matchup with no saved roster, native Slate
  Breakdown now uses the existing one-game pregame capture before reading
  the roster back. It never starts this capture during the offseason, from
  a historic selection, or from an individual pitch request.
- Signed Xcode, Hub TypeScript and 14 focused event, archive, profile, admin
  and announcement checks passed. Live feature-gated reads follow the narrow
  release. Forum, Articles and custom Pages remain in progress.
- Task checkpoint `5f5430def752739b5cfb3737c8dba1f710f516ce` is pushed. Added
  exact method-and-path guest routing tests for `/api/mobile/announcements`
  and `/api/mobile/events`. Handlers still verify supplied sessions and
  evaluate rollout access. Admin and changing requests retain their gates.
- PR #45 merged as `e2980c6b0aa88a557d0ff9717bd483bb95229b24`. Preview
  `dpl_Bh3dJRqepv8r8D8WGGB75RKfjCov` and production
  `dpl_6q3AS62ULy1ueppNQvmrb8c8nKrP` were READY. Live guest Event availability
  returned `enabled: false`, the guest list was blocked, and the invalid
  bearer and guest admin reads returned 401. Guest announcements and Feed
  returned 200, with no public banner or entries at the time of the check.

## Native GIF attachments · 25 November 2026

- The Feed composer, pick posts, comments, discussions and chats can
  attach or display animated GIFs with existing media ownership rules.
  Native playback validates file type, host, redirect and download size,
  and pauses animation for Reduce Motion or when the app leaves the foreground.
  The server bridge accepts HTTPS GIF images only on the approved CDN hosts
  in native social writes. Other owned upload types and browser writes
  keep their existing behavior.
- Google retired the Tenor API on 30 June 2026. The Mac simulator reproduced
  the broken catalog using the same endpoint as desktop. iOS now supports
  a direct GIPHY client catalog with official attribution and separate keys by
  surface. No SlipSurge GIPHY connection or owned iOS key was available to
  verify. Search stays visibly unavailable on unconfigured surfaces, where
  Photos and a validated direct image link are presented immediately.
  The legacy desktop picker was left on its existing endpoint.
- A signed Xcode Simulator build opened the Feed composer and GIF picker,
  accepted a live GIPHY image link, and rendered changing animation frames in
  the unsent draft. No post, message, or GIF share event was sent. Focused
  native GIF URL and upload ownership tests passed. Production write support
  was released through PR #46. SwiftUI is on task checkpoint
  `7019474f5b2c6c72850f0f0c065a3453024cc733`. Main is
  `3f49a192e1aa6763801a00415cf7b64b2a956352` for this release, with preview
  `dpl_8hkJPXXyjGjKDmQwuGSJ3ZxDH1Ew` and production
  `dpl_AEKVUVPEUs5bSBG7zsy9wQHSmN2d` READY.

## Native Discussions and community membership · 25 November 2026

- Native Discussions includes categories, pinned and locked threads, native
  topic and reply editors, nested replies, edit/delete for the reply author,
  votes and quick reactions, GIF attachments, actual member mentions, profile
  navigation, share links and notification routing. Admins can review, pin,
  lock or delete threads through the existing role and MFA verification.
  Reply paging uses the original timestamp and ID, including equal timestamps.
- Both Discussions and Events honor the website’s feature rollout and Basic
  membership floor, including its existing entitlement overrides. Guest
  availability yields a disabled status and content stays protected. A link
  can lead to native sign-in or membership details when appropriate.
- The new migration exposes two service-role-only operations for confirmed
  native replies and atomic vote switching. It does not rewrite existing
  data or policies. Local Postgres checks passed for permissions, retry, exact
  parent, locked threads, vote switching and rate-limit rollback. The Hub
  smoke suite is 134/134 after updating a stale assertion to check the verified
  shared admin authorization helper. Hub TypeScript and 13 focused tests
  passed. The signed Xcode Simulator build passed.
- Task checkpoint `4133a669ae5d3e431a55786b80e991866c06e55c` is pushed.
  The reviewed SQL was individually applied in the primary project as
  `20261125111504_native_forum_operations`. Production verified that only
  `service_role` can execute either function. Do not replay the migration.
  PR #47 merged as `d79e9f9194f025eff8a23a07abff6708f5b9fec8`. Preview
  `dpl_4pgcm6iiNQeuZiYt5VeT2oEreZQY` and production
  `dpl_6UGbXmAABTbUhDymebNchJ4FFanw` were READY. Guest availability and Feed
  returned 200, and unauthorized or invalid-bearer content and moderation
  reads returned 401. Signed-in reading and moderation screens remain to
  verify against that release. No live posts, reactions or moderation have
  been made for QA.
  Articles, custom Pages and remaining admin and account checks remain open.

## Configured GIPHY iOS SDK · 25 November 2026

- The owner supplied a SlipSurge iOS SDK key. It is available to Xcode through
  `SLIPSURGE_GIPHY_IOS_SDK_KEY` in the Mac’s ignored local configuration.
  No key value is included in Git or the Cloud handoff. The official SDK
  `2.4.0` replaces the earlier unconfigured REST catalog in the same shared
  SwiftUI picker for Feed, comments, Discussions and messages.
- Xcode 27.2 resolved the SDK and its pinned WebP dependency. The app embeds
  the signed GIPHY framework and loads it from its Frameworks folder.
  The signed iPhone 18 Pro Simulator loaded live trending GIFs in the
  shared picker with native search and the approved provider attribution.
  A search for `basketball dunk` returned relevant GIFs, and tapping a
  result attached it to the unsent Feed draft with its Remove attachment
  control. No post was sent. Link and Photos attachments remain available.
  Local configuration is required wherever iOS is built with live search.
- The configured SDK checkpoint is `16f835bb164181015b72b5f7c15f16512c048164`.
  The Cloud handoff was sent. On the signed Simulator, Discover also showed
  the full Leaderboard control and loaded the ranking surface. Discussions
  opened the live category directory and the General Discussion category.
  General Discussion was empty. No production content or moderation was
  changed in those checks.

## Native Articles · 25 November 2026

- Discover has native Articles and My articles, with the website’s rollout
  and Basic membership requirement. The reader shows cover art, league marks,
  author profile and verification, headings, article views, likes, sharing
  and related articles. The owner can create, preview, save a draft or
  publish, and edit an existing article. Draft with AI uses the existing
  backend, prompt bounds, hourly quota and provider configuration. The
  generated text stays editable before publication.
- Native drafts use stable create IDs and check the last confirmed revision
  on edit. The reviewed SQL tracks article changes without advancing the
  revision during analytics updates. It provides a service-only exact-state
  like operation in addition to the existing browser toggle contract.
- Signed Xcode, Hub TypeScript, 16 focused tests, the 134-check production
  source suite and local PostgreSQL passed. The task checkpoint is
  `a51fc672c1bf041ebda720c9a1c4f9a716817f33`. The primary database applied
  `20261125113335_native_article_revisions` individually. The trigger was
  active and like mutation was service-role-only. Do not replay it. PR #48
  merged as `6a862530f99c07954df45fad1b3f293a0590032a` with preview
  `dpl_44TuBDX172fAYNRKk2hNGpkswijZ` and production
  `dpl_CRhoNDMM88Mfz8dtaGSi6u2gWsFz` READY. The web Blog and Feed returned
  200, and unauthenticated native article and AI reads/actions were rejected.
  The signed Simulator opened the live empty Articles library and the native
  editor with Publish, Save draft, and Preview. No article, like or generated
  draft was written to the live system for testing.

## Native Pages and publication moderation · 25 November 2026

- Discover offers custom Pages using the website rollout and authenticated
  page visibility. Native screens include category artwork, the directory and
  My pages, the original icons, banners and avatars, follow/unfollow, the
  page’s social feed and the owner’s native creation and settings flows.
  Existing canonical text, analysis, poll and tracked-pick writes accept an
  explicitly verified Page destination. Normal browser and group submissions
  keep their original path. Page settings reject stale edits.
- The admin Moderation tab lists Pages and Articles with the existing
  publication visibility rules. Admin actions verify or remove verification
  on a Page and delete reviewed Pages or Articles. Each action calls the
  existing native admin gate. No production changes were made for QA.
- Signed Xcode, Hub TypeScript, 21 focused tests and 134 production source
  checks passed. Task checkpoint `4dbf328a9211671810278c7e3a5ddf16622260cc`
  is pushed. PR #49 merged as `f1638d425a22720ea7bcee16f343350ee2a9a2fa`,
  with preview `dpl_F667oyurk82D9stw8bLGsNx4fbM3` and production
  `dpl_FC8Ps4KhFCJnCWAzhbRzj4FtA38x` READY. The signed Simulator opened the
  live empty Pages directory and displayed the category picker and Create
  page. Guest and invalid-bearer protected routes returned 401. Both the live
  desktop Feed and native guest Feed returned 200.

## Native custom emoji and Badge studio · 25 November 2026

- The native emoji catalog shares the same standard shortcodes and live
  custom artwork as the website. Feed, comments, Discussions and chats have
  a native searchable emoji picker. Supported shortcodes render in social
  text, reaction counts and chat reaction buttons. Native chat supports all
  registered shortcode lengths and can remove a reaction after its custom
  image was retired.
- Admins can create, edit or delete custom emoji and manage categories.
  Badge studio supports existing icons and card artwork, creation, editing,
  deletion and member assignments, including a one-time confirmed selection
  of up to 1,000 eligible members. Artwork uses the existing admin-only
  upload kinds. Edits check the original record and assignments record the
  verified awarding admin. No live studio mutations were used for QA.
- Signed Xcode, TypeScript and 25 focused regressions passed. The source smoke
  suite was 134/134. Task checkpoint `27332e36084623eb8b6264ea585b188277ecec17`
  is pushed. PR #50 merged as `74fcf4ef33290e55a04eb112b875d52a21b03116`.
  Preview `dpl_5JdR2W1E86L7QCL5RCLqDRyyAoUR` and production
  `dpl_ATgAhuNhdNAg7qLbitTWTzCVHJZN` were READY. The live catalog returned 71
  custom emoji and six standard categories. The signed admin Simulator opened
  the Custom emoji studio and showed the real MLB/NFL team categories and
  image rows. Guest studio requests returned 401. Both Feed entry points
  returned 200. Badge Studio loaded all six live badges and their member
  counts in the signed Simulator. The custom emoji user picker walkthrough
  remains open.

## Native admin content and operations · 25 November 2026

- Admin Moderation has native post and story directories, filters, visible
  media, author and content destinations, engagement and explicit confirmed
  deletion through the original verified role. Content queries retain the
  browser’s request-scoped visibility. Native deletion first verifies that the
  actor can see the exact record and records an audit event after success.
- Admin can review the community directory, drill into the original member
  feed when authorized, and confirm community deletion. Audit log and
  notification history use their existing visibility boundaries. They support
  the canonical action, recipient, actor, date and request filters and have
  no native write controls. No content was deleted or mutated for QA.
- Signed Xcode, Hub TypeScript, 30 focused checks, and 134 production source
  checks passed. An unsigned Release build passed for arm64 iPhones and
  emitted the existing supported-orientations warning. Task checkpoint
  `ca7a41e386ac5344e9330a3be97a4128f6bd4c52` is pushed. PR #51 merged as
  `1f0cd0d4feccc403c9aa02c0108fa92f7ede5477`. Preview
  `dpl_9iXYjktks4K2KD4WAhqKH3AsSAHb` and production
  `dpl_2HnDM7QTFHTaze4bjFdrrCnm1isn` were READY. Guest requests to all five
  admin resources returned 401 and both Feed entry points returned 200.
  The signed Simulator opened the live Manage posts screen with search.
  Remaining operations, account-provider consent and physical device delivery
  and purchase checks stay open.

## Shared native destinations · 25 November 2026

- SlipSurge links in native surfaces now share a validated router for existing
  public, social, research workspace, community, messaging, account and admin
  destinations. A member-only link presents the existing native account flow
  and can continue to its destination once the member session is available.
  Registration and password recovery reuse the native email flows.
- Exact community and chat link resolution reuses verified account visibility,
  community invitations, published paid entries, league rollout and original
  channel permissions. Linked channels carry scoped room IDs to the existing
  chat. Web navigation and catalog defaults retain their original entry points.
- Launch from the Simulator using `slipsurge-app://site/<path>`. The iOS
  handler also recognizes canonical HTTPS links delivered to the app.
  Associated Domains and external HTTPS universal-link delivery still
  require verification with the distribution team and signed app.
- Signed Debug Simulator, Hub TypeScript, 23 focused tests, 134 source smoke
  checks and Info.plist validation passed. Signed Simulator opened Connected
  accounts with real provider rows through the registered site scheme.
  Task checkpoint `0c6ad3c2bff5f68dadb0c48befc9fe1ab707f72e` is pushed.
  PR #52 merged as `db77916aff7ce4debfbfc25fe337b0e6d52555ed`. Preview
  `dpl_2CEyNtBzbgUJKeFNHtqDYp18AJiY` and production
  `dpl_14XsYEgJQcP5vuqGaQkLcXfmeGzS` were READY. Exact unknown community
  returned 404, anonymous channel resolution returned 401, and Feed and
  desktop Groups were 200. Live signed room access and external universal
  links remain open.

## Native member controls and progress · 25 November 2026

- Profile & membership now opens native Muted and blocked settings with
  current account lists, artwork, paging and explicit unmute and unblock.
  Reads use the existing member RLS rules. Reversal is scoped to the
  verified member and exact target. An ambiguous response reloads the list.
- Account has Missions and Activity Replay. Missions uses the same
  account-bound mastery computation and achievement catalog as the site.
  Activity Replay shows the existing 150 newest events grouped by local day.
  Tap an event to reopen its supported native destination. No historical
  capture or migration was replayed.
- Signed Xcode Simulator build, Hub TypeScript, 19 focused checks and all
  134 source smoke checks passed. Mutations used fixtures. Next steps are
  continuing the native research and social parity work. Task
  `cd2b10e7c2ab45d95b420e54d915cf9b4c5a9714` is pushed. PR #53 merged as
  `e8b86f8a06d06cb6984f83b54aee0e748c482830`, with preview
  `dpl_vFkNF4ZUs9sGC9vLGbFFEQqKurKN` and production
  `dpl_AnKVCxyPaWmbUXtR9BEsfpwzRksM` READY. The signed Simulator opened
  Activity Replay with existing events. Guest private routes returned 401
  and Feed and desktop Groups returned 200.

## Research launch and sportsbook preferences · 25 November 2026

- Native Research preferences use the site's saved launch and sportsbook
  defaults, current league entitlements, and existing compare-and-save
  write. The picker offers launch destinations already implemented in native
  iOS. Any saved desktop destination outside that set is retained until the
  member changes it.
- Supported shared Court and Sideline links initialize the requested board,
  date, matchup, and valid explicit sportsbook. Supported saved defaults
  apply when a restored member first opens the app without another destination.
  First Basket displays available preferred sportsbooks, and the primary book
  sets the initial choice on supported single-book boards. Pregame remains
  the default. Available research snapshots and ranking pools stay on the
  canonical server routes.
- The picker uses native team and sportsbook artwork. The Kalshi docs icon
  and the Polymarket brand-kit icon are bundled, with source provenance from
  [Kalshi](https://docs.kalshi.com/) and the
  [Polymarket brand kit](https://polymarket.com/uk/brand).
- Signed Xcode Simulator, Hub TypeScript, 26 focused tests and 134 source
  checks passed. Task `36d0bd4ac39f100a432255fd2e2cd0b8d445bd40` is pushed.
  PR #54 merged as `22bf135298f5168d9fa20dd06116d599a2ecde67`, with preview
  `dpl_CV3yEJJYq8tXdmGRAcgepvZr9Sat` and production
  `dpl_AfwFpKF5zt8pNBrzyVR66KntCmC9` READY. The signed Simulator loaded the
  live preferences and sportsbook artwork, then separately verified a Court
  link opened the Odds Board with DraftKings selected. No production account
  preferences were changed for QA. Both Feed entry points returned 200.

## Native Explore, search and league profiles · 25 November 2026

- Native Explore and topics use Basic gating, audience visibility, original
  feature switches and live site data. Explore includes current league score
  cards, research entry points, trending posts and picks, publications,
  communities and member spotlights with follow controls.
- Search includes the original members, posts and picks, topics, communities,
  live rooms and events, and the canonical NBA, NFL and MLB directories when
  allowed. Saved searches use the existing account-owned store and local
  recent searches stay scoped to the member. Pick search includes stored
  player names inside tracked picks and parlays. Feed filter links open the
  native picks or trending selection.
- NFL player profiles and team rosters use the existing team and player
  routes, headshots and team artwork. The SwiftUI player screen includes NFL
  game logs, last 3/5/10 bars, bio and Next Gen tracking. Native NBA profiles
  use the canonical directory, team roster, team and player history, and
  favorites. Specific NBA matchups use the verified game and canonical
  Court snapshot.
- Signed Xcode Simulator, unsigned arm64 iPhone Release, Hub TypeScript and
  all 134 source smoke checks passed. The unsigned device build emitted the
  existing supported-orientations warning. Checkpoint
  `bef40d09ba96ba67f01ef770be5f5ede25e57628` is pushed. PR #55 merged as
  `eb700b2b5da0782fb6a0f3d5e3ffe473f020ad6b`; preview
  `dpl_DYtZ5bzyV73e6i4bMg8r5edo4xws` and production
  `dpl_8z5xe8yWLCsqB2g3quqoxZbrX26z` were READY. The signed Simulator opened
  the real Kansas City roster, filtered to Patrick Mahomes, and loaded the
  game-log chart, L3/L5/L10 controls and Next Gen Stats destination. Signed-out
  search, saved searches, Explore, topics and NBA directory reads returned
  401. Feed returned 200.

## Direct score links and baseball Game Center · 25 November 2026

- Shared score links resolve the exact NFL stored game or ESPN event and
  retain the original Eastern slate date. Scoreboard links open the requested
  date and league when present. Provider team colors work with or without a
  leading hash.
- The native baseball Game Center adapter uses official MLB game feeds for
  inning and team totals, at-bat and pitch detail, box score, and existing
  game room, community picks and reactions. The current MLB hibernation
  switch still prevents live MLB score access. Fixture tests exercise the
  MLB data projection and the disabled access branch. No live MLB jobs ran.
- Live Simulator QA exposed a channel join ambiguity in All and Community
  Search and a missing member sort column in Community Settings. Search now
  names the existing channel-to-group FK. Native Community Settings sorts
  by the production `joined_at` field with a stable member tie-break.
  Focused tests cover both query contracts.
- Task checkpoint `70635957b6ed51ec2e6c8d81dc4ae0d57475fb1d` is pushed.
  PR #56 merged as `fceffc83d73567057ae3c9a17ddb5a13f478849c`. Preview
  `dpl_24UYxQWeXWdH817L5Aw12mTn8VqY` and production
  `dpl_5xocWko9bUFHGxxWG1e6iurbYQuh` were READY. The signed Simulator used
  the released resolver to open Miami at Philadelphia (ESPN `401909317`)
  and All Search returned the live Lakers roster. Guest mobile Search and
  Score Resolve returned 401. Desktop Feed returned 200. Community Settings
  membership sorting is verified by fixture; no member roles were edited.

## Native Matrix Marketplace links · 25 November 2026

- The native marketplace can switch leagues with league artwork. NFL and
  NBA reuse the community and personal Matrix editors. MLB keeps the
  existing Ultimate and offseason access checks for browsing and publishing.
- Existing MLB website links support the full listing list, a creator’s
  published Matrices, and an exact listing lookup with the saved rule
  snapshot. Publication links open the chooser or select the specified
  owned Matrix. The server checks publication state and member blocks.
- Hub TypeScript, 134 production source checks, 11 focused tests across
  this and the preceding score/discovery checkpoint, and signed Xcode
  Simulator build passed. The signed app opened NFL Community Matrices from
  a direct link and the live MLB directory displayed its published listings.
  Task checkpoint `2c14b90ae78feba4c40635ce5f8634f7ef235980` is pushed. PR
  #57 merged as `c2607be083611b7585969ee052565b507b0c2afb`; preview
  `dpl_4TpZm3Hfi4sqsrK1tCQMSVzQmT8i` and production
  `dpl_7GNGJxv9iYRsNSewmjaTfVhj8jcB` were READY. The signed app opened a
  published listing through its exact native URL, showing the stored rules
  and Import and Share controls. Guest exact lookup returned 401. No live
  listing was published, imported or removed for QA.

## Native MLB Research Workspace · 25 November 2026

- The native `/research` destination uses the requested Eastern date and
  exact game key, and offers the team-artwork game picker. A shared
  L1/L3/L5/L10 window drives Mechanics and MM. HR Contact Shape leaders,
  lineup and candidate filters, team artwork and player headshots, price
  movement, market-vs-season comparisons, ranks and community picks use the
  canonical captured data.
- Matchup Lab reuses the native starter usage, lineup, zones and pitch
  filters and shares the selected batter with the field and market receipt.
  The spray chart shows original Statcast coordinates and uses the
  available ballpark outline. Samples without archived coordinates stay
  unavailable. Market receipt covers captured books and specialty MLB
  markets using the current and opening prices when recorded.
- The new Mechanics read uses the archived board’s earliest qualifying
  cutoff, exact date/game/window, Ultimate and existing MLB access. It
  never rebuilds a past mechanic snapshot or reads current data in its
  place. No database change or historical replay was needed.
- Hub TypeScript, 134 production source checks, nine focused Research,
  Slate Breakdown and Odds History tests, and signed Xcode Simulator build
  passed. Task checkpoint `21d300e8d9c0ed3ac3908f8ee4f8f0f39448bb74` is
  pushed. PR #58 merged as `58757bc195db4282b5bccc68b2b1489189a2a6c0`;
  preview `dpl_G1exJ62XW6azkyN7XTQkuNqKArrd` and production
  `dpl_9q1qVoxFuzYPjFkeAmCpQ6xm8xr6` were READY. Guest returned 401. The
  signed Simulator opened the exact October 28 slate and confirmed
  matchup `849799`. No qualifying mechanics were saved for that game,
  and the workspace explained the missing sample. The October 27 matchup
  `849803` loaded the live archived HR Contact Shape and showed the Plane
  and Trajectory leaders in the signed Simulator.

## Native creator storefront, offer and access links · 25 November 2026

- Exact public creator links open Storefront, Research & Picks, Communities
  or About in SwiftUI. The creator identity, artwork, public posts,
  published offers, joined communities and signed access come from the
  existing backend. Block checks and MLB visibility also apply.
- Exact offer links open the existing branded Whop membership screen.
  Paused offers remain visible to signed-in members for access recovery.
  The checkout completion link shows the returned outcome, polls the
  original access endpoint for a pending payment, and opens the
  eligible member community or the existing billing management flow.
- Signed Xcode Simulator build, Hub TypeScript, two storefront endpoint
  fixtures and all 134 production source checks passed. No live purchase,
  restore, follow, billing or membership change was performed. Task
  checkpoint `d39fb3aff6ed31daf68e4439c84b249d720bc96d` is pushed. PR #59
  merged as `bcd312a5221af0496a9924fe520ba2c4fdf08a29`; preview
  `dpl_BLat52vdChEred6MV1uRRRkDK4ub` and production
  `dpl_DfcjUbb6SQ3KaRBUkNBp1mApcKcN` were READY. The signed Simulator opened
  the existing creator’s branded storefront and showed the active published
  membership for its owner. A follow-up adds the exact guest GET to the
  middleware allowlist so signed-out users can open the storefront and offer.

## Native MLB team rosters, Daily Recap and Matrix moderation · 25 November 2026

- MLB team links open official active rosters by position, with club
  colors, team marks, real player headshots, search and player profiles.
  The Basic requirement and current MLB hibernation visibility apply.
- Ultimate Daily Recap uses the original official home-run results,
  filters to the selected Eastern slate, and keeps game and player
  identifiers separate through doubleheaders. It includes distance, exit
  velocity, launch angle, rolling form, sortable hitters, opening/latest
  prices, and a scrubber based on captured pregame market observations.
- Admin Matrix Marketplace uses the original remove/restore actions, the
  live publication version as a concurrency check, existing audit events,
  and an explicit confirmation. QA used fixtures for moderation updates.
- Added exact guest GET routing for creator storefronts, offers and public
  score resolution. Paid access, creator operations and all write methods
  retain their own member or admin authorization.
- Signed Xcode Simulator build, Hub TypeScript, existing production source
  smoke checks and focused gate, archive and moderation checks passed.
  Checkpoint `158d469e9b9aa415abec2818ee8d9fac6751baf9` is pushed. PR
  #60 merged as `3ae26e689348eea48e7a336c85a5f63fb80a3570`; preview
  `dpl_7APrnasaiZ4xy4JQTjrjeNdvaZLP` and production
  `dpl_8AAGXKnFWzR5NintRLGNTJcVPZvV` were READY. Guest API checks opened
  the exact active creator offer, storefront, and Miami at Philadelphia.
  Guest team, recap and admin routes returned 401. The signed Simulator
  showed the 38-player Yankees roster, the October 27 Daily Recap, a real
  home-run detail and price receipt, and live Admin Matrix publications
  with their moderation controls. Unsigned arm64 device Release also
  passed. No active listing was changed for QA.

## Creator analytics, community setup and admin commerce · 25 November 2026

- Studio opens its requested products, communities, content, memberships,
  promotion, analytics or settings destination. Analytics uses the member’s
  exact creator identity and the existing thirty-day revenue, member,
  engagement and conversion inputs. Creator promotion uses the live
  storefront, its published state and native sharing.
- Free, public or invite-only communities and eligible paid membership
  communities use the standard atomic creation RPC. The initial live
  channel and owner role come from the backend. A repeated exact
  request can recover its own existing group. Artwork uploads are checked
  against the member’s existing media path and can be repaired independently.
- Admin Creator Operations lists the original owners, offers, communities,
  memberships, payment events and published promotions. Native requests
  can execute the existing creator management and promotion actions
  through the same admin and MFA checks. The browser cookie and same-origin
  checks remain in force. Paid access holds still require a reason and
  provider verification for restoration.
- Signed Xcode Simulator, Hub TypeScript, eight targeted creator storefront,
  analytics, community setup and admin access tests, plus all 134 baseline
  source checks passed. Task `00cfa748bcf7957ab5de6825bb9eb441300228d7`
  is pushed. PR #61 merged as `69d01078abf77ad56de28563c13f95afb8f14dd5`.
  Preview `dpl_DPQfQGFesyj9kCV8cNUPh2MU5stS` and production
  `dpl_2G4teDbogu1eh4oZLYa5GRif29CX` were READY. On the signed Simulator,
  Creator Analytics returned the live thirty-day data and Admin Creator
  Operations returned the creator directory. Both private routes returned
  401 to guests, while the public Feed returned 200. The live owner
  payload revealed that Store Setup and New Community needed to decode
  the existing snake_case offer, storefront and group fields. The native
  reader now applies that strategy for this endpoint. No live groups,
  promotions, access holds or creator payments were changed for QA.
  The rebuilt signed form loaded the live owner setup with logo and cover
  choices, sport, audience and public visibility. Create was left untouched.

## Story GIFs, exact creation links and Pipeline Health · 25 November 2026

- Member links open the native Story, event, and category-specific
  discussion composers. Account setup opens in Account and `/nba` routes
  to The Court. Story availability and posting still use the applicable
  account, sport and plan permissions.
- The Story composer uses the existing GIPHY picker and the viewer plays
  GIFs from the trusted media providers or the member upload path. Reduce
  Motion uses an image. The signed iPhone 18 Pro Simulator loaded live
  GIPHY Trending inside Stories and selected a GIF into the unsent preview.
  The GIPHY SDK build configuration belongs to the Mac’s ignored
  `ios/LocalAuth.xcconfig`. The key stays out of Git and chat handoffs.
- Admin Pipeline Health lists current schedules, last runs, freshness,
  queue and Statcast counts, and the Browserbase usage budget. Existing
  manual actions retain explicit confirmation, audited authorization and
  browser origin checks. Native writes require the admin MFA session.
  No collector, queue retry, refresh or other live operation was run for QA.
- Hub TypeScript, all 134 production source checks, and 13 focused
  story-media, pipeline, discussion, event and link checks passed. Signed
  Simulator builds succeeded. Task `12337467897ea7e54af15b889a7c3d79823ffe03`
  is pushed. PR #62 merged as `aa3d7c7454a8c551e6236f43681f47e4348ddfc5`,
  preview `dpl_CuR9kPwgnYKVPzRme6VTGVsGfdEq` and production
  `dpl_9oW1BkeFL4JLSvg1XHLwrn4UhD4P` were READY. The signed Simulator
  showed Operational Queues and Browserbase Usage. Guest Pipeline Health
  returned 401, public Feed 200. Physical signing and notification delivery
  still require a provisioned Apple team and test device.

## NBA exact research links, sportsbook comparison and Market Story · 25 November 2026

- The Court ingests the website’s shared date, game, Pregame/Live mode,
  market, side, book, compare books, line, contract, target, sort and
  player panel. Its navigation uses a replaceable research path so incoming
  links can select a different board while a detail is open.
- Compare Sportsbooks and Prop Ladders use the recorded player and exact
  price contracts, team colors, headshots, book artwork, MM and live
  member book preferences. The independent Odds Board remains accessible.
  Player research links can open Trends, Ladder, Market Story, Tracking,
  Shot Map and Markets. The Share control produces eligible exact site links.
- Market Story reuses the existing phase-filtered NBA history and calculation
  routines. The mobile projection includes visible captures, observed prices,
  exact contract baselines, line movement, direction and minimum-move filters,
  plus recorded player charts. Later openings stay outside earlier replay
  captures, and prices at different thresholds cannot form a price change.
- Signed Xcode Simulator, Hub TypeScript, all 134 production source checks
  and three focused archived-market tests passed. The signed Simulator
  opened the November 24 Detroit–Orlando snapshot and Wendell Carter Jr.’s
  exact DraftKings under 7.5 rebounds at +110, with Orlando artwork, L3,
  L5, L10 and L20 samples and observed red/green game bars. A second exact
  link replaced the open player with Compare Sportsbooks and another opened
  Prop Ladders with DraftKings selected.
- Task `305ab549c21399d00ad34ec0fbd8ab463cd185f6` is pushed. PR #63 merged
  as `aa9526523a418ae511fa169c940cc5cb50d9abf5`. Preview
  `dpl_3gY6hEGu22j1W17QYHqwyZdHrPbc` and production
  `dpl_4z7zvknnC6HNxLb3FkdZE56C6Mqe` were READY. The signed Simulator
  opened the exact player Market Story. The last pregame capture was
  6:58 p.m. Eastern, +110 against the recorded +102 opening, and a
  1.9 percentage-point lengthening. Guest Market Story returned 401 and
  public Feed returned 200.

## NFL Usage, Tracking, Matchup Lab, custom views and capture replay · 25 November 2026

- The Sideline adds Game Day player rows, Usage, Tracking, Team, All and
  Custom, plus the eight original Matchup Lab views. Cards show the same
  frozen sample, team tendencies, role metrics and verified odds inputs.
  They preserve missing measurements and show unavailable prices while
  lineup verification is stale.
- Links can resolve an exact NFL game even when the date is omitted, select
  the original sample, open a supported prop ladder with its player and
  rung, or open Market Story at the requested historical capture. Custom
  metric visibility and order persist on the iOS device for the signed-in
  account. The browser persists these layout choices locally as well.
- Market Story resolves against the existing kickoff-bounded archive
  index. It identifies saved player, book, line, opening, price and receipt
  times, carries the legacy verification state, and keeps the opening price
  comparison at the same exact line. No live refresh jobs were invoked.
- Signed Xcode Simulator build, Hub TypeScript, 134 baseline source checks,
  and six combined NBA and NFL archive and authorization fixtures passed.
  Task `23a4edcf00d984d22b30609a952ac2f9de1b49cf` is pushed. PR #64
  merged as `48ec595f33fce52c5433fdfa07b52f5949da774c`, preview
  `dpl_Cv9NthdvjtBgpHM9C5zQ2cVVTUnj` and production
  `dpl_GxqwKhJjwGJK7qk3Ttp3AUhK98LK` were READY. The signed Simulator
  resolved `2026_09_TB_CHI` without a date and opened the November 8
  Usage board with the 2026 regular-season sample and a verified 8:20 p.m.
  Eastern cutoff. Matchup Lab showed Tampa Bay’s team tendencies and
  Role Command. A shared historical link opened Colston Loveland’s
  FanDuel receiving-yards capture at 8:19 p.m. Eastern. All three guest
  mobile research, schedule and archive queries returned 401. On the
  NBA player board, the previous-capture control selected 6:56 p.m.
  Eastern and correctly reported that the exact DraftKings line was
  absent from that frame.

## NBA player comparison, Watchlist and Odds Board artwork · 25 November 2026

- The Player Board compares up to three players from the same observation.
  The sheet shows team-colored portraits, recorded averages, minutes and
  L10 for the selected market and venue. Player rows and trends share
  home and away sample filters. The signed Simulator selected Cade
  Cunningham and Jalen Duren and showed their archived averages together.
- Pregame player trends and First Basket offer controls build the site's
  exact validated pick legs. Members can manage their Watchlist selection
  or open an unsent pick draft. The new read path is limited to the
  current member’s pending NBA selections for the requested game.
  The existing write path rechecks the sportsbook quote and cutoff.
- The shared NBA and NFL Odds Board filter sheet shows official matchup
  marks and team options. Opening a selected game takes effect on the
  initial display. Explicit NBA sportsbook links retain their selected
  book when that book has no prices in the observation.
- Signed SwiftUI compilation, Hub TypeScript, 134 baseline source checks
  and seven targeted replay and Watchlist checks passed. Live changes
  to Watchlist or published picks were not necessary for this checkpoint.
  Task `68fbfc0c90bcd1e45d7989a8f2e8cb95f61ff80d` is pushed. PR #65
  merged as `168bced12b3d5be75e0ded35e6a6b4986362937e`, preview
  `dpl_GexF6rsEyfaWZnALLeGLJkgMtd1z` and production
  `dpl_7WfFsuEfSRTPBYUpG53jffT9UsnW` were READY. The signed Simulator
  opened DraftKings rebounds on the selected matchup and showed the
  branded matchup controls in the Odds Board filter sheet. The exact
  guest Watchlist query returned 401 and public Feed returned 200.

## Native Discord administration · 25 November 2026

- Admin has native server enablement, configured alert channels, tier
  role mappings, app and creator delivery status, delivery queue history,
  command inspection and the original confirmed operation controls.
- Post to Discord includes the channel, message, title, body, color,
  hyperlinks, author, footer, Photos attachments, live draft preview and
  explicit confirmation for the posting channel. The existing handler
  restricts posting to the configured guild. The native audit record
  contains the operation and channel without the message body.
- Bearer admin routes require existing account assurance. Discord settings
  save against their observed version. Browser callers retain their
  existing session and origin checks. Xcode signed Simulator build and
  the 134 production source checks passed. Write QA used a fixture channel
  and modeled configuration versions, with no real Discord posts, role
  synchronization, command changes or delivery canary requests.
  Task `b970578267b4c41dff7395c51140367f5f091c27` is pushed. PR #66
  merged as `1c20cd615399124de6384192a436d43816e7da34`. Preview
  `dpl_5cXC5SEPohzvoDMRA4Ym72Rr9zzG` and production
  `dpl_2huytk3AduvqV5f3asWN1QLEK9Ch` were READY. The signed Simulator
  displayed configuration-presence indicators for the server credentials
  and opened the true channel picker, embed fields and Photos controls
  in the composer. No credential value was returned or viewed.

## Native cross-device session resume · 25 November 2026

- The app reads the signed member's existing `member_context_handoff` row
  and surfaces supported saved destinations on launch or foreground.
  Resume retains safe canonical URLs, Feed filters, and eligible research
  date, game and board context.
- Native Feed captures deliberate scroll activity. On current iOS it
  restores the saved offset after content loads and can request a bounded
  number of older posts to reach the position. Other compatible iOS
  versions restore the destination and filter.
- The mobile save uses the observed server timestamp as a concurrency
  check and brings up the new destination on a conflict. The existing
  Windows and web session writers, service, and schema remain in use.
  Auth callbacks, private query secrets and administrator paths are
  excluded from resume.
- Signed Simulator build, Hub TypeScript, all 134 production source
  checks and four focused Discord and session-route fixtures passed.
  Task `7e9148109315bdc1041971ebaeedf71c07aba088` is pushed. PR #67
  merged as `8e784ea6183e89b8e127d5b54fe0b8f87c91f816`. Preview
  `dpl_4U39ccvgZS4VQc4Z9Hzam7JYAwQi` and production
  `dpl_Cy778NjJ5naS2bcMrPrFkiyPwCBY` were READY. The signed Simulator
  showed the member's existing resume offer and opened its saved community
  settings. Guest resume returned 401 and public Feed returned 200. Exact
  Feed-offset verification is tracked separately.

## NFL player comparison, VOLT and GIF configuration · 25 November 2026

- The Sideline compares up to four athletes side by side. Matchup and NFL
  Tracking show the selected original game and historical sample with team
  backdrops, portraits and signed metric colors. Sportsbooks uses the exact
  frozen game, recorded primary prices or alternate lines, opening prices,
  observed picks and verified final results. Unverified lineup pricing is
  withheld. The original two-sided first-touchdown contracts grade Yes and
  No separately.
- Feed, Discover and the three league workspaces open the original VOLT
  Sparks teaser in a native popover. The number-seven portrait animates
  while visible and respects Reduce Motion. The Court uses its basketball
  jersey variant.
- The Mac’s local GIPHY iOS SDK key is configured as
  `SLIPSURGE_GIPHY_IOS_SDK_KEY` in the ignored, mode-0600
  `ios/LocalAuth.xcconfig` file. The signed Simulator loaded Trending,
  searched for “basketball dunk,” and inserted a GIF into an unsent Feed
  draft and an unsent Story draft. Store and distribution builds need their
  own supplied build setting. No live posts were made during GIF QA.
- Hub TypeScript, 134 baseline source tests and five targeted checks for
  NFL samples, exact captures, contract sides and inactive prices passed.
  Task `575b61dd841bb266e51f403ecc0321be2f10ac1a` is pushed. PR #68 merged
  as `2e230d31e3089292899a03a3a1b89f41e189fd3c`. Preview
  `dpl_7YB52qYWvBk52DxHB1VCsAitAyV4` and production
  `dpl_6qHPa3tbQ6gtYPu6njNmyXaKBvSN` were READY. The signed Simulator showed
  D’Andre Swift and Colston Loveland together for the November 8 matchup,
  with player portraits and the recorded opens from DraftKings, FanDuel and
  other suppliers. It also opened the VOLT Sparks popover. Guest comparison
  returned 401 and public Feed returned 200.

## Native social platform settings and Browserbase operations · 25 November 2026

- Edit Profile includes the browser’s configurable public social handles
  with real platform icons and keeps the separate OAuth account controls.
  Public profile badges use the configured order, retain badge-only
  platforms and prefer an authorized provider’s verified handle. Member
  edits preserve unrelated and retired handles and detect concurrent saves.
- Admin Social Platforms reads the same `social_platforms` table and uses
  the site's image uploader and administrator permissions. It adds and edits
  platform names, profile URL templates and artwork, and confirms deletion.
  Writes use known row values and preserve existing members’ stored handles.
- Native Browser automation is available from Admin and Pipeline Health.
  It includes the same project estimate, spending thresholds, UTC transfer
  chart, attribution, plan limits, extractor sessions and recent redacted
  session details. The endpoint reads the existing cached project summary.
- Feed now uses a lazy SwiftUI scroll container for precise current-iOS
  position restoration. The previous signed build reselected the saved
  Picks filter, but the list left it at the top. Before/after live position
  checks belong to this checkpoint.
- Signed Simulator compilation, Hub TypeScript, all 134 production source
  checks and four focused public-link and resume checks passed. Task
  `d1688d3f96e4c50a98a7f574a8056b04eab12f4b` is pushed. PR #69 merged as
  `bc426f45d8da72c52960914046c60d5a7373a8b3`. Preview
  `dpl_Eft6wJGFUKyPCjcDF6hyAYmurYUq` and production
  `dpl_27Gk6sRiaaGSc3QDRwaNaEcjQi32` were READY. Signed live Browserbase
  showed the actual spending thresholds, cost summary, extractors and
  sessions tabs. Signed Social Platforms loaded the configured provider
  artwork, and Edit Profile showed the public social-links section.
  Guest requests to both admin routes and Edit Profile
  returned 401. Public Feed returned 200. No admin writes or sessions ran.

## Native email operations and Feed resume anchors · 25 November 2026

- Email Operations shows the existing Resend readiness indicators, seven-day
  delivery counts, recent delivery states and four branded template previews.
  Signed admin access uses the existing account assurance checks. Test send
  is confirmed for the administrator's own account. A retry uses the same
  request identifier. The browser's email controls and recipient flow remain
  in use. Email send checks exercised a fixture transport.
- The signed Simulator restored the same live Picks post after relaunch.
  The pixel-only attempt landed approximately one-sixth of a screen lower
  within that post. Native saves now include the first reliably visible
  post plus the browser-compatible offset. The native loader uses the post
  anchor when present. Older saves and missing posts use the scroll offset.
- The signed iPhone 18 Pro Simulator build passed. Five targeted email and
  resume tests passed, including provider idempotency, account scoping and
  the stored post anchor. Task `0c164b2ca75ee67bfb6993c41b9d7a8b2c49cc3d`
  is pushed. PR #70 merged as `d95e60c201b64bf7f26bf122b134085aeba21008`.
  Preview `dpl_2czt67yBmeJ7sRRMiRFG3YJC6gqH` and production
  `dpl_5yhQ8oVSqKT6fA1GYbXeDwCbhiXp` were READY. The signed Simulator
  displayed the Resend indicators and rendered the exact branded Security
  email. The signed-webhooks indicator reported setup is needed. No test
  email was sent. Guest email operations and template reads returned 401.

## Native Whop merchant controls and membership billing · 25 November 2026

- Whop Payments adds the commerce ledger and account-scoped fee table,
  connection and webhook readiness, the explicitly confirmed native
  creator-event test control and the original read-only billing verification.
  The verification keeps its separate AAL2 rule, rate limit, provider
  ownership checks and boolean-only results. Browser requests keep the
  existing origin and assurance requirements.
- Member billing reads current eligible offer IDs and pricing from the shared
  membership policy. The native screen opens the selected term, shows the
  existing plan label, links Whop accounts through the native connection
  screen and opens creator subscriptions. It preserves the server's
  purchased-tier and access gates and communicates the possible immediate
  end of trial access when canceling.
- Signed Simulator build, Hub TypeScript, 134 baseline tests, and 52
  commerce, provider and billing verification checks passed. Task
  `3dd7ba56c4994fec6fdd06e7c96525533f2ff115` is pushed. PR #71 merged as
  `d19b9c2c2c404be445a88165feef650d2d6f9127`. Preview
  `dpl_98R68nWVwN85w5SfggDv96ZxzpTt` and production
  `dpl_AD1cMuMvPXt1jqkLxU8zNzTXtWsQ` were READY. The signed Simulator
  opened the live merchant ledger, creator payment connection, and the
  SlipSurge platform fee schedule with the original Card Processing row.
  Guest billing and merchant routes returned 401 and public Feed returned
  200. No checkouts, cancellations, provider delivery tests, billing repairs
  or money movement ran in production QA.

## NBA verified results and cached artwork · 25 November 2026

- The Court shows the existing game-results service next to player rows,
  trends, sportsbook comparison and ladders. The same observation powers
  player comparison and The Public sorting. An in-progress box score
  appears only in Live mode. A verified final appears alongside the saved
  snapshot, without adding that game to the sample or changing its prices.
- The signed Simulator opened Wendell Carter Jr.’s November 24 line and
  showed 13 final rebounds, a Miss for the recorded DraftKings under 7.5
  at +110, and the previously verified red/green L3, L5, L10 and L20 form.
  NBA access, replay and archive fixtures passed 33/33. The fixture for
  the native adapter now exercises the exact results passthrough.
- Shared logo and portrait views reuse a bounded in-memory image cache and
  combine concurrent requests for the same asset. Image decoding runs off
  the main actor. The signed build and compact guest Feed worked with the
  shared loader. No device-level rendering timing is claimed.
- The revised Feed save reopened the same anchored Picks post after an
  app relaunch. The observed viewport differed by roughly six percent of
  the screen as the anchor aligned the card. The web-compatible scroll
  offset is still part of the shared record. Task
  `99ee412fdd0fc81ab6f04de726f701f9f54e912f` is pushed. This checkpoint
  adds iOS presentation and fixture coverage using the existing live API.

## Apple association, device signing and privacy manifest · 25 November 2026

- Canonical `www.slipsurge.com` has a configurable universal-link association
  route for native product content. It publishes only explicit registered
  Apple app IDs and keeps OAuth, API, admin and creator checkout returns
  with their established handling. The route is inactive with no app IDs.
- Xcode has device-only bundle-ID and signing-team settings and a distribution
  entitlement file for Associated Domains and APNs. The Simulator keeps the
  same signed development identity. Both build products package the native
  required-reason manifest for app preferences and the research timer.
- The association fixture, Hub TypeScript and all 134 baseline checks passed.
  The signed Simulator compiled and packaged the manifest. An unsigned
  generic arm64 iPhone Release compiled and honored the test bundle-ID
  override. The test override was passed on the command line only.
- This Mac reported zero valid signing identities and only simulated devices.
  Apple’s actual app ID, matched provisioning, AASA configuration and a
  physical iPhone are still needed to verify universal links and real APNs.
  Fresh social-provider consent, StoreKit purchasing and privacy disclosures
  also remain open release checks.
- Task `02276a3b3ad4969284a364478dfcbb01d25dee9d` is pushed. PR #72 merged as
  `fc8e5019e0c75815330be777bc0d23c212428161`. Production deployment
  `dpl_BteTUana8w67F6RHimPiUJ9pETPp` was READY. The public well-known route
  returned the expected JSON 404 with no registered app configured.

## Platform settings and registration · 25 November 2026

- The native Create Account flow now checks the current registration setting
  before showing email setup or the branded Whop, Discord and X buttons. It
  checks again immediately before starting a signup. The two steps include
  username, display name, and the site's sports and league artwork. The existing
  Supabase registration trigger remains the final enforcement for new users.
- Admin can open the site's general settings, social login readiness, article
  provider status and custom code in native screens. Each change saves one
  setting with its observed value, under the existing database role policy.
  Stale updates return a conflict and the app audits only the setting key.
- The signed Simulator build and Hub TypeScript passed. The Hub suite passed
  138 checks including four targeted settings, registration and AASA checks.
  A local Postgres fixture ran the exact migration with role checks, missing and
  nullable rows, stale edits and an exact long code value. Next verify the live
  reads and both signup steps after the narrow release. No production setting
  or registration was submitted during QA.
- First task checkpoint `c51f340617dc72a5d23b0ad8e6d0840b3b5f2489` is pushed.
  PR #73 merged as `3eda8a0c10d45d8cf580b6c9386bfcaf9eed7484` with preview
  `dpl_E7iL4htLkvw6AW7g8BxNzb9QzKwB` and production
  `dpl_7SmAeTgVDQRG848657xE6dZc6Rra` READY. The reviewed function migration
  was applied individually as `20261125164733_native_platform_setting_edits`.
  Its tracked source bears the proposed version `20261125172000`. Do not
  replay it. Live metadata confirmed invoker execution with no anonymous
  grant. The registration API returned the current status and seven sports
  with no-store headers. An anonymous admin request returned 401. The
  signed Simulator opened live Platform Settings and Social Login after the
  native admin deep-link routing correction. No live settings were edited.

## NFL tester controls and admin links · 25 November 2026

- Native Admin → Members → NFL early access uses the existing member
  directory, NFL beta grants, pagination and audit service.
  The app shows member avatars and the NFL shield. Both grant and revoke
  require confirmation. The native API preserves the existing administrator
  and enrolled-MFA requirements. It writes only the NFL early-access row.
- Links to existing native admin sections now open those sections directly,
  including changelog, banners, banned members, reports, deletion requests,
  posts, stories, articles, pages, events, forum and audit. The same change
  routes the platform settings links through the signed-in destination.
- Signed Simulator build, Hub TypeScript and 140 checks passed. The NFL
  fixture exercised web and native grant and revoke, invalid requests,
  regular/Ultimate role denial, MFA, and the preserved user role. No live
  grant or revocation ran. Signed live directory and route checks follow
  the narrow Hub release.
- Task `40d9ffdb7ec538b57dffdb69f96633da06e89bb6` is pushed. PR #74 merged
  as `2eb5d0c83cb5c210129c59966488cced767cd913`. Preview
  `dpl_7kVNVJhAXHY7Y4GFF3zhmzJBerJu` and production
  `dpl_9Re22S8He6i5MY4geDcAgFoaoJ5z` were READY. The live signed app loaded
  the approved tester list and handled an unmatched member search. The
  guest endpoint returned 401. No access grant was changed.

## Compact registration and recent sign-ins · 25 November 2026

- Create Account is accessible above the fold on the compact phone sign-in
  screen. The iPhone 17e Simulator opened the two-step flow, showed the three
  branded social providers and Apple's strong-password suggestion, and let
  QA select NBA alongside NFL in the native sports grid. The draft used a
  fixture address and was closed before account creation. Fresh provider
  consent and email confirmation remain separate checks.
- Added Recent Sign-ins to the admin Members area. It shows the same bounded
  sign-in sample as the website, newest first, with member photos, timestamps
  and the 15-minute indicator. The native route reuses the admin role check
  and returns the directory projection. The browser route was untouched.
- Signed Simulator, Hub TypeScript and 144 checks passed. The admin fixture
  verifies permissions, sorting, the 15-minute distinction, and omission of
  unrelated account fields. Signed live directory QA follows the Hub release.
- Task `bfb143afc6801bf82e5fc19e320b20c812e6a83b` is pushed. PR #75 merged
  as `10c4730d3334951c8fe1b9b41da3d2058e1dd3c3` with preview
  `dpl_J2AmQ4Y3h1E4euLQg8h7he1BoMp5` and production
  `dpl_5M1QaDfzSeRgob6HvDdFPKMJtUa2` READY. The signed Simulator displayed
  the live sign-in directory. The anonymous endpoint returned 401.

## Website experience audit and local device alerts · 25 November 2026

- Native Admin → System health → Experience audit uses the same website
  telemetry calculations and roadmap as the browser. It includes recent
  route health, inspected route dimensions, family and priority filters,
  sorting, and the roadmap details. The data here describes the website.
  Signed live QA follows the Hub release.
- Sign-out holds device alert registration while removing the device. The
  app waits for an in-flight registration request before it removes that
  token and ends the session. The already-released Supabase device and
  delivery tables were confirmed present by read-only inspection.
- Signed local Debug, Hub TypeScript and 146 checks passed. An isolated build
  with the temporary development-alert setting showed Apple's permission
  prompt and a locally injected foreground banner in iPhone 18 Pro Simulator.
  Injected alerts used a fixture ID and did not contact APNs. The Simulator
  did not establish a server device registration. Opening a production alert
  and physical Apple delivery remain unverified.
- Task `53b3ec9418273468e6e3df165d18b4c1e03d3af8` is pushed. PR #76 merged
  as `fa89217a04b29cd35e17a852ef4e5d690c0ae9e5`. Preview
  `dpl_4gQepVBeia1FzkntVECk69sJ91Qw` and production
  `dpl_EBM3vWZE2w9vetsg8u6CaxsNM3a8` were READY. The signed Simulator
  showed live website traffic and the 163-route audit. Searching for The
  Court returned its route and opened the dimension detail. A guest request
  returned 401. The standard signed app was restored after the alert test.

## Avatar styles and sportsbook badges · 25 November 2026

- Profile and Edit Profile now use the existing avatar style, custom ring
  color, original decoration catalog, and six sportsbook choices. The avatar
  style picker offers search, sport categories, preview, and the existing
  save action. Shared Feed, story, chat, and notification avatars use the
  saved artwork and colors. The profile displays the selected sportsbook
  logos in saved order.
- All 50 decorations come from the site's original artwork. The bundled
  vector animations play in the large profile and picker preview when
  Reduce Motion is off. Lists use the original still artwork. The native
  rings are drawn with SwiftUI. Run `node ios/scripts/build-avatar-artwork.mjs`
  with the Hub dependencies and standard Node installation to regenerate
  both app resources from the web catalog. Use `--check` to compare them.
- The native settings request keeps older clients and saved legacy books
  working. Individual avatar and book edits compare their original database
  values. A conflicting edit returns 409. The web settings form consumes the
  shared six-book list with the same order, labels, art and behavior.
- The generated-resource check, signed Simulator build, Hub TypeScript,
  and 149 targeted and baseline checks passed. The catalog, animation and
  cross-surface artwork still need signed and compact checks after the Hub
  release. No live profile appearance was saved in this checkpoint.
- Task `d43bbd5b9da9913fc456dc6d54871081e6b866c8` is pushed. PR #77 merged
  as `e5add08181b377cb6cc50c52b13daf2ace5f4025` after preview
  `dpl_6aRhZLqrrtEw5ySHyjcWLSiRWrqE` was READY. Production reported READY for
  this commit. The compact guest Simulator rendered the saved animated
  Seams decoration and both public FanDuel and BetMGM logos. The signed
  Simulator previewed Tight Spiral and applied it to the local draft. The
  draft closed without saving to the member account. Public Feed and Profile
  returned 200 with the updated projections.

## MLB admin archive · 25 November 2026

- The native archive uses the same saved MLB game, frame, quote and research
  reader as the administrative website. It includes the first genuine frame
  and up to 30 most recent pregame observations, captured times, matchup and
  book artwork, player and market search, and the original research inputs.
  Missing start times and missing historical observations stay unavailable.
- Both entry points preserve administrator and enrolled-MFA checks. The
  archive reads the primary SlipSurge database only. It adds no collection,
  recovery, replay or database write. Normal MLB hibernation remains governed
  by the site's existing access policy.
- The primary database had 116 pregame frames for October 27 game `849803`
  before the saved cutoff. The targeted fixture exercises the retained first
  frame, 31-frame cap, cutoff and access failure cases on both entry points.
  Hub TypeScript, 140 checks and signed Simulator Debug passed. The archived
  live screen follows the reviewed Hub release.
- Task `df0db0042d27a7600f1f57f57a8b80a3eb5c1da8` is pushed. PR #78 preview
  `dpl_HibUZ7AtnYj5qWGke2i5GHbUjWph` reported READY and merged as
  `612bd3470ccfbe351b4d4819d50c10bf0c841697`.
- Production `dpl_6gYpmwcs7FH6VAnvobYexxfw73Hr` was READY. The signed app
  opened game `849803` at original frame `1757465`, captured October 26 at
  11:13 p.m. ET before the October 27 8:00 p.m. ET cutoff. The separate
  pregame research input and a saved FanDuel market row were visible. The
  guest archive endpoint returned 401.

## Profile edits from multiple devices · 25 November 2026

- Native profile saves now include only the edited text fields and compare
  each original field value. An appearance-only save leaves concurrently
  edited names, bios, locations and websites intact. The server still accepts
  the text format already used by older app builds. Its fixture exercises
  nullable values, omitted fields, empty edits, and stale edits.
- Signed Simulator Debug, Hub TypeScript and 135 targeted and baseline
  checks passed. None of the fixture edits reached a live profile.
- Task `2203131a2b160056e35acd920319d574ec383d13` is pushed. PR #79 merged
  as `a3eb17cb6a8416535ed8e5f2b9366e8a2f83067c` after preview
  `dpl_FL638EMcTS5nrb92LPAqvr1jxkqE` was READY. Production
  `dpl_Bs9yxxzR2kuVo9PLcC24JEwq9XJj` reported READY.

## Native Matrix backtest · 25 November 2026

- Admin → System health opens Matrix Backtest. It contains the saved Element
  Code and date inputs, precision and recall, F1, game-level flags, actual
  home run hitters and the step that excluded each missed hitter. The native
  adapter uses the website's original evaluator and adds its team artwork.
- The admin and enrolled-MFA checks run ahead of archive or evaluator reads.
  The existing MLB off-season switch remains in force. The app displays the
  pause from the server. The active-path fixture calls the same evaluator
  contract with its saved factors and 14-day bound. No production backtest ran.
- Hub TypeScript, signed Simulator Debug and 143 checks passed. The route
  regression fixture stubs were updated for two dependencies added to the
  existing proxy and game page since the test was written. No route behavior
  changed in those files. Live paused-state verification follows release.
- Task `285fe61a609a5730712d43936baa3a22d1960a44` is pushed. PR #80 merged
  as `37a58efcff0a9c1d0e8c4adb044f53578468024a`. Preview
  `dpl_FFhac1i5wjfVdXZwfKKoyYexxfw73Hr` and production
  `dpl_GptzAY8Kv6orgMYmkmidn9vFBYVn` reported READY. The signed Simulator
  opened the production tool and displayed the off-season pause alongside
  the saved Matrix inputs. The guest endpoint returned 401.

## Native HR Intelligence · 25 November 2026

- The native administrator view uses the existing HR Intelligence evaluator,
  which keeps the original coverage thresholds and the off-season guard. It
  includes branded game selection, both pregame reads, the complete player
  board, each market and MM window, separate postgame grading, and detailed
  home run settlements. The website uses the same shared reader and labels.
- Native artwork follows the existing player and team IDs. The read endpoint
  uses the established five-minute analysis limit. An incomplete exposure
  fixture received 503 and no rank data. The active-path fixture verified the
  original response and the added team and player artwork separately.
- Signed Simulator Debug, Hub TypeScript and 144 checks passed. The native
  signed-in Simulator opened the production view and displayed the
  off-season pause. The public endpoint returned 401. No live analysis ran.
- Task `112390b5ad532e504ceb47050c8d0664c6e95fac` is pushed. PR #81 preview
  `dpl_4qMYwKSHnxnogVUvGrYVRpRnmdb2` and production
  `dpl_2E8KatsWWub1MFt8QbtizyKgs45J` reported READY. Main is
  `a980f5513d0da72ca953e89fedb8cf1a1b8607dd` at this checkpoint.

## Native profile statistics and creator links · 25 November 2026

- Native profiles show the original post and repost counts, joining month,
  saved sports, and the visible pick record and win rate. A paged activity
  request keeps the first page's details in view and skips the extra counts.
- Creator profiles use the website's account and approval rules, list six
  active offers and six published owned communities, and open the native
  storefront, offer and community screens. Creator Studio remains on the
  owner's profile. Replies show linked context and suppress spoiler excerpts.
  Community rows retain visible member roles and the existing MLB gate.
- Signed Simulator Debug, Hub TypeScript and 148 checks passed. The fixture
  covers guest/member reply visibility, private records, scoped counts and
  offers, and spoiler and block behavior.
- Task `42ba1220526822bb12322b441756b55d82343b4f` is pushed. PR #82 preview
  `dpl_2h8bzSbpFWPZSswoq8UWE86JejMU` and production
  `dpl_6S4A9DRGW5kwddyAvma491ALPFmi` reported READY. Main is
  `c39b51d7d0f7d87fdb629533e3aea56167279f8b` at this checkpoint. On the compact
  guest Simulator, the live ParlayParty profile showed the joining month,
  activity counts and both saved sportsbook logos. Its visible $1 offer
  opened the native membership detail with the sign-in gate.

## Native design system · 25 November 2026

- Admin → Settings and the existing design-system link open a SwiftUI
  component lab. It uses app colors, sportsbook artwork, shared touch
  feedback, native status examples, a live toggle, and native sheet controls.
  The direct link verifies administrator access with the existing workspace
  endpoint. The demonstration has no account or notification writes.
- Signed Simulator Debug passed. The existing administrator account opened
  the live-gated screen and used the Liquid Glass Preview button to open the
  native sheet. Earlier supported iOS versions use a bordered action.
- Task `2447b0418722e15ba27e8cc03f09af03af2bb0ba` is pushed. The previous
  profile and archive verification was sent to the shared Cloud chat.
- Primary database inspection found the canonical Market DNA archive and
  Contact Recap job table. The existing Market DNA player analogs, older
  game fallback and Contact Recap near-home-run input call the separate
  legacy MLB project, which workspace instructions place outside this task.
  Complete native versions of those reads still depend on equivalent
  approved primary sources. No legacy connection or job replay was used.

## Native Contact Recap export history · 25 November 2026

- Admin → System health and the existing Daily Contact Recap link open the
  native export history. It shows the active stages, progress, failure state
  and actual export format. Completed files use a short private link and
  the native share and save panel. The download expires no later than the
  original job and cannot follow redirects to another server.
- The native server reader uses the primary export queue, checks the same
  signed-in admin and enrolled-MFA requirements, and gives the app no direct
  read access to the private storage bucket. Signed Debug, Hub TypeScript
  and 141 checks passed. Fixtures cover non-admin access, running and expired
  jobs, and the download lifetime.
- Task `ff6fc14bfbff6bc71f87be2130f317bd5bc51748` is pushed. PR #83 preview
  `dpl_3eTWhkeW6aRMYXxTg5JfJw3vjoQY` and production
  `dpl_5DQ3MkTow5NYUdo64v86TX4wGGc9` reported READY. Main is
  `544c1f3636d992c50a3985448db60ebd5c00dbe9` at this checkpoint.
- The signed Simulator opened the production screen, showed the off-season
  pause, and matched the primary queue's empty state. The guest endpoint
  returned 401. Live export download and the original preview, capture and
  retry paths remain open. This checkpoint queues or replays no export.

## Compact profile and full native regression suite · 25 November 2026

- Profile tabs keep the header and use a loading or retry state for the
  selected activity. Late responses cannot replace a new tab's content. A
  paging conflict that revokes profile access removes its visible activity.
  The compact four-stat grid uses two columns, with a separate native layout
  for six stats. The storefront action uses the SlipSurge lime.
- Built and installed signed Simulator Debug on iPhone 17e and iPhone 18 Pro.
  Live ParlayParty Replies showed its empty state and no prior posts, the
  compact profile showed four stats in two rows, and the signed account's
  Story composer showed live GIPHY Trending and its attribution using the
  supplied Mac key. The key remains only in the ignored local settings and
  build products. No Story or post was submitted.
- `node --import tsx --test scripts/native-*.test.mts scripts/production-smoke.test.mjs`
  passed 286/286. Hub TypeScript passed. The restored Matrix fixture stubs
  the already shipped private listing reader and verifies blocked-author
  behavior. The runtime Matrix route did not change.
- Task `46d489f50dfc3c317b1c6b34c731ab862ea27d40` is pushed. Production home
  and public Feed returned 200 after the native API releases.
- Xcode 27.2 build `27B52` recognizes the SlipSurge scheme. The project was
  opened on this Mac. The window control surface returned `cgWindowNotFound`
  during the last verification. `devicectl` listed two simulators and zero
  physical devices. The signing keychain had zero valid identities. Device
  signing, live APNs, fresh Discord/X/Whop consent, real checkout and
  StoreKit remain unverified. Market DNA player analogs, the legacy Contact
  Recap data and the desktop MLB importer paths still require resolution of
  the separate legacy data dependency before complete native parity.

## Xcode release metadata and rotation · 25 November 2026

- Added the app's supported iPhone and iPad orientations to its Info.plist.
  iPhone supports upright portrait and both landscape orientations. iPad
  also supports upside-down portrait. The arm64 iOS Release build passed
  without the prior orientation warning. This build used signing disabled
  because the Mac has no physical-device signing identity.
- Signed Simulator Debug rebuilt and passed `codesign --verify --deep
  --strict`. The iPad mini displayed the public Feed in landscape and the
  NBA and NFL Research entries after rotating to portrait. This is a launch
  and rotation smoke check across those screens.
- Left the signed iPhone 18 Pro on The Court's November 24 Odds Board with
  the latest app installed. The Xcode scheme and project remain ready to
  open on the Mac.

## Sportsbook-branded social slips · 25 November 2026

- The live website card and generated share PNG use one sportsbook palette
  catalog. Feed, profile and post-detail cards use the saved book on the pick,
  falling back to the legacy post's book. Original leg prices, outcome labels
  and visibility rules remain in force. The website and native cards adjust
  tint for light and dark mode. Public share PNGs use their existing dark base.
- Hub TypeScript and the native plus production suite passed 287 checks. A
  real `ImageResponse` render produced red for Fanatics and blue for FanDuel.
  The local iOS build also showed Geeejpg's live Fanatics slip with its
  two legs in light mode and Guan's FanDuel slip with three legs in dark mode.
  The narrow Hub release is tracked separately from the native profile work.
- Task `e11158c656e2552291c30391427b2347092e3d4d` is pushed. PR #84 preview
  `dpl_63gE3AEGCifkTAVJiFXnXYd1qNfU` was READY and returned the real public
  post plus both share PNGs with 200. The PR merged as
  `fe7244efaee87484f3fee7eb6f01bf8675b5a5ab`. Production
  `dpl_CZoEbeGJ11WuZ2Sa7wv7vDdnv6Q1` reported READY. The live post declared
  the Fanatics palette. Both live share PNGs returned 200 and their header
  pixels verified red for Fanatics and blue for FanDuel. The site home and
  native Feed also returned 200.

## Native Feed reactions, avatars and profiles · 25 November 2026

- The heart shows the heart count, reacts immediately with native feedback and
  a brief burst, and reverses on a failed save. Rapid taps reconcile the latest
  intent in order. The quick reaction popover and the full emoji picker use
  the same post reaction API. Bookmarks, profiles and other signed-in post
  surfaces use the same reaction state. Guest counts remain readable.
- The compact tab bar shows the signed-in member's actual avatar and saved
  decoration. Profile edits refresh that identity. Feed and profile avatars
  play the existing decoration art through native sprite playback, with
  stills for Reduce Motion. The source animations are rendered at build-asset
  generation time. `ios/scripts/build-avatar-motion.mjs --check` verifies
  the generated bundle against all of the source designs.
- The profile now leads with a width-constrained cover and portrait, native
  actions, inline follower and pick metrics, branded social links, and the
  activity tabs. Details keeps original links, favorite sports, sportsbooks
  and achievements accessible. Creator memberships remain reachable from the
  compact disclosure and storefront. Feed author taps still push a native
  profile, and external profile links open a full-screen native view.
- Signed iPhone 18 Pro and compact iPhone 17e Simulator builds passed. The
  live signed account's own post moved from 12 hearts to 13 and back to 12.
  A fire reaction appeared and was removed, preserving the original state.
  An isolated Swift fixture exercised rapid reversal and failure rollback.
  On the guest profile, the avatar region differed between two captures while
  the banner stayed pixel-for-pixel stable. The same comparison proved motion
  in the signed Account tab with a neighboring tab as the stable control.
  The quick picker's plus button opened the full emoji browser. A profile
  link from an open post sheet opened the full-height iPhone profile.
- Task `c91196a31fae89b9789a167e71894ec6cae2a50a` is pushed. Hub TypeScript,
  287 checks, the shared-palette and artwork comparisons, signed Simulator
  Debug and unsigned arm64 Release passed. iPad keeps system tabs. Visual
  references were [X's iOS post actions](https://mobbin.com/screens/aec94d01-7930-4083-b198-ad33e0a2987e)
  and [Beli's iOS profile hierarchy](https://mobbin.com/screens/aaa8cc34-89a1-419e-948b-80aa6218cf3b).

## Five-tab navigation and physical iPhone review · 25 November 2026

- Feed, Research, Community, Inbox and You are the five native tabs. Feed
  places Search next to the existing Compose action for members. The compact
  header and action placement draw on [X’s iOS Feed](https://mobbin.com/screens/a2cfcd93-6142-40b1-a749-7c1b79127936).
  The existing Feed filters and sportsbook cards stay in the timeline.
- Community starts with Joined groups and invitations. Browse opens the
  directory, scores, creators, leaderboard and available community tools.
  Successful membership changes and invitation replies refresh the directory.
- Inbox has independent Activity and Messages unread counts, with their total
  on the tab. The app counts the notifications returned by the existing
  50-row endpoint and the unread direct and group messages returned by the
  existing conversation inbox. One request can fail while the other updates.
  The app refreshes in the foreground and reuses the results of in-view loads.
  The You tab shows the member photo with its saved animation.
- Xcode 27.2 Debug built and launched on the active iPhone 18 Pro Max
  (`A1643902-9394-4831-9FEC-0A391E605804`). Verified the five-tab shell and
  guest Research, Joined, Activity and You. The Pro Max had no signed-in
  session. Guest Messages deep-link verification stopped at iOS’s open-app
  confirmation. On the signed iPhone 18 Pro, verified a joined group, Activity
  with a live unread badge, the Messages list and native You. Two captures
  showed movement in the You avatar and a stable neighboring Inbox icon.
- The unread fixture verified independent counts, partial failure, total and
  account scoping. The native and production suites passed 286 checks. The
  pinned Node runtime passed the avatar asset check. This checkpoint contains
  iOS code and this handoff. The live home returned 200 on the existing site.
- The owner paused simulator design review in favor of a real iPhone. The next
  review uses the native X, Discord and TheRealApp apps on that phone. No
  installation or signing on the physical phone was attempted at this
  checkpoint. Use the iOS task branch for this review.

## First physical iPhone run · 25 November 2026

- The five-tab source at `bcf6e0de` signed, installed and launched from
  Xcode 27.2 on a USB-connected iPhone 16 Plus running iOS 26.6.2.
  Xcode showed the live device run and CoreDevice confirmed the
  SlipSurge process. Developer Mode, the developer certificate trust on the
  phone and the first Keychain signing approval were required.
- This is a Personal Team Debug build using `com.slipsurge.ios.development`.
  The team setting lives in the ignored Mac `ios/LocalAuth.xcconfig`.
  The installed development profile expires on 2 December 2026. Renew through
  Xcode if needed. Distribution signing, APNs and universal-link verification
  are separate from this run.
- Device Hub manages this phone and reports that its live screen sharing
  requires iOS 27. CoreDevice successfully captured stills over USB at
  1290 × 2796. SlipSurge, X, Discord and Real are all installed. Use USB
  stills while the owner navigates the comparison screens.
- Captured X’s signed-in For You timeline, a post detail with its selected
  heart and reply composer, and a public profile on the physical phone.
  The timeline uses one horizontal scope row with sports lists, slim
  separators, and a compact action row. The profile keeps the cover,
  overlapping portrait, primary actions and follower information together
  above its activity strip. For SlipSurge, judge Feed density with a real
  sportsbook card in view and keep the member’s animated portrait in You.
  The remaining checks are X Chat, Discord, Real and signed-in SlipSurge
  Feed, reactions, profile and Inbox on the same phone.

## Discord community walkthrough · 25 November 2026

- On the physical iPhone 16 Plus, reviewed the Parlay Party server's channel
  list, a live text room and the member profile opened from an avatar in that
  room. The server list keeps the active community identifiable while selecting
  a channel. The room has a persistent name, reply context, an unread divider
  and an anchored composer. The member sheet keeps the room visible behind it
  and surfaces the member’s identity, mutual server and available actions.
- On the same phone, SlipSurge restored its signed-in session and opened
  Community on Joined. ParlayParty displayed the same community artwork and
  opened to its posts, with Channels below the community header. The group’s
  native channel link opened a searchable list with one visible room and a
  favorite indicator. Chat currently uses static author avatars in channel
  messages. The full SwiftUI member profile already contains the member’s
  animated decoration and public statistics.
- The next design pass should test a Rooms entry at the top of joined
  communities, a quick way to switch rooms, and a dismissible member preview
  from chat with access to the full profile. Use the group's real artwork and
  the member’s SlipSurge identity and decoration. Use the existing access rules
  for channels, profiles and direct messages. If adding room unread markers,
  derive them from real read state. Posts and Picks remain part of the group.

## Native community rooms and chat profiles · 25 November 2026

- Joined communities now start on Rooms. A persistent native control places
  Posts, Picks and Rooms at the top of the group. The Rooms section shows the
  group image, favorite rooms and the existing permission-filtered catalog.
  Preferences, Discord access and leaving the community are in its options.
- Signed-in group and Live Rooms links open in the Community navigation stack.
  Room chips switch conversations with one tap when the catalog contains more
  than one room. Draft text, attachments, reply context and retry identifiers
  stay with their original room. Individual rooms reserve the screen for the
  conversation and composer. The main tabs return outside the room.
- Chat avatars open a native member sheet over the thread. It uses the existing
  profile endpoint to show the member’s SlipSurge avatar decoration, public
  identity and visible pick record, with actions for the full profile and
  eligible direct messages. It uses the existing profile and room checks.
- The signed-in 18 Pro simulator opened Picks Room and switched to MLB
  General and back. The draft was visible in its original room only. Tapping a
  sender opened the preview with profile and message actions. The avatar
  region changed between simulator screenshots while the adjacent background
  stayed stable. The native and production suites passed 286 checks.
- The final Xcode Debug build installed and launched on the physical iPhone
  16 Plus. A signed-in ParlayParty link showed Posts, Picks and Rooms together.
  Picks Room showed adjacent room chips and a visible Message composer. The
  main tabs returned when opening the group again. The phone was left in
  Picks Room, which has an existing message available for trying the preview.

## Chat composer and avatar motion · 25 November 2026

- Chat now has a full-width multiline input with a separate send button and a
  row for Photo, GIF and Emoji. The GIF button uses a visible wordmark.
  GIPHY opens at the large detent with a loading state, search and attribution.
  GIF and photo attachments have an in-draft preview and removal control.
  Room and message permissions, existing draft behavior and the existing
  upload and message APIs are preserved.
- Rebuilt the 50 original decoration assets at a 24 fps sampling target.
  Frames are cropped and downsampled off the main thread and cached by
  asset and resolution. A shared display driver changes the visible
  decoration layers without making SwiftUI rebuild the avatar every frame.
  Simple rings use transform animations. Reduce Motion uses still art, and
  playback pauses when the scene goes inactive or the avatar disappears.
  Channel avatars now use the ring and color already returned by the server.
- The final Xcode build ran on the physical iPhone 16 Plus with the new
  composer visible in Picks Room. Two physical captures confirmed movement
  in a chat avatar and the You tab, with stable adjacent control regions.
  The signed simulator loaded the GIPHY catalog, attached a selected GIF,
  opened the system photo picker and inserted a custom emoji into the draft.
  Photo upload and sending were outside this verification. The asset integrity
  check and 286 native and production checks passed. The phone was left in
  Picks Room.

## Native keyboard dismissal · 25 November 2026

- Added a native Done button above the keyboard in chat, replies, composers,
  inline search and filters, account and creator forms, and research editors.
  Done clears input focus and keeps the current draft or value. It does not
  submit the form. Chat also dismisses the keyboard when dragged down, even
  in short conversations. Horizontal room and attachment controls retain
  their own scrolling behavior. Cancel in chat search clears only the search.
- Verified in the signed-in iPhone 18 Pro simulator that Done and a downward
  swipe both hide the room keyboard and preserve a draft. Cancel in chat
  search kept the message draft. Done also preserved the caption and the
  numeric stake in the Pick composer. No test content was sent.
- Xcode Debug builds passed for Simulator and the physical iPhone 16 Plus.
  The signed build installed and launched on the phone, which was left in
  Picks Room. Physical keyboard gestures were not exercised. The native
  and production smoke suites passed 286 checks.

## Compact chat composer · 25 November 2026

- Put the chat input, add menu and send button on a single row. The plus menu
  opens the native photo library, GIPHY gallery or SlipSurge emoji picker.
  The composer reuses the existing photo upload, GIF preview and room APIs.
  GIF opens at the large detent.
- Moved keyboard dismissal into the input as a keyboard-down button.
  Downward scrolling keeps its native keyboard behavior, including in short
  rooms. Chat sheets give scrolling priority and guard against swiping away
  a conversation while editing or with an unsent draft. Chat search retains
  its own Cancel action.
- Xcode Debug built cleanly for the iPhone 18 Pro simulator. In Picks Room,
  the keyboard button and a downward swipe preserved an unsent draft. The
  swipe also stayed in the room when it was opened as a sheet. Opening and
  cancelling Photos kept the draft, a GIPHY result attached to the composer,
  and a custom emoji inserted. No messages were sent and photo upload was
  not exercised. The native and production suites passed 286 checks.
- Left the iPhone 18 Pro simulator in Picks Room for design review. The
  paired iPhone 16 Plus was updating during this pass. Physical screen
  sharing and verification of this build remain pending.

## Social navigation and screen hierarchy · 25 November 2026

- Live Device Hub viewing worked on the paired iPhone 16 Plus after its
  update to iOS 27.2.1. Reviewed Real’s sport and date navigation, X’s
  timeline and compose placement, then Discord’s channel context and room
  composer on the phone. Supplemented this with [X’s iOS timeline](https://mobbin.com/screens/491afc8c-f081-45fe-ae26-c970bb2d3882)
  and [Discord’s iOS channel list](https://mobbin.com/screens/64d1c1ea-6abb-4d93-8da1-6765cb45e3cf).
- Feed has a fixed Latest, Following, Picks and Top row and direct league
  filters with SlipSurge’s existing logos. Post rows use slim separators and
  preserve sportsbook media. Compose sits above the dock. The resume offer
  is inside Feed on the social tabs. Posts open in the navigation stack
  with the compact reply composer. Returning keeps the feed selection and
  tapping the active Feed tab again scrolls to the top.
- Community opens on Joined with compact group rows and direct entry to
  Live Rooms and Live Scores. The room title opens a menu of available
  rooms and the visible chips still switch with one tap. Inbox keeps
  Activity and Messages badges, sorts direct and group threads together by
  recency and gives message requests a dedicated screen. The signed-in You
  tab opens the existing animated profile, with a gear and the existing
  settings deep link opening Account.
- Signed Xcode Debug builds passed for the iPhone 18 Pro simulator and
  physical iPhone 16 Plus. Installed the final signed build on the phone
  and verified Feed, Activity, Messages, You, Joined, and Picks Room with
  its composer. Left the phone on Feed. On the simulator, verified Compose
  open and cancel, NBA Picks, post navigation and return, Feed reselect,
  the empty Requests screen, room switching and the signed-in settings
  link. The native and production suites passed 286 checks. Live sending
  and request moderation were outside those checks.

## iOS artwork, Feed and loading responsiveness · 25 November 2026

- Reuse the native API connection while retaining explicit request
  authorization and redirect handling. Artwork and post photos are decoded
  off the main thread at sizes suited to their views. Decoded thumbnails and
  larger artwork have separate memory budgets so photos do not evict every
  avatar and logo. Visible avatar decorations still animate.
- Feed keeps visible rows during refresh and can show a recently visited
  section from the current account’s in-memory first page. Freshness checks
  and explicit refreshes use the live endpoint. Session and access failures
  clear those previews. Scrolling records the resume measurement without
  changing view state on each visibility update. Feed and social page loads
  avoid whole-list animations.
- Inbox can render recent Activity and Messages responses from its unread
  poll while fetching current data. An unchanged chat poll leaves the
  displayed messages in place. Profiles retain their current page on Back.
- In six sampled switches between Latest and Picks on the iPhone 18 Pro
  simulator, the baseline showed the loader six times and the revised build
  showed feed content six times. In one matching 16-second Time Profiler
  scroll per build, sampled ImageIO work was 599 ms before and 464 ms after.
  Phone startup reached the first sampled signed-in Feed in 4.09 seconds
  before and 4.26 seconds on the final build. Cold startup remains a separate
  performance target. Trace and capture files are local to the Mac.
- Xcode Debug builds passed for Simulator and the iPhone 16 Plus, and the
  final signed build was installed and launched on the phone. Verified a
  real post photo, Inbox and Picks Room on the phone. On the simulator,
  pull-to-refresh kept existing posts visible and a saved Feed resume
  reopened the same sportsbook post aligned to the top. Native and
  production checks passed 286/286. The iPhone 16 Plus was left on Feed
  for review.

## iOS live games and game conversation · 25 November 2026

- Branch `codex/ios-parity-20261125`, continuing from `e645c853`. The
  checkpoint containing this entry is the source to fetch on Windows or in
  Cloud. The changes are native iOS; the live site and shared APIs were not
  deployed or changed.
- Reviewed Real’s date and league slate and its play-centered discussions on
  the iPhone 16 Plus. The SlipSurge flow starts from Feed’s Live Games
  shortcut or a current live matchup. The slate has one-tap dates, team and
  league marks, live-first results, and native calendar selection. Scheduled
  games now accept the scoreboard provider’s minute-precision start times.
  Related references are
  [Real–Sports](https://apps.apple.com/us/app/real-sports/id1514546162) and
  [FotMob’s score and commentary layout](https://mobbin.com/screens/b359d965-ef41-44d1-863f-abe6dae1fb4d).
- The game keeps the score and sections visible while scrolling. Live and
  final games open to Plays; scheduled games open to Summary. Plays retain
  scoring and period filters, team art, player art when provided, pitches
  where available, and the existing reaction API. Game responses remain
  visible on section return during refresh. The scoreboard and game views
  poll existing endpoints while active.
- Discuss carries the selected play into the shared Game Room. A published
  room message can link directly back to that play. Room avatars open the
  existing animated member preview. The composer uses the native photo,
  GIPHY and emoji pickers and an inline keyboard-dismiss action. Share opens
  the existing Feed composer with the matchup and link or uses the system
  share sheet. Feed and Game Room turn standalone SlipSurge game links into
  native cards. The timeline remains limited to the plays the existing API
  provides.
- Signed Debug built for the iPhone 18 Pro simulator and physical iPhone 16
  Plus. The simulator showed Feed’s live rail, a date change, scheduled tip
  times, real Heat–76ers play-by-play and box stats, the play-linked room
  draft, GIPHY attachment, keyboard dismissal with the draft intact, and a
  prefilled Feed post that was canceled. The simulator also opened the
  selected play from a cold URL. The final build launched on the iPhone 16
  Plus, then opened the same play with both team marks. A one-command
  CoreDevice cold launch with a URL exited with signal 9; the normal
  launch followed by opening that URL worked. App Store universal links
  and physical cold-link delivery remain unverified. No production chat,
  reaction, photo upload or Feed post was sent during QA.
- Native and production suites passed 286/286, and `git diff --check`
  passed. The iPhone 16 Plus was left on the selected play for review.

## iOS live play presentation and reactions · 25 November 2026

- Continued from 7a2082d0 on codex/ios-parity-20261125. Reviewed Real’s
  Heat–76ers game live in Device Hub, including changing reaction counts,
  player and team marks, clock and score per play, and the free-throw
  sequence. Device Hub occasionally reported screen sharing unavailable
  while switching focus to the iPhone 16 Plus on 27.2.1 and reconnected.
- The native timeline now separates what happened, who did it, supporting
  context, and the play’s score and clock. The portrait uses the player’s
  primary and secondary team colors and club logo. The existing box-score
  roster fills in portraits when the play payload omits athletes. A captured
  NBA response with zero play athletes resolved portraits on 180 of 194
  plays, including the named Heat–76ers shooters.
- The visible live game can surface a team timeout with its logo and a
  pending free throw with the shooter when the provider supplies enough
  evidence. Focused checks covered timeout ownership, clock expiry, made
  and missed presentation, and incomplete and completed free-throw
  sequences. The real Philadelphia timeout and Giannis free throw rendered
  on the signed simulator. The physical build also displayed the real
  Philadelphia timeout.
- Play rows have a one-tap fire reaction, reaction counts and animated
  feedback for a local tap or a received increase. Reduce Motion disables
  the bursts. A local simulator fixture using the same SwiftUI component
  confirmed a tap and an incoming increase produced separate bursts. Recent
  play and reaction updates poll every eight seconds with Plays visible and
  active. The upstream score source controls data freshness. The existing
  reaction endpoint, Game Room and feed sharing remain in use.
- Xcode Debug builds passed for the iPhone 18 Pro simulator and the iPhone
  16 Plus. All 286 native and production checks and git diff --check passed.
  The website and backend were unchanged. No production reaction or test
  post was sent.
- The final signed build is installed on the iPhone 16 Plus. The phone
  displayed the timeline during the earlier device check, but a subsequent
  CoreDevice relaunch exited with signal 9. Retesting the earlier signed
  build reproduced the exit. The latest build is installed again, and the
  simulator is open on the Giannis free throw. Repeat a normal on-device
  launch before claiming the final physical run.

## iOS live scores and game context · 26 November 2026

- Continued from 4aa104ee on codex/ios-parity-20261125. The signed app
  ran on Miranda’s iPhone 16 Plus through Xcode Product > Run. With the
  process running, CoreDevice opened the native Heat–76ers link. The final
  device build showed the third-quarter play feed and a compact Miami
  timeout marker. Real stayed on the same matchup when switching apps.
- The main Feed now shows today’s full slate with live matchups first, then
  upcoming and completed games. The native slate reads the same public
  ESPN score source directly for NBA, NHL, and MLS while games are active
  or close to start, updating each league independently and retaining
  SlipSurge match IDs and artwork. The existing SlipSurge feed still
  supplies the slate and other sports. Reads stop outside the active
  foreground views. The scoreboard provider advertised a seven- to
  eight-second cache during this comparison.
- Game Center reads the public NBA/NHL/MLS play summary while live and
  merges new chronological plays with SlipSurge’s confirmed reactions
  and play details. A reaction to a newly arrived play animates at the
  tap and waits briefly if the existing authenticated route has yet to
  recognize that play. The next event remains limited by the source’s
  publication speed. The optional faster ESPN caching for the mobile
  routes is on this branch. Default web reads keep their original cache
  policy, and production Vercel was left on main.
- Timeouts, substitutions and period changes use a compact cue or timeline
  marker. Same-clock changes for one team group, while links to individual
  substitutions remain addressable. Shots, fouls and free throws retain
  their detailed rows. The actual third-quarter restart in Real showed
  Miami’s grouped lineup change. SlipSurge’s simulator showed the
  in-progress Tyrese Maxey free throws, including “Attempt 2 of 2”; the
  phone showed the Miami timeout as a small marker instead of a play card.
- Both apps showed 53–62 at halftime. A five-second sampling run observed
  the public scoreboard’s third-quarter restart about six seconds before
  the existing production scores response. A later snapshot showed the
  public summary at 56–66 while the production game endpoint was still
  54–63. Device proof is local to this Mac. No production test reaction
  was sent; the two apps use their own community reactions.
- Xcode Debug passed on the simulator and Miranda’s iPhone. The focused
  data checks covered a newer provider packet, a stale packet, grouped
  substitutions, exact play targets, period breaks, and pending free
  throws. The native and production suites passed 287/287.
- Final Feed observation from the iPhone 18 Pro simulator on code
  checkpoint 6dc6117d showed MIA/PHI change from 56–70 to 58–70 to 58–72
  without leaving Feed or manually refreshing. The clock advanced in the
  same tile. The physical iPhone remained on the same game’s play feed.

## Native live game reactions and shared emoji · 26 November 2026

- This checkpoint is on `codex/ios-parity-20261125`, following
  `33976231`. The same SlipSurge catalog powers the play reaction picker and
  inline social emoji. The production catalog returned 71 uploads, including
  six animated GIFs. Play chips and incoming bursts render emoji artwork.
  Known shortcodes expand when posts and chat messages are displayed.
  Animated artwork uses bounded decoding and respects Reduce Motion.
- Game Center subscribes to production reaction changes for the visible game,
  refreshes the affected reaction state, and falls back to polling when the
  socket is unavailable. A linked play stays in view as newer plays arrive.
  Xcode caught the previous phone build at a memory limit while ImageIO was
  decoding a lazy WebP avatar crop. The current build rasterizes the source
  before taking avatar crops. Both devices stayed open through the tests.
- Production Supabase migration
  `20261125234813_native_play_reaction_catalog` is already applied. It
  preserves legacy reaction values, validates custom codes against the
  catalog, and keeps one reaction per account and play. The existing RLS
  policies and Realtime publication remain in place. The web reaction
  renderers also accept these images on this task branch. Production Vercel
  received no deployment from this checkpoint.
- On Miranda’s iPhone 16 Plus and the iPhone 18 Pro simulator, both signed
  in as `@parlayparty`, open Heat–76ers game `401909317` and Giannis’s
  second free throw at Q3 7:11, play `401909317419`. A simulator fire tap
  produced a floating flame and one selected reaction on the phone without
  reopening or refreshing. The phone captured that frame by 1.8 seconds
  after the tap. Changing the reaction to the uploaded `fireaf` GIF
  produced one selected custom chip on the phone, with different animation
  frames observed. The test reaction was removed and the play’s original
  zero rows were confirmed in Supabase. Distinct-account aggregation and
  ownership still need a second signed-in account for a device check.
- Simulator Debug and physical Xcode Run both opened the exact play. The
  native and production suites passed 288/288, and the web TypeScript check
  passed. Local device captures stay off Git.

## NBA play context, running stats and live scrolling · 26 November 2026

- Continued `codex/ios-parity-20261125` from `b183508b`. The NBA timeline
  nests a foul under its latest free throw and a rebound under its preceding
  miss. Unmatched events stay visible as compact markers. Attached foul and
  rebound IDs still open their exact context and keep their share, discussion
  and reaction actions. Player labels use a first initial and last name with
  the full name available to VoiceOver. Made and missed plays use separate
  high-contrast colors in both appearances.
- The native NBA read uses the complete provider play history when available.
  Running stats include the current event and are calculated in chronological
  order. Three-point attempts show makes, attempts and percentage with game
  points. Blocks, rebounds, assists, steals, fouls and turnovers show the
  credited player's running totals where relevant. A partial history keeps
  event context and omits unverified totals. No production database or
  desktop deployment was required.
- Plays follows new events by default, even after scrolling to older action.
  Pause, a historical quarter filter and an exact play link let the user
  review without the live scroll. Go live returns to the newest action.
  On the iPhone 18 Pro simulator, the viewport was on older fourth-quarter
  plays when a new Heat–76ers lineup change arrived at 5:36. The viewport
  returned to the top without a tap or refresh.
- On Miranda’s iPhone 16 Plus the original shooting-foul link opened
  G. Antetokounmpo’s second free throw and highlighted the nested T. Maxey
  foul. The nearby Dean Wade miss showed Giannis’s defensive rebound.
  Verified that V. Edgecombe’s made three displayed 2/4, 50% and 12 points
  as of that shot, and that the Wade block appeared with 1 BLK under the
  blocked layup. Checked 375 events and 19 player point totals against the
  same provider packet, including partial history and a free-throw sequence
  arriving one attempt at a time. Both Xcode Debug builds and all 288 native
  and production checks passed.

## Windows brand refresh in native iOS · 26 November 2026

- Continued `codex/ios-parity-20261125` from `60f46adf`. The logo kit came
  from Windows commit `4bce5172`, merged into main as `af4344b7` in PR #85.
  The native Xcode target uses the supplied default, dark, and tinted icon
  files. Feed and sign-in use the original horizontal SVGs with the ink
  artwork in light mode and lime and white artwork in dark mode. The
  source files match the brand kit byte for byte.
- Xcode Debug passed for simulator and iPhone. The compiled asset catalog
  contains all three 1024-pixel icon renditions and both wordmarks as vector
  assets. The Feed header rendered in both appearances on iPhone 18 Pro
  Simulator, and the sign-in header in both on iPhone 17e Simulator. The
  new build was installed on Miranda’s iPhone 16 Plus and opened on Feed.
  All 288 native and production checks passed. This checkpoint carries only
  native branding. Store artwork uploads remain with the owner.
