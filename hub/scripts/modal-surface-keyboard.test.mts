import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import { act, createElement as h, useState, type ComponentType, type ReactNode } from 'react'

const require = createRequire(import.meta.url)
const { JSDOM } = require('jsdom')
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://www.slipsurge.com' })
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })
const { createRoot } = await import('react-dom/client')

// JSDOM has no layout engine. Model visibility for the same offsetParent check
// used in the production trap; no focus or keyboard behavior is stubbed.
Object.defineProperty(dom.window.HTMLElement.prototype, 'offsetParent', { configurable: true, get(this: HTMLElement) {
  return this.closest('[hidden], [style*="display: none"]') ? null : document.body
} })
let nextFrame = 0
const frames = new Map<number, FrameRequestCallback>()
window.requestAnimationFrame = callback => { const id = ++nextFrame; frames.set(id, callback); return id }
window.cancelAnimationFrame = id => { frames.delete(id) }
async function flushFocus() {
  await act(async () => {
    const pending = [...frames.values()]; frames.clear()
    pending.forEach(callback => callback(0))
  })
}
const bundle = await build({ stdin: { contents: 'export {ModalSurface} from "./src/components/ui/ModalSurface"', resolveDir: resolve('.'), loader: 'tsx' }, bundle: true, write: false, outfile: 'modal.cjs', platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react-dom'], tsconfig: 'tsconfig.json' })
const fixtureModule = { exports: {} as { ModalSurface: ComponentType<{ open: boolean; onClose: () => void; label: string; children?: ReactNode }> } }
new Function('require', 'module', 'exports', bundle.outputFiles.find(file => file.path.endsWith('.cjs'))!.text)(require, fixtureModule, fixtureModule.exports)
const { ModalSurface } = fixtureModule.exports

async function press(target: Element, key: string, shiftKey = false) {
  const event = new dom.window.KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true })
  await act(async () => target.dispatchEvent(event))
  return event
}
async function click(target: Element) {
  await act(async () => target.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
}
function dialog(label: string) {
  const element = document.querySelector<HTMLElement>(`[role="dialog"][aria-label="${label}"]`)
  assert.ok(element, `Missing ${label} dialog`)
  return element
}
async function harness(children: ReactNode) {
  const opener = document.createElement('button'); opener.textContent = 'Page opener'; document.body.append(opener); opener.focus()
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  await act(async () => root.render(children)); await flushFocus()
  return { opener, close: async () => { await act(async () => root.unmount()); host.remove(); opener.remove(); frames.clear(); document.body.style.overflow = '' } }
}

test('initial modal panel handles Tab and Shift+Tab without escaping', async () => {
  const ui = await harness(h(ModalSurface, { open: true, onClose: () => {}, label: 'Single' }, h('button', { id: 'first' }, 'First'), h('button', { id: 'last' }, 'Last')))
  try {
    const panel = dialog('Single'), first = document.getElementById('first')!, last = document.getElementById('last')!
    assert.equal(document.activeElement, panel)
    assert.equal((await press(panel, 'Tab')).defaultPrevented, true)
    assert.equal(document.activeElement, first)
    panel.focus()
    assert.equal((await press(panel, 'Tab', true)).defaultPrevented, true)
    assert.equal(document.activeElement, last)
  } finally { await ui.close() }
})

test('modal boundaries wrap while disabled and hidden controls are excluded', async () => {
  const ui = await harness(h(ModalSurface, { open: true, onClose: () => {}, label: 'Boundaries' },
    h('button', { disabled: true }, 'Disabled first'), h('button', { hidden: true }, 'Hidden first'),
    h('button', { id: 'first' }, 'First'), h('button', { id: 'middle' }, 'Middle'), h('button', { id: 'last' }, 'Last'), h('button', { hidden: true }, 'Hidden last')))
  try {
    const first = document.getElementById('first')!, middle = document.getElementById('middle')!, last = document.getElementById('last')!
    first.focus(); assert.equal((await press(first, 'Tab', true)).defaultPrevented, true); assert.equal(document.activeElement, last)
    last.focus(); assert.equal((await press(last, 'Tab')).defaultPrevented, true); assert.equal(document.activeElement, first)
    middle.focus(); assert.equal((await press(middle, 'Tab')).defaultPrevented, false)
  } finally { await ui.close() }
})

test('modal with no focusable children keeps both Tab directions on the panel', async () => {
  const ui = await harness(h(ModalSurface, { open: true, onClose: () => {}, label: 'Empty' }, h('p', null, 'Informational content')))
  try {
    const panel = dialog('Empty')
    for (const backwards of [false, true]) {
      assert.equal((await press(panel, 'Tab', backwards)).defaultPrevented, true)
      assert.equal(document.activeElement, panel)
    }
  } finally { await ui.close() }
})

function NestedFixture({ closes }: { closes: string[] }) {
  const [parentOpen, setParentOpen] = useState(true), [childOpen, setChildOpen] = useState(false)
  return h(ModalSurface, { open: parentOpen, label: 'Parent', onClose: () => { closes.push('parent'); setParentOpen(false) } },
    h('button', { id: 'child-opener', onClick: () => setChildOpen(true) }, 'Open child'), h('button', { id: 'parent-last' }, 'Parent last'),
    h(ModalSurface, { open: childOpen, label: 'Child', onClose: () => { closes.push('child'); setChildOpen(false) } }, h('button', { id: 'child-first' }, 'Child first'), h('button', { id: 'child-last' }, 'Child last')))
}

test('nested modal Escape closes only the child, restores its opener and keeps the parent scroll lock', async () => {
  document.body.style.overflow = 'scroll'
  const closes: string[] = [], ui = await harness(h(NestedFixture, { closes }))
  try {
    const opener = document.getElementById('child-opener')!; opener.focus(); await click(opener); await flushFocus()
    assert.equal(document.activeElement, dialog('Child'))
    assert.equal(document.body.style.overflow, 'hidden'); assert.equal(document.body.classList.contains('ss-modal-open'), true)
    await press(dialog('Child'), 'Escape')
    assert.deepEqual(closes, ['child']); assert.equal(document.querySelector('[aria-label="Child"]'), null)
    assert.equal(document.activeElement, opener); assert.equal(document.body.style.overflow, 'hidden'); assert.equal(document.body.classList.contains('ss-modal-open'), true)
    await press(opener, 'Escape')
    assert.deepEqual(closes, ['child', 'parent']); assert.equal(document.querySelector('[role="dialog"]'), null)
    assert.equal(document.activeElement, ui.opener); assert.equal(document.body.style.overflow, 'scroll'); assert.equal(document.body.classList.contains('ss-modal-open'), false)
  } finally { await ui.close() }
})

test('nested modal Tab never lets the parent portal handler steal child focus', async () => {
  const ui = await harness(h(NestedFixture, { closes: [] }))
  try {
    const opener = document.getElementById('child-opener')!; opener.focus(); await click(opener); await flushFocus()
    const panel = dialog('Child'), first = document.getElementById('child-first')!, last = document.getElementById('child-last')!
    await press(panel, 'Tab'); assert.equal(document.activeElement, first)
    panel.focus(); await press(panel, 'Tab', true); assert.equal(document.activeElement, last)
    last.focus(); await press(last, 'Tab'); assert.equal(document.activeElement, first)
    first.focus(); await press(first, 'Tab', true); assert.equal(document.activeElement, last)
  } finally { await ui.close() }
})
