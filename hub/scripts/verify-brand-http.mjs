import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const base = new URL(process.argv[2] || 'http://127.0.0.1:4267')
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname), 'Use a local built site for this check')
const root = path.resolve(import.meta.dirname, '..')
const iconRoutes = { '/favicon.ico': 'src/app/favicon.ico', '/icon.png': 'src/app/icon.png', '/apple-icon.png': 'src/app/apple-icon.png' }
for (const file of ['/favicon.ico', '/favicon.svg', '/apple-touch-icon.png', '/icon.png', '/apple-icon.png', '/site.webmanifest', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/maskable-512.png', '/logo.png', '/brand-bolt.png', '/og.png', '/og-image-1200x630.png', '/brand/2027/logo-header-on-dark.svg', '/brand/2027/logo-header-on-light.svg', '/brand/2027/logo-header-on-dark.png']) {
  const response = await fetch(new URL(file, base), { redirect: 'manual' })
  assert.equal(response.status, 200, file)
  const actual = Buffer.from(await response.arrayBuffer())
  assert.ok(actual.byteLength > 100, file)
  if (!file.endsWith('.webmanifest')) {
    const expected = await readFile(path.join(root, iconRoutes[file] || `public${file}`))
    if (file.endsWith('.svg')) assert.equal(actual.toString().replaceAll('\r\n', '\n'), expected.toString().replaceAll('\r\n', '\n'), file)
    else assert.deepEqual(actual, expected, `Exact served artwork: ${file}`)
  }
  console.log(`200 ${file}`)
}
const html = await (await fetch(base)).text()
for (const expected of ['favicon.ico?v=2027', 'favicon.svg?v=2027', 'apple-touch-icon.png?v=2027', 'https://www.slipsurge.com/og-image-1200x630.png', 'summary_large_image']) assert.ok(html.includes(expected), `Missing head value: ${expected}`)
assert.doesNotMatch(html, /(?:content|href)="(?:https:\/\/www\.slipsurge\.com)?\/og\.png"/)
for (const file of ['/site.webmanifest', '/manifest.webmanifest']) {
  const manifest = await (await fetch(new URL(file, base))).json()
  assert.equal(manifest.start_url, '/launch')
  assert.ok(manifest.icons.some(icon => icon.purpose === 'maskable'))
}
console.log('Built HTML metadata and both install manifests verified.')
