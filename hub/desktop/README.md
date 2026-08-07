# SlipSurge Desktop

The Windows/macOS client is a Tauri 2 shell around the deployed SlipSurge
Next.js application. It intentionally does not bundle server routes, cron jobs,
scrapers, service-role credentials, Whop secrets, or Stripe secrets.

## Architecture boundary

- The deployed Next application remains the source of truth for pages, auth,
  tier gates, API routes, billing, cache behavior, and daily data pipelines.
- `@slipsurge/core` remains the shared domain package for portable business
  logic and schemas.
- This package owns desktop windows, protocol links, native notifications,
  system integration, signing, and installers.
- The `SlipSurgeDesktop/0.1` user agent and `platform=desktop` launch parameter
  allow the web UI to opt into desktop-specific presentation incrementally.

## Prerequisites

1. Node/npm dependencies installed from `hub/`.
2. Rust stable and Cargo.
3. Microsoft C++ Build Tools and WebView2 on Windows.

## Commands

From `hub/`:

```powershell
npm run desktop:doctor
npm run desktop:dev
npm run desktop:build
```

Production uses `https://www.slipsurge.com`. For an alternate compile-time
origin, set `SLIPSURGE_DESKTOP_ORIGIN` before building. Never put a private API
key or service-role key in that variable or anywhere in this package.

## First native milestones

1. Desktop layout mode and compact navigation.
2. Deep-link routing for `slipsurge://` links and authentication callbacks.
3. Native notification registration and notification-to-route behavior.
4. Secure session persistence review.
5. Windows icon assets, signing identity, MSIX/NSIS packaging, and updater.
6. macOS signing/notarization after the Windows client is stable.
