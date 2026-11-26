# Handoff: ship the 2027 SlipSurge logo

You are picking up a finished logo refresh for SlipSurge (www.slipsurge.com). The design work is done. Your job is to get the files into the website's GitHub repo, wire them in, and open a pull request. Do not redesign, redraw or recolour anything.

## Where the files are

Everything is in one folder on the owner's Windows machine:

`C:\Users\devvi\OneDrive\Desktop\VOLT\brand\kit`

This folder is not a git repo and is not in the website repo yet. Step 1 below copies it in.

| Path in `kit/` | What it is |
|---|---|
| `upload/` | **Finished files, one subfolder per platform. Use these.** |
| `upload/website/` | Favicon set, Apple touch icon, PWA icons, `site.webmanifest`, `head-snippet.html`, header logos (SVG), link-preview image |
| `upload/ios/AppIcon.appiconset/` | Xcode asset-catalog icon set: default, dark, tinted, plus `Contents.json` |
| `upload/ios/app-store-icon-1024.png` | App Store Connect icon (1024 square, no alpha) |
| `upload/ios/icon-composer-layers/` | Flat SVG layers for Apple's Icon Composer (Mac only) |
| `upload/android/` | Play listing icon (512) and adaptive-icon layers (432) |
| `upload/x/`, `discord/`, `instagram/`, `youtube/`, `general/` | Profile pictures, headers, banners, posts at each platform's size |
| `svg/` | Logo masters: `symbol/`, `wordmark/`, `horizontal/`, `stacked/`, `app-icon/`. Plain filled paths, no fonts. |
| `png/` | Raster copies of the masters |
| `GUIDELINES.md` | Usage rules: which file on which background, clear space, minimum sizes, colours |
| `UPLOAD-README.md` | One-line "which file goes where" table |
| `presentation.html`, `slides/`, `overview.png` | Previews only. Do not ship. |
| `geo.js`, `build.js`, `build-social.js`, `render-social.sh`, `make-upload.js`, `board-spec.json` | Generator scripts. You should not need to run them. |

Colours: lime `#b4ff4d`, ink `#0a0a0b`, white. Never put the lime symbol on a white or light background.

## What to do

### 1. Put the brand kit in the website repo
- Find the SlipSurge website repo and its default branch. Ask the owner if it is not obvious.
- Create a branch, for example `brand/2027-logo`.
- Copy `kit/svg`, `kit/upload`, `kit/GUIDELINES.md`, `kit/UPLOAD-README.md` and the generator scripts into the repo under `brand/`. Leave out `presentation.html`, `slides/`, `overview.png` and `png/`.

### 2. Replace the logo on the site
The live site currently serves the old logo at `https://www.slipsurge.com/logo.png`. Find how static files are served (a `public/` or `static/` folder, or similar) and then:

- **Favicon and icons:** copy every file from `upload/website/` except the two `logo-header-*.svg` and `head-snippet.html` into the static root, replacing existing files of the same name.
- **Head tags:** merge the tags from `upload/website/head-snippet.html` into the site's `<head>` (layout or document component). Remove old favicon, touch-icon, manifest and theme-color tags they replace. If a web manifest already exists, merge the icon entries into it and keep its other fields.
- **`/logo.png`:** keep this URL working, because other things link to it. Replace the file with `upload/general/square-logo-lime-1024.png`, resized to the old file's dimensions if anything depends on them.
- **Header and footer logo:** replace with `upload/website/logo-header-on-dark.svg` on dark surfaces and `logo-header-on-light.svg` on light ones. Inline the SVG or reference it as a file, whichever the codebase already does.
- **Link previews:** set `og:image` and `twitter:image` to `og-image-1200x630.png` (absolute URL), with `twitter:card` = `summary_large_image`.
- **Find the rest:** search the repo for `logo`, `favicon`, `apple-touch-icon`, `manifest`, `og:image`, `theme-color`, and any inline SVG of the old bolt. Check email templates, the login page, loading screens, error pages and any generated images. List every place you change in the PR.

### 3. Verify
- Build and run the site locally. Check the header on light and dark themes, the browser tab icon, and a phone-width layout.
- Confirm these return 200 from the built site: `/favicon.ico`, `/favicon.svg`, `/apple-touch-icon.png`, `/site.webmanifest`, `/icon-192.png`, `/icon-512.png`, `/logo.png`, the `og:image` URL.
- Run the repo's lint and tests.

### 4. Ship
- Open a pull request into the default branch with before and after screenshots. Do not push to the default branch or deploy to production yourself; the owner merges and deploys.
- After deploy, favicons cache hard. If the old icon persists, add a version query to the icon URLs in the head tags.

### 5. Mobile apps (only if a native app repo exists)
- **iOS:** replace `AppIcon.appiconset` in `Assets.xcassets` with `upload/ios/AppIcon.appiconset`. The dark and tinted PNGs are transparent on purpose. Check all three appearances in Xcode.
- **Android:** use `upload/android/adaptive-foreground-432.png`, `adaptive-background-432.png` and `adaptive-monochrome-432.png` for the adaptive icon, and `play-store-icon-512.png` for the listing.
- If the site is only a web app, skip this section. `apple-touch-icon.png` from step 2 already covers the iOS home-screen icon.

## Not your job (the owner does these by hand)
- Uploading profile pictures, headers and banners to X, Discord, Instagram, YouTube and Whop.
- App Store Connect and Google Play listing icons.
- Exporting the liquid glass `.icon` file from Icon Composer on a Mac.

## Rules
- Do not edit the SVG artwork, retype the wordmark in a font, or add effects.
- Do not touch the database, auth, payments or environment variables.
- Do not commit secrets. There is a `.env` one level above `brand/` in the VOLT folder; never copy it.
- No trademark search has been done on this logo. Mention that in the PR description.

## Unknowns to confirm with the owner
- Repo name, framework and hosting for the website.
- Whether a native iOS or Android app exists.
- Whether logos are also stored somewhere outside the repo (storage bucket, CDN, email provider).
