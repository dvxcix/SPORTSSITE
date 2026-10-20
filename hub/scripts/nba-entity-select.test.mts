import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import { act, createElement as h, useState, type ComponentType, type ReactNode } from 'react'

const require = createRequire(import.meta.url)
const { JSDOM } = require('jsdom')
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://www.slipsurge.com/the-paint', pretendToBeVisual: true })
const win = dom.window
Object.assign(globalThis, {
  window: win, document: win.document, HTMLElement: win.HTMLElement, HTMLInputElement: win.HTMLInputElement,
  Element: win.Element, Node: win.Node, NodeFilter: win.NodeFilter, Event: win.Event, CustomEvent: win.CustomEvent,
  MutationObserver: win.MutationObserver, getComputedStyle: win.getComputedStyle,
  requestAnimationFrame: win.requestAnimationFrame.bind(win), cancelAnimationFrame: win.cancelAnimationFrame.bind(win),
  IS_REACT_ACT_ENVIRONMENT: true,
  ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
})
Object.defineProperty(win.HTMLElement.prototype, 'offsetParent', { configurable: true, get() { return document.body } })
win.HTMLElement.prototype.scrollIntoView = () => {}
const { createRoot } = await import('react-dom/client')
const bundle = await build({ stdin: { contents: 'export {PaintBookSelect,PaintTeamSelect} from "./src/app/the-paint/PaintEntitySelect";export {ModalSurface} from "./src/components/ui/ModalSurface"', resolveDir: resolve('.'), loader: 'tsx' }, bundle: true, write: false, outfile: 'entity-select.cjs', platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react-dom'], tsconfig: 'tsconfig.json', loader: { '.css': 'empty' } })
type SelectProps = { value: string; onChange: (value: string) => void; label?: string; allowAll?: boolean; books?: string[]; teams?: { id: number; abbreviation: string; full_name: string }[] }
const fixture = { exports: {} as { PaintBookSelect: ComponentType<SelectProps>; PaintTeamSelect: ComponentType<SelectProps>; ModalSurface: ComponentType<{ open: boolean; onClose: () => void; label: string; children?: ReactNode }> } }
new Function('require', 'module', 'exports', bundle.outputFiles.find(file => file.path.endsWith('.cjs'))!.text)(require, fixture, fixture.exports)
const { PaintBookSelect, PaintTeamSelect, ModalSurface } = fixture.exports

async function settle() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 35)) }) }
async function press(target: Element, key: string) {
  await act(async () => target.dispatchEvent(new win.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })))
  await settle()
}
async function click(target: Element) {
  await act(async () => target.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true })))
  await settle()
}
async function render(children: ReactNode) {
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  await act(async () => root.render(children)); await settle()
  return { host, close: async () => { await act(async () => root.unmount()); host.remove(); await settle() } }
}
function choice(name: string) {
  const node = [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')].find(item => item.textContent === name)
  assert.ok(node, `Missing ${name} choice`)
  return node
}
function BookFixture({ changes, allowAll = true }: { changes: string[]; allowAll?: boolean }) {
  const [value, setValue] = useState('fanduel')
  return h(PaintBookSelect, { value, books: ['fanduel', 'draftkings', 'ballybet', 'betparx'], allowAll, label: 'Player sportsbook', onChange: value => { setValue(value); changes.push(value) } })
}

test('sportsbook selector shows a real logo and uses a portalled keyboard menu to select the exact vendor', async () => {
  const changes: string[] = [], ui = await render(h(BookFixture, { changes }))
  try {
    const trigger = ui.host.querySelector('button')!
    assert.equal(trigger.textContent, '')
    assert.equal(trigger.getAttribute('aria-label'), 'Player sportsbook: FanDuel')
    assert.equal(trigger.querySelector('img')?.getAttribute('src'), '/sportsbooks/fanduel.ico')
    trigger.focus(); await press(trigger, 'ArrowDown')
    const menu = document.querySelector('[role="menu"]')!
    assert.ok(menu); assert.equal(ui.host.contains(menu), false)
    assert.equal(choice('Bally Bet').querySelector('img')?.getAttribute('src'), '/sportsbooks/ballybet.webp')
    assert.equal(choice('betPARX').querySelector('img')?.getAttribute('src'), '/sportsbooks/betparx.png')
    assert.equal(choice('FanDuel').getAttribute('aria-checked'), 'true')
    await press(document.activeElement!, 'End')
    assert.equal(document.activeElement, choice('betPARX'))
    await press(document.activeElement!, 'Enter')
    assert.deepEqual(changes, ['betparx'])
    assert.equal(document.querySelector('[role="menu"]'), null)
    assert.equal(document.activeElement, trigger)
    assert.equal(trigger.getAttribute('data-value'), 'betparx')
    assert.equal(trigger.querySelector('img')?.getAttribute('src'), '/sportsbooks/betparx.png')
  } finally { await ui.close() }
})

test('sportsbook menu preserves all-books selection and supports market-story single-book mode', async () => {
  const changes: string[] = [], ui = await render(h(BookFixture, { changes }))
  try {
    const trigger = ui.host.querySelector('button')!
    trigger.focus(); await press(trigger, 'ArrowDown'); await click(choice('All sportsbooks'))
    assert.deepEqual(changes, ['all']); assert.equal(trigger.getAttribute('data-value'), 'all')
    assert.deepEqual([...trigger.querySelectorAll('img')].map(image => image.getAttribute('src')), ['/sportsbooks/fanduel.ico', '/sportsbooks/draftkings.png', '/sportsbooks/ballybet.webp'])
    assert.equal(trigger.querySelector('[data-sportsbook-mark="all"]')?.getAttribute('aria-hidden'), 'true')
    assert.equal(trigger.getAttribute('aria-label'), 'Player sportsbook: All sportsbooks')
  } finally { await ui.close() }
  const single = await render(h(PaintBookSelect, { value: 'betparx', books: [], allowAll: false, onChange: () => {} }))
  try {
    const trigger = single.host.querySelector('button')!
    trigger.focus(); await press(trigger, 'ArrowDown')
    assert.equal(document.querySelectorAll('[role="menuitemradio"]').length, 1)
    assert.equal(choice('betPARX').getAttribute('aria-checked'), 'true')
  } finally { await single.close() }
})

test('team selector keeps numeric team IDs as string filter values with full names only in the menu', async () => {
  const changes: string[] = []
  function Teams() {
    const [value, setValue] = useState('all')
    return h(PaintTeamSelect, { value, onChange: value => { changes.push(value); setValue(value) }, teams: [{ id: 2, abbreviation: 'BOS', full_name: 'Boston Celtics' }, { id: 9, abbreviation: 'DET', full_name: 'Detroit Pistons' }] })
  }
  const ui = await render(h(Teams))
  try {
    const trigger = ui.host.querySelector('button')!
    assert.equal(trigger.textContent, '')
    assert.equal(trigger.querySelectorAll('img').length, 2)
    trigger.focus(); await press(trigger, 'ArrowDown')
    assert.ok(choice('Boston Celtics').querySelector('img')?.getAttribute('src')?.endsWith('/bos.png'))
    await click(choice('Detroit Pistons'))
    assert.deepEqual(changes, ['9']); assert.equal(trigger.getAttribute('data-value'), '9')
    assert.equal(trigger.getAttribute('aria-label'), 'Team: Detroit Pistons')
    assert.equal(trigger.textContent, '')
  } finally { await ui.close() }
})

test('Escape dismisses a selector inside the player dialog without closing that dialog or losing focus', async () => {
  let closed = 0
  const ui = await render(h(ModalSurface, { open: true, onClose: () => { closed++ }, label: 'Player details' }, h(BookFixture, { changes: [] })))
  try {
    const trigger = document.querySelector<HTMLButtonElement>('[data-paint-entity-select="book"]')!
    trigger.focus(); await press(trigger, 'ArrowDown')
    assert.ok(document.querySelector('[role="menu"]'))
    await press(document.activeElement!, 'Escape')
    assert.equal(document.querySelector('[role="menu"]'), null)
    assert.equal(closed, 0)
    assert.ok(document.querySelector('[role="dialog"]'))
    assert.equal(document.body.style.overflow, 'hidden')
    assert.equal(document.activeElement, trigger)
    await press(trigger, 'Escape')
    assert.equal(closed, 1)
  } finally { await ui.close() }
})
