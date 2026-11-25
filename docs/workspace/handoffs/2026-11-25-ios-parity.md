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
