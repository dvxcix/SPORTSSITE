import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import { act, createElement, type ComponentType } from 'react'

const require = createRequire(import.meta.url)
const { JSDOM } = require('jsdom')
const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://www.slipsurge.com/feed' })
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true })
Object.assign(dom.window, { requestAnimationFrame: (fn: () => void) => { fn(); return 1 }, cancelAnimationFrame: () => {} })
const { createRoot } = await import('react-dom/client')
const bundle = await build({
  stdin: { contents: 'export { SafeImage } from "./src/components/ui/SafeImage"; export { ShareImageModal } from "./src/components/social/ShareImageModal"', resolveDir: resolve('.'), loader: 'tsx' },
  bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react-dom'], tsconfig: 'tsconfig.json',
})
const compiled = { exports: {} as Record<string, ComponentType<Record<string, unknown>>> }
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(require, compiled, compiled.exports)

test('cached image failures notify a containing preview once and retain a fallback', async () => {
  const originalComplete = Object.getOwnPropertyDescriptor(dom.window.HTMLImageElement.prototype, 'complete')!
  Object.defineProperty(dom.window.HTMLImageElement.prototype, 'complete', { configurable: true, get: () => true })
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host)
  let failures = 0
  try {
    const props = { src: '/expired.png', alt: 'Uploaded image', fallback: createElement('span', null, 'Image unavailable'), onFailure: () => failures++ }
    await act(async () => root.render(createElement(compiled.exports.SafeImage, props)))
    assert.equal(failures, 1)
    assert.equal(host.textContent, 'Image unavailable')
    await act(async () => root.render(createElement(compiled.exports.SafeImage, { ...props, className: 'dark-theme' })))
    assert.equal(failures, 1, 'theme changes do not retry an expired upload')
  } finally {
    await act(async () => root.unmount()); host.remove()
    Object.defineProperty(dom.window.HTMLImageElement.prototype, 'complete', originalComplete)
  }
})

test('share previews load eagerly while visible and recover from a failed request', async () => {
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host)
  try {
    await act(async () => root.render(createElement(compiled.exports.ShareImageModal, { postId: 'example', onClose: () => {} })))
    const image = document.querySelector<HTMLImageElement>('img[alt="Pick share preview"]')!
    assert.ok(image)
    assert.equal(image.loading || image.getAttribute('loading'), 'eager')
    assert.equal(image.style.display, 'block', 'a hidden lazy image cannot trigger its own reveal')
    await act(async () => image.dispatchEvent(new dom.window.Event('error')))
    assert.match(document.body.textContent!, /Couldn't generate a preview/)
    assert.doesNotMatch(document.body.textContent!, /Generating image/)
    assert.ok(document.querySelector('[aria-label="Close share menu"]'))
  } finally { await act(async () => root.unmount()); host.remove() }
})
