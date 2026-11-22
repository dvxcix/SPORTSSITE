import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { act, createElement as h, useRef } from 'react'
import { build } from 'esbuild'

const require = createRequire(import.meta.url), { JSDOM } = require('jsdom')
const win = new JSDOM('<!doctype html><body></body>', { url: 'https://slipsurge.invalid', pretendToBeVisual: true }).window
Object.assign(globalThis, { window: win, document: win.document, HTMLElement: win.HTMLElement, Node: win.Node, IS_REACT_ACT_ENVIRONMENT: true })
const { createRoot } = await import('react-dom/client')
let mobile = false, contentHeight = 100
win.matchMedia = () => ({ matches: mobile })
const viewport = Object.assign(new win.EventTarget(), { offsetLeft: 0, offsetTop: 0, width: 800, height: 800 })
Object.defineProperty(win, 'visualViewport', { value: viewport })
Object.defineProperty(win, 'innerWidth', { value: 800, configurable: true })
Object.defineProperty(win, 'innerHeight', { value: 800, configurable: true })
const observers: Array<{ callback: () => void; disconnected: boolean }> = []
class Observer {
  state: (typeof observers)[number]
  constructor(callback: () => void) { this.state = { callback, disconnected: false }; observers.push(this.state) }
  observe() {}
  disconnect() { this.state.disconnected = true }
}
Object.assign(globalThis, { ResizeObserver: Observer })
win.HTMLElement.prototype.getBoundingClientRect = function () {
  return (this.classList.contains('ss-floating-surface')
    ? { x: 0, y: 0, width: 300, height: contentHeight, left: 0, right: 300, top: 0, bottom: contentHeight }
    : { x: 680, y: 600, width: 80, height: 40, left: 680, right: 760, top: 600, bottom: 640 }) as DOMRect
}
const bundle = await build({ stdin: { contents: 'export {FloatingSurface} from "./src/components/ui/FloatingSurface"', resolveDir: resolve('.'), loader: 'tsx' }, bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react-dom'] })
const mod = { exports: {} as any }; new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(require, mod, mod.exports)
function Fixture({ sheet = false, close = () => {} }) {
  const anchor = useRef<HTMLButtonElement>(null)
  return h('div', null, h('button', { ref: anchor }, 'Open'), h(mod.exports.FloatingSurface, { open: true, anchorRef: anchor, onClose: close, mobileSheet: sheet, ariaLabel: 'Picker' }, 'Content'))
}
async function mount(props = {}) {
  mobile = false; contentHeight = 100; observers.length = 0
  Object.assign(viewport, { offsetLeft: 0, offsetTop: 0, width: 800, height: 800 })
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host)
  await act(async () => root.render(h(Fixture, props)))
  return { root, host, panel: document.querySelector<HTMLElement>('[aria-label="Picker"]')!, close: async () => { await act(async () => root.unmount()); host.remove() } }
}
async function frame(action: () => void) { await act(async () => { action(); await new Promise(resolve => win.requestAnimationFrame(() => resolve(null))) }) }

test('asynchronous content growth repositions an open popover above its anchor', async () => {
  const ui = await mount(); try {
    assert.equal(ui.panel.style.top, '649px')
    assert.equal(ui.panel.style.left, '490px')
    await frame(() => { contentHeight = 300; observers[0].callback() })
    assert.equal(ui.panel.style.top, '291px')
    assert.equal(ui.panel.style.maxHeight, '780px')
  } finally { await ui.close() }
  assert.equal(observers[0].disconnected, true)
})
test('keyboard and zoom viewport changes keep the entire surface within visible bounds', async () => {
  const ui = await mount(); try {
    await frame(() => { Object.assign(viewport, { offsetLeft: 100, offsetTop: 200, width: 350, height: 240 }); contentHeight = 500; viewport.dispatchEvent(new win.Event('resize')) })
    assert.equal(ui.panel.style.left, '140px')
    assert.equal(ui.panel.style.top, '210px')
    assert.equal(ui.panel.style.maxHeight, '220px')
    assert.equal(ui.panel.style.overflowY, 'auto')
  } finally { await ui.close() }
})
test('mobile sheets track the keyboard inset and retain their scrollable height', async () => {
  const ui = await mount({ sheet: true }); try {
    await frame(() => { mobile = true; Object.assign(viewport, { width: 390, height: 400 }); viewport.dispatchEvent(new win.Event('resize')) })
    assert.equal(ui.panel.style.getPropertyValue('--ss-vp-bottom'), '400px')
    assert.equal(ui.panel.style.getPropertyValue('--ss-vp-right'), '410px')
    assert.match(ui.panel.style.maxHeight, /380px/)
    assert.equal(ui.panel.style.overflowY, 'auto')
    assert.equal(ui.panel.style.opacity, '1')
  } finally { await ui.close() }
})
test('dismissal remains keyboard accessible and pending resize work is removed on close', async () => {
  let closed = 0; const ui = await mount({ close: () => closed++ })
  await act(async () => document.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  assert.equal(closed, 1)
  await ui.close()
  viewport.dispatchEvent(new win.Event('resize'))
  assert.equal(document.querySelector('[aria-label="Picker"]'), null)
})
