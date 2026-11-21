import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import { act, createElement, type ComponentType } from 'react'
import { isStoryVideo, storyBackground, storyTextColor } from '../src/lib/storyPresentation'

const require = createRequire(import.meta.url)
const { JSDOM } = require('jsdom')
const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://www.slipsurge.com/feed' })
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true })
let reduced = false
let advance: (() => void) | null = null
Object.assign(dom.window, {
  matchMedia: () => ({ matches: reduced }),
  requestAnimationFrame: (fn: (time: number) => void) => { fn(0); return 1 },
  cancelAnimationFrame: () => {},
  setInterval: (fn: () => void) => { advance = fn; return 1 },
  clearInterval: () => { advance = null },
})
dom.window.HTMLMediaElement.prototype.play = async () => {}
dom.window.HTMLMediaElement.prototype.pause = () => {}
const originalClearInterval = globalThis.clearInterval
globalThis.clearInterval = ((timer: Parameters<typeof clearInterval>[0]) => { if (timer === 1) advance = null; else originalClearInterval(timer) }) as typeof clearInterval
const { createRoot } = await import('react-dom/client')
const stubs: Record<string, string> = {
  'next/link': 'import React from "react";export default ({children,...props})=>React.createElement("a",props,children)',
  './MemberAvatar': 'export const MemberAvatar=()=>null',
  '@/components/ui/SafeImage': 'import React from "react";export const SafeImage=({onFailure,...props})=>React.createElement("img",{...props,onError:onFailure})',
}
const bundle = await build({
  stdin: { contents: 'export { StoriesViewer } from "./src/components/social/StoriesViewer"', resolveDir: resolve('.'), loader: 'tsx' },
  bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react-dom'], tsconfig: 'tsconfig.json',
  plugins: [{ name: 'story-fixture', setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => args.path in stubs ? { path: args.path, namespace: 'fixture' } : undefined)
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: stubs[args.path], loader: 'tsx' }))
  } }],
})
const compiled = { exports: {} as { StoriesViewer: ComponentType<Record<string, unknown>> } }
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(require, compiled, compiled.exports)
const author = { username: 'test-member', display_name: 'Test member' }
const stories = [
  { id: 'one', story_type: 'text', content: 'First story', bg_color: '#ffffff', media_url: null, author, created_at: '2026-11-20T12:00:00Z' },
  { id: 'two', story_type: 'text', content: 'Second story', bg_color: '#111111', media_url: null, author, created_at: '2026-11-20T12:00:00Z' },
]

test('story text contrasts with its own background in either application theme', () => {
  for (const value of ['#111111', '#1a1a2e', '#16213e', '#0f3460', '#1a472a', '#4a1942']) assert.equal(storyTextColor(value), '#ffffff')
  assert.equal(storyTextColor('#ffffff'), '#000000')
  assert.equal(storyBackground('url(unsafe)'), '#111111')
  assert.equal(storyBackground(null), '#111111')
})

test('video detection retains signed media URLs', () => {
  assert.equal(isStoryVideo('https://example.com/video.mp4?token=example'), true)
  assert.equal(isStoryVideo('/review-assets/story.webm#fragment'), true)
  assert.equal(isStoryVideo('/photo.webp'), false)
})

test('pause preserves progress, navigation resets it, and the viewer uses modal focus handling', async () => {
  reduced = false
  let closed = 0
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host)
  try {
    await act(async () => root.render(createElement(compiled.exports.StoriesViewer, { stories, initialIndex: 0, onClose: () => { closed++ } })))
    assert.equal(document.activeElement?.getAttribute('aria-label'), 'Close stories')
    assert.equal(document.body.classList.contains('ss-modal-open'), true)
    await act(async () => { for (let i = 0; i < 10; i++) advance?.() })
    assert.equal(document.querySelector<HTMLElement>('.ss-story-progress button span')?.style.width, '10%')
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Pause story"]')!.click())
    assert.equal(advance, null)
    assert.equal(document.querySelector<HTMLElement>('.ss-story-progress button span')?.style.width, '10%')
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Play story"]')!.click())
    await act(async () => advance?.())
    assert.equal(document.querySelector<HTMLElement>('.ss-story-progress button span')?.style.width, '11%')
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Next story"]')!.click())
    assert.match(document.querySelector('.ss-story-text')!.textContent!, /Second story/)
    assert.equal(document.querySelectorAll<HTMLElement>('.ss-story-progress button span')[1].style.width, '0%')
    await act(async () => document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    assert.equal(closed, 1)
  } finally { await act(async () => root.unmount()); host.remove() }
  assert.equal(document.body.classList.contains('ss-modal-open'), false)
})

test('reduced motion starts paused and video failures offer recovery without advancing', async () => {
  reduced = true
  let closed = 0
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host)
  try {
    const videoStory = { ...stories[0], id: 'video', story_type: 'video', media_url: '/video.webm', content: null }
    await act(async () => root.render(createElement(compiled.exports.StoriesViewer, { stories: [videoStory], initialIndex: 0, onClose: () => { closed++ } })))
    assert.ok(document.querySelector('[aria-label="Play story"]'))
    assert.equal(advance, null)
    await act(async () => document.querySelector('video')!.dispatchEvent(new dom.window.Event('error')))
    assert.match(document.querySelector('.ss-story-error')!.textContent!, /couldn’t load/)
    assert.equal(closed, 0)
    await act(async () => document.querySelector<HTMLButtonElement>('.ss-story-error button')!.click())
    assert.equal(document.querySelector('.ss-story-error'), null)
  } finally { await act(async () => root.unmount()); host.remove(); reduced = false }
})

test('failed story photos stay visible as a recoverable state instead of a blank slide', async () => {
  reduced = true
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host)
  try {
    await act(async () => root.render(createElement(compiled.exports.StoriesViewer, { stories: [{ ...stories[0], story_type: 'image', media_url: '/expired-photo.png' }], initialIndex: 0, onClose: () => {} })))
    await act(async () => document.querySelector<HTMLImageElement>('img')!.dispatchEvent(new dom.window.Event('error')))
    assert.match(document.querySelector('[role="status"]')!.textContent!, /photo couldn’t load/)
    const retryButton = [...document.querySelectorAll('button')].find(button => button.textContent === 'Retry photo')!
    assert.ok(retryButton)
    await act(async () => retryButton.click())
    assert.equal(document.querySelector('[role="status"]'), null)
    assert.ok(document.querySelector('img'))
  } finally { await act(async () => root.unmount()); host.remove() }
})
