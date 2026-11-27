# SlipSurge iOS release checkpoint

## Compare odds on Devin’s iPad

- TestFlight 1.0 (13) was archived from `e37cdd480b30e7cb9df110b8573ea41de9eb95c6`, assigned to SlipSurge Internal QA and installed on the physical iPad. CoreDevice verified the release bundle and version.
- With the existing signed-in production account, NBA passed at 756 × 1,158 pt and NFL passed at about 375 × 724 pt. Compare odds showed the same player and line, History opened, and incoming Inbox navigation dismissed the sheet. The test restored the large window.
- A fresh follow from the controlled second account restored the original follow relationship, created a production Activity event and reached APNs in 2.38 seconds. Apple returned 200. The named follow appeared in the iPad’s Notification Center. The system notification-to-Inbox test still needs a reliable pass.
- The Free QA account opened the existing private two-member community. The signed-out public response omitted its content. The browser retained a draft and reported a failed room send. No matching row reached production and the iPad room remained empty. End-to-end chat, private picks and paid community roles are still open.

## Native Ultimate billing

- TestFlight 1.0 (14) was signed for SlipSurge LLC and exported with production APNs. Apple accepted the internal upload, and Internal QA showed Testing. CoreDevice verified build 14 installed on the physical iPad. The archive contains the existing missing GIPHY dSYM warning.
- App Store Connect has an unsubmitted one-month Ultimate product, `com.slipsurge.ios.ultimate.monthly`, at US $19.99. Initial availability is United States. The app presents StoreKit’s localized price and native purchase and restore, and waits for server-confirmed Ultimate before reporting success. App Review metadata and a corresponding review build are still required for first submission.
- [Backend PR #106](https://github.com/dvxcix/SPORTSSITE/pull/106) merged to main as `22bdb49a6a79ac84e7cef7d3103b172cef66e9cc`. Its signed receipt verification binds the purchase to the SlipSurge account before granting access. Supabase applied only the reviewed service-only ledger migration as `20261127230202_native_storekit_subscriptions` and verified client roles cannot read it. Vercel has an approved production-scoped Apple sandbox allowlist with exactly one Free QA account. Public Apple purchases remain disabled.
- TypeScript and the production source suite passed. Isolated Postgres checks covered repeat restore, mismatched account, ineffective stale revocations and restores, renewal ordering, environment separation and grants. Targeted receipt checks rejected forged and invalid purchases. The wider selection passed 177 of 189, with the same 12 fixture failures reproduced on refreshed main.
- The pending device check needs the controlled Free QA account signed into the installed app. Record Apple sandbox purchase, actual NBA and NFL board access, a repeat restore, and an attempt from a different SlipSurge account. Record a verified App Store sandbox renewal event after the callback routes live. Do not submit the App Store version until release checks pass.

All iOS source belongs on `codex/ios-parity-20261125`. Preserve local Mac Xcode edits and the Windows checkout. Keep transaction payloads, account IDs, device evidence and server logs out of Git.
