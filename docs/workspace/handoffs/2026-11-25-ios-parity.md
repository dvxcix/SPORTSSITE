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
