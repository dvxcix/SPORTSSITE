import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import { act, createElement as h, useState } from 'react'

const require = createRequire(import.meta.url)
const { JSDOM } = require('jsdom')
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://www.slipsurge.com/the-paint', pretendToBeVisual: true })
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })
const { createRoot } = await import('react-dom/client')
const navigations: string[] = []
;(globalThis as typeof globalThis & { polishNavigations: string[] }).polishNavigations = navigations
const compiled = await build({
  stdin: { contents: `export {SidelineNavigation} from './src/app/the-sideline/SidelineNavigation';export {ResearchNavGroup} from './src/components/layout/ResearchNavGroup';export {PaintBoardControls} from './src/app/the-paint/PaintBoardControls';export {TrendBars} from './src/app/the-paint/PaintVisuals';export {PaintPriceValue} from './src/app/the-paint/PaintPrice';`, resolveDir: resolve('.'), loader: 'tsx' },
  bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react','react-dom','react-dom/*'],
  plugins: [{ name: 'ui-polish-fixtures', setup(api) {
    api.onResolve({ filter: /NbaMatrixContext$/ }, () => ({ path: 'matrix', namespace: 'fixture' }))
    api.onResolve({ filter: /^next\/(navigation|image|link)$/ }, args => ({ path: args.path, namespace: 'fixture' }))
    api.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path === 'matrix' ? 'export const useNbaMatrixMatches=()=>[]' : args.path === 'next/navigation' ? `export const useSearchParams=()=>new URLSearchParams('game=fixture&date=2030-11-20&sample=previous');export const useRouter=()=>({push:href=>globalThis.polishNavigations.push(href)})` : `import React from 'react';export default function Fixture({children,prefetch,unoptimized,scroll,...props}){return ${args.path === 'next/link' ? '<a {...props}>{children}</a>' : '<img {...props}/>'}}`, loader: 'tsx' }))
    api.onLoad({ filter: /\.module\.css$/ }, () => ({ contents: 'export default new Proxy({},{get:(_,key)=>key})', loader: 'js' }))
  }}],
})
const module = { exports: {} as Record<string, React.ComponentType<any>> }
new Function('require','module','exports', compiled.outputFiles[0].text)(require, module, module.exports)
const ui = module.exports
async function mount(component: React.ReactNode, check: (host: HTMLElement, root: ReturnType<typeof createRoot>) => Promise<void>) {
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  try { await act(async () => root.render(component)); await check(host, root) }
  finally { await act(async () => root.unmount()); host.remove() }
}
const click = async (element: Element) => act(async () => element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))

test('research groups disclose existing destinations and open when their route becomes active', async () => {
  const child = h('a', { href: '/the-paint?view=tracking' }, 'Game tracking')
  await mount(h(ui.ResearchNavGroup, { label: 'Trends', active: false }, child), async (host, root) => {
    assert.equal(host.querySelector('button')!.getAttribute('aria-expanded'), 'false')
    assert.ok(host.querySelector('div[hidden] a[href$="tracking"]'))
    await click(host.querySelector('button')!)
    assert.equal(host.querySelector('button')!.getAttribute('aria-expanded'), 'true')
    assert.equal(host.querySelector('div[hidden]'), null)
    await click(host.querySelector('button')!)
    await act(async () => root.render(h(ui.ResearchNavGroup, { label: 'Trends', active: true }, child)))
    assert.equal(host.querySelector('button')!.getAttribute('aria-expanded'), 'true')
  })
})

test('phone filters retain their real state, close with Escape and become inline on desktop', async () => {
  function Fixture({ compact = true }: { compact?: boolean }) {
    const [target, setTarget] = useState('all')
    return h(ui.PaintBoardControls, { compact, summary: 'Points · N+', count: 8, search: h('input', { 'aria-label': 'Find a player' }) }, h('select', { 'aria-label': 'Target', value: target, onChange: (event: React.ChangeEvent<HTMLSelectElement>) => setTarget(event.target.value) }, h('option', { value: 'all' }, 'All'), h('option', { value: '20' }, '20+')))
  }
  await mount(h(Fixture), async (host, root) => {
    const trigger = host.querySelector('button')!
    assert.equal(document.querySelector('[role="dialog"]'), null)
    assert.ok(host.querySelector('[aria-label="Find a player"]'))
    await click(trigger)
    const target = document.querySelector<HTMLSelectElement>('[role="dialog"] select')!
    assert.ok(target)
    await act(async () => { target.value = '20'; target.dispatchEvent(new dom.window.Event('change', { bubbles: true })) })
    await act(async () => window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    assert.equal(document.querySelector('[role="dialog"]'), null)
    await click(trigger)
    assert.equal(document.querySelector<HTMLSelectElement>('[role="dialog"] select')!.value, '20')
    await act(async () => root.render(h(Fixture, { compact: false })))
    assert.equal(document.querySelector('[role="dialog"]'), null)
    assert.equal(host.querySelector<HTMLSelectElement>('select')!.value, '20')
    assert.equal(document.querySelectorAll('select[aria-label="Target"]').length, 1)
  })
})

test('game chart exposes dates, hit/miss/push and arrow-key point navigation without changing grades', async () => {
  const logs = [12,10,8].map((pts, index) => ({ id: index + 1, pts, game: { date: `2030-01-${String(3-index).padStart(2,'0')}` } }))
  await mount(h(ui.TrendBars, { logs, market: 'points', line: 10, side: 'over', tall: true }), async host => {
    const bars = [...host.querySelectorAll<HTMLButtonElement>('button[data-chart-bar]')]
    assert.deepEqual(bars.map(bar => bar.dataset.result), ['loss','push','win'])
    assert.match(bars[0].getAttribute('aria-label')!, /2030-01-01: 8 · Miss/)
    await act(async () => bars[0].focus())
    await act(async () => bars[0].dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })))
    assert.equal(document.activeElement, bars[1])
    assert.match(host.querySelector('output')!.textContent!, /2030-01-02 · 10 · Push/)
    assert.match(host.textContent!, /Line 10/)
  })
})

test('compact quote keeps exact opening identity and probability movement alongside current odds', async () => {
  await mount(h(ui.PaintPriceValue, { current: -110, opening: 110, at: '2030-01-01T12:00:00Z' }), async host => {
    assert.ok(host.querySelector('[aria-label="Now -110, open +110"]'))
    assert.match(host.textContent!, /Open\+110/)
    assert.match(host.textContent!, /4\.8 pp/)
    assert.ok(host.querySelector('[data-direction="shorter"]'))
  })
  await mount(h(ui.PaintPriceValue, { current: -110, opening: null }), async host => {
    assert.ok(host.querySelector('[aria-label="Comparison price unavailable"]'))
    assert.ok(host.querySelector('[data-direction="unknown"]'))
  })
})

test('NFL phone workspace selection preserves game, date and stat sample', async () => {
  const selected = { id: 'fixture', season: 2030, week: 12, gameType: 'REG', gameday: '2030-11-20', gametime: '20:20', home: { abbr: 'KC', name: 'Kansas City Chiefs', color: '#c00' }, away: { abbr: 'BUF', name: 'Buffalo Bills', color: '#00c' } }
  await mount(h(ui.SidelineNavigation, { games: [selected], days: [{ ...selected, date: selected.gameday }], selected, sample: 'previous', mode: '' }), async host => {
    const picker = host.querySelector<HTMLSelectElement>('select[aria-label="NFL research workspace"]')!
    assert.equal(picker.options.length, 6)
    await act(async () => { picker.value = 'cheatsheets'; picker.dispatchEvent(new dom.window.Event('change', { bubbles: true })) })
    const url = new URL(navigations.at(-1)!, 'https://www.slipsurge.com')
    assert.equal(url.searchParams.get('game'), 'fixture')
    assert.equal(url.searchParams.get('date'), '2030-11-20')
    assert.equal(url.searchParams.get('sample'), 'previous')
    assert.equal(url.searchParams.get('mode'), 'cheatsheets')
    await act(async () => { picker.value = 'odds-board'; picker.dispatchEvent(new dom.window.Event('change', { bubbles: true })) })
    const oddsUrl = new URL(navigations.at(-1)!, 'https://www.slipsurge.com')
    assert.equal(oddsUrl.searchParams.get('view'), 'odds-board')
    assert.equal(oddsUrl.searchParams.get('mode'), null)
    assert.equal(oddsUrl.searchParams.get('game'), 'fixture')
    assert.equal(oddsUrl.searchParams.get('sample'), 'previous')
    await click(host.querySelector('nav[aria-label="NFL boards"] button:last-child')!)
    assert.equal(new URL(navigations.at(-1)!, 'https://www.slipsurge.com').searchParams.get('view'), 'odds-board')
  })
})
