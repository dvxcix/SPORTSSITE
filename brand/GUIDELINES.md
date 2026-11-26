# SlipSurge logo guidelines

## 1. The logo
- **Idea:** an angular S struck by a lightning bolt that shows only above and below it, like a dollar sign.
- **Versions:** horizontal (primary), stacked, symbol only, wordmark only, app icon.
- **Files:** `svg/` holds the masters, `png/` the raster copies, `web/` the favicon and PWA icon set (`web/head-snippet.html` has the tags to paste).
- Rebuild everything with `node build.js`. The geometry lives in `geo.js`.

## 2. Which file to use
| Background | Use |
|---|---|
| Near-black or dark photo | `*-on-dark` (lime symbol, white wordmark) |
| White or light | `*-on-light` (near-black), or `*-tile-on-light` when you want the lime to show |
| Lime | `*-on-light` |
| One colour only (print, engraving, embroidery) | `*-black` or `*-white` |
| App stores | `svg/app-icon/slipsurge-app-icon-lime.svg` (square, the OS rounds the corners) |
| 32 px and smaller | `svg/symbol/slipsurge-symbol-small-*` or `svg/app-icon/slipsurge-tile-small-*` (bolt ends are drawn larger) |

`slipsurge-app-icon-glass-preview` is a mock-up of the glossy iOS look. It uses gradients, so treat it as a preview and not a master.

## 3. Clear space
Keep clear space equal to the thickness of one bar of the S on every side of the logo. It scales with the logo.

## 4. Minimum size
| Version | Screen | Print |
|---|---|---|
| Horizontal | 120 px wide | 30 mm wide |
| Stacked | 80 px wide | 20 mm wide |
| Symbol | 16 px (small-size file) | 6 mm |

## 5. Colour
| Name | HEX | RGB |
|---|---|---|
| Surge lime | #b4ff4d | 180, 255, 77 |
| Ink | #0a0a0b | 10, 10, 11 |
| White | #ffffff | 255, 255, 255 |

Lime is far brighter on screen than any CMYK mix can print. For print, ask the printer for a spot or neon ink match and approve a proof.
Lime on white fails for contrast: never place the lime symbol on white or light grey.

## 6. Wordmark
The wordmark is drawn, not typed. Every letter is built from the same stem and 45 degree corners as the symbol. No font licence is involved. Do not retype it in a font.

## 7. Don'ts
Don't stretch, rotate or slant it. Don't recolour it outside lime, ink, black and white. Don't add outlines, shadows or glows. Don't change the size or spacing between symbol and wordmark. Don't put it on a busy photo without the lime tile.

## 8. iOS icons and social artwork
These use gradients, so they are artwork built from the logo, not logo masters. Rebuild with `node build-social.js` then `bash render-social.sh`.

| File | Use |
|---|---|
| `ios/app-icon-default.png`, `-dark`, `-tinted` | Square 1024 icons for the three iOS appearances (the OS rounds the corners) |
| `ios/layer-foreground-*.png`, `ios/layer-background-*.png` | Separate layers to drop into Apple's Icon Composer, which adds the real glass effect |
| `ios/appearances-preview.png` | Preview of default, dark, tinted and clear |
| `social/x-header-dark.png`, `-lime` | X header, 1500 × 500 |
| `social/avatar-lime.png`, `-dark` | Profile picture for X, Discord, Instagram, Whop |
| `social/og-image.png` | Link preview, 1200 × 630 |
| `social/discord-banner.png` | Discord server banner, 960 × 540 |
| `social/wide-banner.png` | YouTube banner, 2560 × 1440 |
| `social/post-square-*.png`, `social/story-dark.png` | Square post 1080, story 1080 × 1920 |
| `social/wallpaper-dark.png` | Phone wallpaper |

The tagline on the social files is set in Bahnschrift, a Windows system font.

## 9. Open items
- No trademark search has been done. Do one before public launch.
- CMYK and Pantone values are not set.
