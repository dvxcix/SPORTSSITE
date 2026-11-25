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
