# SlipSurge native sign-in and research backend

Release branch `codex/ios-native-backend-20261125` from production main
`99d15a53d4a8da23dadb8c1c0e4bfcb93a9d74e8`. The owner authorized release of
the native account and slate backend and a dedicated production OAuth handoff
key to resolve iOS's missing routes. The SwiftUI project remains on
`codex/ios-parity-20261125`.

This release selects the native account, Court, and Sideline read handlers,
the native OAuth handshake, and the opt-in Court MM projection. Shared web
auth handlers enter the native branch only when a matching native request
is present. Existing account verification, MFA, onboarding, tier, and NFL
early access rules remain authoritative. Court MM reuses the site's
captured research and ranking code. Feed composition and other feature work
remain on the iOS branch. No database updates, collectors, jobs or content
transfers are part of this release.

Vercel production baseline `dpl_bSeULX85iyRHc8u9NS21aX9RydUE` was READY.
Before release, public Home, sign-in page, Feed, Pricing, and both public
research previews returned 200. Protected research pages returned 307 to
sign-in. The native account and slate readers returned 404 even when a test
bearer let the request through the shared API router. Native OAuth status
returned 404. Hub TypeScript and 146 native, MM and web source checks passed
on the isolated release sources before publication.
