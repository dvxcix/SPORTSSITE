import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import { act, createElement as h } from 'react'
import sharp from 'sharp'
import { AVATAR_DECORATIONS, RING_STYLES, avatarDecoration, decorationPath, isAvatarStyle } from '../src/lib/avatarStyles.ts'
import { validateSvg } from './import-avatar-decorations.mjs'

const require = createRequire(import.meta.url)
const { JSDOM } = require('jsdom')
const win = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://slipsurge.invalid', pretendToBeVisual: true }).window
Object.assign(globalThis, { window: win, document: win.document, HTMLElement: win.HTMLElement, Event: win.Event, getComputedStyle: win.getComputedStyle, IS_REACT_ACT_ENVIRONMENT: true })
let reduced = false
const mediaListeners = new Set<() => void>()
Object.defineProperty(win, 'matchMedia', { value: () => ({ get matches() { return reduced }, addEventListener: (_: string, f: () => void) => mediaListeners.add(f), removeEventListener: (_: string, f: () => void) => mediaListeners.delete(f) }) })
let observation: ((entries: { target: Element; isIntersecting: boolean }[]) => void) | undefined
const watched = new Set<Element>()
Object.assign(globalThis, { IntersectionObserver: class {
  constructor(callback: typeof observation) { observation = callback }
  observe(el: Element) { watched.add(el) }
  unobserve(el: Element) { watched.delete(el) }
  disconnect() { watched.clear() }
} })
const { createRoot } = await import('react-dom/client')
const bundle = await build({ stdin: { contents: 'export { MemberAvatar } from "./src/components/social/MemberAvatar"; export { AvatarStylePicker } from "./src/components/settings/AvatarStylePicker"', resolveDir: resolve('.'), loader: 'tsx' }, bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react-dom'], tsconfig: 'tsconfig.json' })
const bundled = { exports: {} as { MemberAvatar: React.ComponentType<Record<string, unknown>>; AvatarStylePicker: React.ComponentType<Record<string, unknown>> } }
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(require, bundled, bundled.exports)
const { MemberAvatar, AvatarStylePicker } = bundled.exports

test('all 50 originals match the handoff; every still is safe, animation-free and visible at chat size', async () => {
  const provenance = JSON.parse(await fs.readFile('docs/design/avatar-decoration-provenance-2026-11-21.json', 'utf8'))
  assert.equal(AVATAR_DECORATIONS.length, 50)
  assert.equal(new Set(AVATAR_DECORATIONS.map(item => item.id)).size, 50)
  assert.deepEqual(Object.fromEntries(['football', 'basketball', 'baseball', 'slipsurge'].map(sport => [sport, AVATAR_DECORATIONS.filter(item => item.sport === sport).length])), { football: 15, basketball: 15, baseball: 15, slipsurge: 5 })
  for (const item of AVATAR_DECORATIONS) {
    const original = await fs.readFile(`public${decorationPath(item, true)}`, 'utf8')
    assert.equal(crypto.createHash('sha256').update(original).digest('hex'), provenance.originals.find((row: { id: string }) => row.id === item.id).sha256, item.id)
    validateSvg(original)
    const still = await fs.readFile(`public${decorationPath(item)}`, 'utf8')
    validateSvg(still)
    assert.doesNotMatch(still, /<animate|<set\b|@(?:-webkit-)?keyframes|\banimation\s*:/i, item.id)
    const { data } = await sharp(Buffer.from(still)).resize(42, 42).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    assert.ok(data.some((value, index) => index % 4 === 3 && value > 100), `${item.id} must remain visible at 32px photo size`)
  }
})

test('only legacy rings and the supplied IDs can resolve a decoration URL', () => {
  for (const ring of RING_STYLES) assert.ok(isAvatarStyle(ring))
  for (const item of AVATAR_DECORATIONS) assert.equal(avatarDecoration(`deco:${item.id}`)?.id, item.id)
  for (const invalid of ['deco:../escape', 'deco:https://evil.invalid/image.svg', 'deco:unknown', '<svg onload=x>', '', null]) {
    assert.equal(isAvatarStyle(invalid), false)
    assert.equal(avatarDecoration(invalid), undefined)
  }
  assert.throws(() => validateSvg('<svg viewBox="-120 -120 240 240" xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))
})

test('the single migration allows exactly five existing rings and all 50 decorations without changing members or privileges', async () => {
  const migration = await fs.readFile('supabase/migrations/20261121213902_add_sports_avatar_decorations.sql', 'utf8')
  const check = migration.split('add constraint users_avatar_ring_style_check')[1]
  const values = [...check.matchAll(/'(none|solid|surge|pulse|orbit|deco:[a-z-]+)'/g)].map(match => match[1])
  assert.deepEqual(new Set(values), new Set([...RING_STYLES, ...AVATAR_DECORATIONS.map(item => `deco:${item.id}`)]))
  assert.equal(values.length, 55)
  assert.doesNotMatch(migration, /\b(update|delete|insert|grant|revoke|policy|default)\s+/i)
  assert.match(migration, /lock_timeout = '3s'/)
})

test('photo and dimensions survive style/theme changes; visibility and reduced motion stop SVG animation', async () => {
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host)
  try {
    await act(async () => root.render(h(MemberAvatar, { name: 'Test Member', src: '/member.png', size: 44, ringStyle: 'deco:bb-swish' })))
    const photo = host.querySelector('.ss-member-avatar-media img')
    const decoration = () => host.querySelector('.ss-avatar-decoration img')!
    assert.match(decoration().getAttribute('src')!, /\/still\//)
    await act(async () => observation?.([...watched].map(target => ({ target, isIntersecting: true }))))
    assert.match(decoration().getAttribute('src')!, /\/animated\//)
    reduced = true
    await act(async () => { for (const listener of mediaListeners) listener() })
    assert.match(decoration().getAttribute('src')!, /\/still\//)
    reduced = false
    await act(async () => { for (const listener of mediaListeners) listener() })
    assert.match(decoration().getAttribute('src')!, /\/animated\//)
    await act(async () => observation?.([...watched].map(target => ({ target, isIntersecting: false }))))
    assert.match(decoration().getAttribute('src')!, /\/still\//)
    document.documentElement.dataset.theme = 'light'
    await act(async () => root.render(h(MemberAvatar, { name: 'Test Member', src: '/member.png', size: 44, ringStyle: 'deco:ss-crown' })))
    assert.equal(host.querySelector('.ss-member-avatar-media img'), photo)
    assert.equal(host.querySelector<HTMLElement>('[role=img]')!.style.width, '44px')
    await act(async () => root.render(h(MemberAvatar, { name: 'Test Member', src: '/member.png', size: 44, ringStyle: 'deco:invalid' })))
    assert.equal(host.querySelector('.ss-avatar-decoration'), null)
    assert.ok(host.querySelector('.ring-surge'))
  } finally { await act(async () => root.unmount()); host.remove() }
  assert.equal(watched.size, 0); assert.equal(mediaListeners.size, 0)
})

test('picker filters all 50, uses still thumbnails, supports keyboard selection and preserves drafts on cancel', async () => {
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host)
  const changes: string[] = []
  const click = async (element: Element | null) => { assert.ok(element); await act(async () => element.dispatchEvent(new win.MouseEvent('click', { bubbles: true }))) }
  try {
    await act(async () => root.render(h(AvatarStylePicker, { value: 'orbit', name: 'Test Member', src: '/member.png', onChange: (value: string) => changes.push(value) })))
    await click(host.querySelector('button'))
    assert.equal(document.querySelectorAll('[role=radio]').length, 55)
    const thumbnails = document.querySelectorAll('.ss-avatar-picker-grid .ss-avatar-decoration img')
    assert.equal(thumbnails.length, 50)
    for (const image of thumbnails) assert.match(image.getAttribute('src')!, /\/still\//)
    await click([...document.querySelectorAll('.ss-avatar-picker-categories button')].find(el => el.textContent === 'Basketball')!)
    assert.equal(document.querySelectorAll('[role=radio]').length, 15)
    const radio = document.querySelector<HTMLButtonElement>('[role=radio]')!
    radio.focus()
    await act(async () => radio.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })))
    assert.equal(document.querySelector('[role=radio][aria-checked=true]')?.getAttribute('aria-label'), 'Handles')
    await click([...document.querySelectorAll('.ss-avatar-picker footer button')].find(el => el.textContent === 'Cancel')!)
    assert.deepEqual(changes, [])
    await click(host.querySelector('button'))
    assert.equal(document.querySelector('[role=radio][aria-checked=true]')?.getAttribute('aria-label'), 'Orbit ring')
    await click(document.querySelector('[role=radio][aria-label="Bolt Crown"]'))
    await click([...document.querySelectorAll('.ss-avatar-picker footer button')].find(el => el.textContent === 'Use style')!)
    assert.deepEqual(changes, ['deco:ss-crown'])
    assert.equal(document.querySelector('[role=dialog]'), null)
  } finally { await act(async () => root.unmount()); host.remove() }
})
