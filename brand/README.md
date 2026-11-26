# SlipSurge 2027 brand handoff

Finished artwork supplied by the owner from `VOLT/brand/kit`. The SVG masters and platform exports are copied without redrawing, recolouring or adding effects. See [GUIDELINES.md](GUIDELINES.md) and [UPLOAD-README.md](UPLOAD-README.md).

`svg/`, `upload/` and the original generators are retained here. Preview presentations, slides, the redundant `png/` folder and all environment files are excluded. The generators are reference source; the website consumes the supplied finished artwork.

## Website

`hub/public/brand/2027/` contains the two horizontal logos, the two symbol sizes in both surface colours, and raster horizontal logos for email and image exports. `SlipSurgeLogo` selects the ink variant on light surfaces and lime/white on dark surfaces using the existing theme attribute. It reserves its dimensions before hydration and exposes one accessible name.

The static root contains the supplied favicon set, Apple touch icon, PWA and maskable icons, and 1200 × 630 share image. Existing `/logo.png`, `/brand-bolt.png`, `/og.png` and review-asset URLs remain valid and contain the new artwork. The two square compatibility assets retain their old 1030 × 1030 dimensions.

The three automatic Next.js metadata files in `hub/src/app/` (`favicon.ico`, `icon.png` and `apple-icon.png`) also use the supplied artwork. These routes can take precedence over public-root icons, so the HTTP verification compares the actual response bytes as well as checking availability.

The existing generated `/manifest.webmanifest` remains the canonical install manifest, preserving its app ID, launch path, scope and sport-aware shortcuts. `/site.webmanifest` is a merged compatibility export. Both include the new icon set and maskable entry. Favicon links carry `?v=2027` to refresh hard-cached browser icons.

To resync website and mobile source exports from this checked-in kit:

```powershell
cd hub
node scripts/sync-brand-assets.mjs
node node_modules/@tauri-apps/cli/tauri.js icon ../brand/upload/general/square-logo-lime-1024.png --output desktop/src-tauri/icons
```

The original `build*.js` generators are not needed for this refresh.

## Native assets

The active mobile workspace is `hub/mobile`: its existing Expo configuration references the supplied iOS light/dark/tinted icons and Android adaptive foreground/background/monochrome layers. The active desktop workspace is `hub/desktop`: its Windows/macOS icon bundles and size exports are regenerated from the supplied square artwork. The supplied Xcode app-icon catalog is retained intact with those sources.

Native installation, Xcode appearance checks and store publication require the corresponding native build/release workflow. This PR does not publish a native update or change signing, account identifiers or payment settings. Historical zip handoffs are not active build sources.

## Owner-managed external artwork

Ready-to-upload X, Discord, Instagram, YouTube, Whop, App Store and Play Store exports are under `upload/`. Their account dashboards, existing social posts, member-uploaded avatars and historical screenshots are not rewritten by a website deployment. The handoff explicitly leaves those account uploads to the owner.

No trademark search has been performed for this logo, as recorded in the supplied handoff.
