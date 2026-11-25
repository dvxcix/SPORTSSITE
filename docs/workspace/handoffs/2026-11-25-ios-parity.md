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
