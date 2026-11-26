# SlipSurge 2027 brand verification

The supplied, finished VOLT brand kit is integrated on `codex/brand-2027-logo`, based on `fe7244efaee87484f3fee7eb6f01bf8675b5a5ab`. This is a pull request for owner review and merge; it has not been deployed to production.

## Artwork and changed surfaces

The kit is retained under [`brand/`](../../../../brand/README.md): SVG masters, platform uploads, guidelines and original generators. Presentation files, redundant raster masters and environment files are excluded. Artwork is not redrawn, recoloured or given effects. The new shared `SlipSurgeLogo` component selects the supplied ink artwork on light surfaces and lime/white artwork on dark surfaces.

| Surface | Changed files |
| --- | --- |
| Public header, footer and research preview | `PublicSiteHeader.tsx` and its CSS, `LandingPage.tsx` and its CSS, `PublicWorkspaceFrame.tsx`, `ResearchShowcase.tsx` and its CSS |
| Sign-in and registration branding | `AuthExperience.tsx` |
| Member and admin navigation | `Sidebar.tsx`, `AdminSidebar.tsx` |
| Desktop navigation and welcome tour | `DesktopNavigation.tsx`, `DesktopExperience.tsx` |
| Community channel rail | `app/channels/[slug]/page.tsx` |
| Error screen | `app/global-error.tsx` |
| NBA/NFL/MLB score marks | `PaintResearchCells.tsx`, `SidelineBoardClient.tsx`, `MechanicsScoreRing.tsx` and its CSS, `SlipSurgeScoreLabel.tsx` and its CSS, `DugoutClient.tsx`, `SlateEdgeOverlay.tsx`, `app/dugout/page.tsx` |
| Browser and install artwork | `public/` favicon set, Apple touch icon, PWA/maskable icons, both manifests, `app/layout.tsx`, `ThemeProvider.tsx`, `app/brand-bolt.png` |
| Social link previews | `siteMetadata.ts`, `layout.tsx`, `public/og-image-1200x630.png` and compatibility `public/og.png` |
| Emails | `lib/email.ts` |
| Generated pick and watchlist images | Both `api/share-image` route renderers |
| MLB contact recap and NFL touchdown replay exports | `contactRecapGif.ts`, `nflTouchdownReplayGif.ts`, tracing entries in `next.config.ts` |
| Local design-review copies | `public/review-assets/` logo, bolt and install icon |
| Expo mobile source icons | `mobile/app.json` and `mobile/assets/` including three iOS appearances and Android adaptive layers |
| Tauri desktop source icons | `desktop/src-tauri/icons/`, generated Windows/macOS bundles and retained supplied Xcode icon catalog |

Existing `/logo.png`, `/brand-bolt.png` and `/og.png` URLs remain valid. The square compatibility assets retain their original 1030 by 1030 dimensions. The existing generated install manifest retains app identity, launch path, scope and sport-aware shortcuts; a maskable icon is added. Favicon URLs carry `?v=2027`.

Tool names, team/player/sportsbook imagery, research data, score formulas and access controls are unchanged. Loading screens were audited and contain no old logo to replace.

## Local verification

Verified on November 26, 2026 with the repository's locked Next.js 16.4.6 dependencies. Package manifests and lockfile are unchanged.

| Check | Result |
| --- | --- |
| Optimized local private-review build | Passed compilation, TypeScript and generation of 266 static pages; exit 0 |
| Brand, production smoke, NBA score, watchlist image rendering, NFL replay rendering and UI framework tests | 157 passed, 0 failed |
| Built-site asset/head/manifest checks | All 15 asset URLs returned 200; head uses the new absolute OG/Twitter image, large Twitter card and versioned favicons |
| Browser review | ChatGPT in-app browser: desktop 1280 by 720 and mobile 390 by 844, light and dark; header variants loaded correctly and no document horizontal overflow |
| Additional browser surfaces | Mobile sign-in in both themes and desktop admin navigation checked before the optimized build |
| Mobile configuration | Expo configuration resolves supplied iOS light/dark/tinted icons and Android foreground/background/monochrome layers |
| Diff whitespace | `git diff --check` passed |

Commands, from `hub/`:

```powershell
node scripts/start-ui-review.mjs build
$env:SLIPSURGE_UI_REVIEW_PORT='4268'
node scripts/start-ui-review.mjs start
node scripts/verify-brand-http.mjs http://127.0.0.1:4268
node --import tsx --test scripts/brand-assets.test.mjs scripts/production-smoke.test.mjs scripts/nba-score-visuals.test.mts scripts/watchlist-share-render.test.mts scripts/nfl-touchdown-replay.test.mts scripts/ui-framework.test.mjs
npm run lint
```

The local review runs actual app components with illustrative data and no live services. Its visible review banner is included in the evidence images. This does not certify live accounts, remote providers or native device installation.

### Existing failures, reported separately

Full repository lint currently reports 2,122 errors and 1,119 warnings. Comparing the 32 changed JavaScript/TypeScript files with the base commit using the same installed dependencies found **zero added diagnostics**. Existing diagnostics in the two share-image routes and `DugoutClient.tsx` are unchanged; see [`lint-comparison.json`](lint-comparison.json).

The additional `dugout-responsive-contract.test.mts` related suite produced 35 passes and 3 existing source-contract failures across the related suites. The failing assertions expect `dg-player-signal-row`, an old coarse-pointer utility-dock media query, and `activeElement?.focus` in the modal implementation. All three expected source strings are already absent on the base commit. They were not altered or hidden for this brand refresh.

Native app builds, installation and the three Xcode appearances were not verified on this Windows machine. Native source configuration and artwork were verified; publication requires the native release workflow.

## Screenshots

| View | Before | After |
| --- | --- | --- |
| Desktop light | [Before](before-desktop-light.jpg) | [Built site](after-built-desktop-light.jpg) |
| Desktop dark | [Before](before-desktop-dark.jpg) | [Built site](after-built-desktop-dark.jpg) |
| Mobile light | — | [Built site](after-built-mobile-light.jpg) |
| Mobile dark | — | [Built site](after-built-mobile-dark.jpg) |
| Mobile login | — | [Light](after-login-mobile-light.jpg), [dark](after-login-mobile-dark.jpg) |
| Admin navigation | — | [Dark](after-admin-desktop-dark.jpg) |

## Release boundaries

No database, authentication, payment, production environment, signing or account identifier changes were made. No production job was replayed and no email was sent. Unrelated work in the original checkout remains intact.

The owner uploads X, Discord, Instagram, YouTube, Whop and store-listing images manually, as directed by the handoff. Ready-to-upload files are in `brand/upload/`. Existing third-party account artwork and historical user content do not change through this website PR. Exporting Apple's liquid-glass `.icon` file requires Icon Composer on a Mac.

**No trademark search has been performed for this logo.**
