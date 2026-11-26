import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import sharp from 'sharp'

const root = path.resolve(import.meta.dirname, '..')
const kit = path.resolve(root, '../brand')
const bytes = file => readFile(path.resolve(root, file))

test('website exports preserve the finished artwork byte for byte', async () => {
  for (const file of ['favicon.ico', 'favicon.svg', 'apple-touch-icon.png', 'favicon-16.png', 'favicon-32.png', 'favicon-48.png', 'icon-192.png', 'icon-512.png', 'maskable-512.png', 'og-image-1200x630.png']) {
    assert.deepEqual(await bytes(`public/${file}`), await readFile(path.join(kit, 'upload/website', file)), file)
  }
  for (const surface of ['dark', 'light']) {
    assert.deepEqual(await bytes(`public/brand/2027/logo-header-on-${surface}.svg`), await readFile(path.join(kit, `upload/website/logo-header-on-${surface}.svg`)))
    for (const small of ['', '-small']) {
      assert.deepEqual(await bytes(`public/brand/2027/symbol${small}-on-${surface}.svg`), await readFile(path.join(kit, `svg/symbol/slipsurge-symbol${small}-${surface === 'dark' ? 'lime' : 'ink'}.svg`)))
    }
  }
})

test('compatibility images keep their dimensions and use the new square artwork', async () => {
  const expected = await sharp(path.join(kit, 'upload/general/square-logo-lime-1024.png')).resize(1030, 1030).png().toBuffer()
  for (const file of ['public/logo.png', 'public/brand-bolt.png', 'public/review-assets/logo.png', 'public/review-assets/brand-bolt.png', 'src/app/brand-bolt.png']) assert.deepEqual(await bytes(file), expected, file)
  const og = await sharp(await bytes('public/og.png')).metadata()
  assert.deepEqual([og.width, og.height], [1200, 630])
  assert.deepEqual(await bytes('public/og.png'), await bytes('public/og-image-1200x630.png'))
})

test('install manifest retains app identity, launch path and shortcuts with a maskable icon', async () => {
  const manifest = JSON.parse(await bytes('public/site.webmanifest'))
  assert.equal(manifest.name, 'SlipSurge')
  assert.equal(manifest.id, '/')
  assert.equal(manifest.scope, '/')
  assert.equal(manifest.start_url, '/launch')
  assert.equal(manifest.display, 'standalone')
  assert.equal(manifest.theme_color, '#b4ff4d')
  assert.ok(manifest.shortcuts.some(item => item.url === '/feed'))
  assert.ok(manifest.shortcuts.some(item => item.url === '/sports'))
  assert.ok(manifest.icons.some(icon => icon.src === '/maskable-512.png' && icon.purpose === 'maskable'))
})

test('native sources use the supplied iOS appearances and Android layers', async () => {
  const config = JSON.parse(await bytes('mobile/app.json')).expo
  assert.equal(config.name, 'SlipSurge')
  for (const [appearance, source] of Object.entries({ light: 'AppIcon.png', dark: 'AppIcon-dark.png', tinted: 'AppIcon-tinted.png' })) {
    assert.deepEqual(await bytes(`mobile/${config.ios.icon[appearance]}`), await readFile(path.join(kit, 'upload/ios/AppIcon.appiconset', source)))
  }
  for (const layer of ['foreground', 'background', 'monochrome']) assert.deepEqual(await bytes(`mobile/assets/android-icon-${layer}.png`), await readFile(path.join(kit, `upload/android/adaptive-${layer}-432.png`)))
  for (const file of await readdir(path.join(kit, 'upload/ios/AppIcon.appiconset'))) assert.deepEqual(await bytes(`desktop/src-tauri/icons/ios/AppIcon.appiconset/${file}`), await readFile(path.join(kit, 'upload/ios/AppIcon.appiconset', file)))
})
