# What to upload where

Everything in `upload/` is a finished file at the exact size the platform asks for. Regenerate with `node make-upload.js`.

| Where | File |
|---|---|
| Xcode project | Drag the whole `ios/AppIcon.appiconset` folder into `Assets.xcassets`, replacing the existing AppIcon. It holds the default, dark and tinted icons. |
| App Store Connect | `ios/app-store-icon-1024.png` (1024 × 1024, no transparency) |
| Icon Composer (liquid glass) | Import the SVGs in `ios/icon-composer-layers` as layers. Icon Composer adds the glass and exports the `.icon` file. That step needs a Mac. |
| Google Play listing | `android/play-store-icon-512.png` |
| Android adaptive icon | `android/adaptive-foreground-432.png`, `adaptive-background-432.png`, `adaptive-monochrome-432.png` |
| Website root | Everything in `website/`. Paste `head-snippet.html` into the page `<head>`. |
| Site header | `website/logo-header-on-dark.svg` or `logo-header-on-light.svg` |
| Link previews | `website/og-image-1200x630.png` as the `og:image` |
| X | `x/profile-400x400.png`, `x/header-1500x500.png` |
| Discord | `discord/server-icon-512x512.png`, `discord/server-banner-960x540.png` |
| Instagram | `instagram/profile-1080x1080.png`, posts and story |
| YouTube | `youtube/profile-800x800.png`, `youtube/banner-2560x1440.png` |
| Whop and anything else | `general/square-logo-lime-1024.png` or the dark one |

Notes
- The dark and tinted iOS icons have a transparent background on purpose. iOS draws the dark background itself.
- Profile pictures are square. Each platform crops them to a circle, and the mark is sized to stay inside it.
- On the X header the bottom-left is left empty because the profile picture covers it.
