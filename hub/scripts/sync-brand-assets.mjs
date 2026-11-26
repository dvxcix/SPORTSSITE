// Publish exact handoff artwork and resize raster compatibility/native exports.
// Run from hub/. Never runs the source kit's generators or reads credentials.
import { copyFile, cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const root = path.resolve(import.meta.dirname, '..')
const kit = path.resolve(root, '../brand')
const web = path.join(kit, 'upload/website')
const publicRoot = path.join(root, 'public')
const publicBrand = path.join(publicRoot, 'brand/2027')
await mkdir(publicBrand, { recursive: true })
for (const file of await readdir(web)) {
  if (file.startsWith('logo-header-') || file === 'head-snippet.html' || file === 'site.webmanifest') continue
  await copyFile(path.join(web, file), path.join(publicRoot, file))
}
for (const surface of ['dark', 'light']) {
  const header = `logo-header-on-${surface}.svg`
  await copyFile(path.join(web, header), path.join(publicBrand, header))
  await sharp(path.join(web, header)).resize(580).png().toFile(path.join(publicBrand, header.replace('.svg', '.png')))
  for (const small of ['', '-small']) {
    await copyFile(path.join(kit, `svg/symbol/slipsurge-symbol${small}-${surface === 'dark' ? 'lime' : 'ink'}.svg`), path.join(publicBrand, `symbol${small}-on-${surface}.svg`))
  }
}
const square = path.join(kit, 'upload/general/square-logo-lime-1024.png')
for (const file of ['logo.png', 'brand-bolt.png']) {
  await sharp(square).resize(1030, 1030).png().toFile(path.join(publicRoot, file))
  await copyFile(path.join(publicRoot, file), path.join(publicRoot, 'review-assets', file))
}
await copyFile(path.join(publicRoot, 'icon-192.png'), path.join(publicRoot, 'review-assets/icon-192.png'))
await copyFile(path.join(publicRoot, 'brand-bolt.png'), path.join(root, 'src/app/brand-bolt.png'))
await copyFile(path.join(web, 'og-image-1200x630.png'), path.join(publicRoot, 'og.png'))

// Keep the existing install identity, launch URL, scope and useful shortcuts.
const manifest = JSON.parse(await readFile(path.join(web, 'site.webmanifest'), 'utf8'))
Object.assign(manifest, {
  name: 'SlipSurge', short_name: 'SlipSurge', id: '/', scope: '/', start_url: '/launch',
  description: 'Sports research, live market movement, verified picks, creator communities, and real-time scores.',
  orientation: 'any', lang: 'en-US', categories: ['sports', 'social', 'utilities'], prefer_related_applications: false,
  shortcuts: [
    { name: 'The Feed', short_name: 'Feed', description: 'Open your SlipSurge feed', url: '/feed', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
    { name: 'Live Scores', short_name: 'Scores', description: 'Open live games and scores', url: '/sports', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
  ],
})
await writeFile(path.join(publicRoot, 'site.webmanifest'), JSON.stringify(manifest, null, 2) + '\n')

const mobile = path.join(root, 'mobile/assets')
await copyFile(path.join(kit, 'upload/ios/AppIcon.appiconset/AppIcon.png'), path.join(mobile, 'icon.png'))
await copyFile(path.join(kit, 'upload/ios/AppIcon.appiconset/AppIcon-dark.png'), path.join(mobile, 'icon-dark.png'))
await copyFile(path.join(kit, 'upload/ios/AppIcon.appiconset/AppIcon-tinted.png'), path.join(mobile, 'icon-tinted.png'))
await copyFile(path.join(web, 'favicon-48.png'), path.join(mobile, 'favicon.png'))
await copyFile(path.join(web, 'icon-512.png'), path.join(mobile, 'splash-icon.png'))
for (const layer of ['foreground', 'background', 'monochrome']) {
  await copyFile(path.join(kit, `upload/android/adaptive-${layer}-432.png`), path.join(mobile, `android-icon-${layer}.png`))
}
await cp(path.join(kit, 'upload/ios/AppIcon.appiconset'), path.join(root, 'desktop/src-tauri/icons/ios/AppIcon.appiconset'), { recursive: true })
await copyFile(path.join(kit, 'svg/app-icon/slipsurge-app-icon-lime.svg'), path.join(root, 'desktop/src-tauri/icons/source.svg'))
console.log('Synced finished 2027 brand artwork, compatibility URLs and mobile icon sources.')
