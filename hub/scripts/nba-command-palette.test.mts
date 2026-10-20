import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import { act, createElement, type ComponentType } from 'react'

const require = createRequire(import.meta.url)
const { JSDOM } = require('jsdom')
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://www.slipsurge.com' })
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, HTMLInputElement: dom.window.HTMLInputElement, IS_REACT_ACT_ENVIRONMENT: true })
const { createRoot } = await import('react-dom/client')
const state = { role: 'user', tier: 'free', pathname: '/feed', pushed: [] as string[] }
const scrolled: string[] = []
dom.window.HTMLElement.prototype.scrollIntoView = function () { scrolled.push(this.id) }
;(globalThis as typeof globalThis & { nbaCommandFixture: typeof state }).nbaCommandFixture = state
const stubs: Record<string, string> = {
  'next/navigation': `export const useRouter=()=>({push(href){globalThis.nbaCommandFixture.pushed.push(href)}});export const usePathname=()=>globalThis.nbaCommandFixture.pathname`,
  '@/context/AuthContext': `export const useAuth=()=>({profile:{account_type:globalThis.nbaCommandFixture.role,tier:globalThis.nbaCommandFixture.tier}})`,
  '@/lib/useNflAccess': `export const useNflAccess=()=>({allowed:true})`,
  '@/components/ui/Modal': `import React from 'react';export const Modal=({children})=><div role="dialog">{children}</div>`,
}
const bundled = await build({ stdin: { contents: `export {GlobalCommandPalette} from './src/components/layout/GlobalCommandPalette'`, resolveDir: resolve('.'), loader: 'tsx' }, bundle: true, write: false, outfile: 'command.cjs', platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react-dom'], tsconfig: 'tsconfig.json', loader: { '.css': 'empty' }, plugins: [{ name: 'command-fixture', setup(builder) { builder.onResolve({ filter: /^(next\/|@\/)/ }, args => args.path in stubs ? { path: args.path, namespace: 'stub' } : undefined); builder.onLoad({ filter: /.*/, namespace: 'stub' }, args => ({ contents: stubs[args.path], loader: 'tsx', resolveDir: resolve('.') })) } }] })
const compiled = { exports: {} as { GlobalCommandPalette: ComponentType } }
new Function('require', 'module', 'exports', bundled.outputFiles.find(file => file.path.endsWith('.cjs'))!.text)(require, compiled, compiled.exports)

const nbaResult = (name = 'Jayson Tatum') => ({ players: [{ id: 434, name, position: 'F', teamId: 2, teamName: 'Boston Celtics', headshot: 'https://example.test/tatum.png', teamLogo: 'https://example.test/boston.png' }], teams: [{ id: 2, name: 'Boston Celtics', abbr: 'BOS', logo: 'https://example.test/boston.png' }] })
const originalFetch = globalThis.fetch
async function harness(role: string, nba: (query: string) => Promise<unknown> = async () => nbaResult(), options: { pathname?: string; emptyOtherSports?: boolean; tier?: string } = {}) {
  state.role = role; state.tier = options.tier ?? 'free'; state.pathname = options.pathname ?? '/feed'; state.pushed = []
  const requests: { path: string; signal: AbortSignal | null | undefined }[] = []
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input), 'https://www.slipsurge.com')
    requests.push({ path: url.pathname, signal: init?.signal })
    if (url.pathname === '/api/search/nba') return Response.json(await nba(url.searchParams.get('q') ?? ''))
    if (url.pathname === '/api/search/sports') return Response.json({ players: options.emptyOtherSports ? [] : [{ mlbId: 99, name: 'MLB Result', teamName: 'MLB team' }] })
    if (url.pathname === '/api/search/nfl') return Response.json({ players: options.emptyOtherSports ? [] : [{ gsis_id: 'nfl-id', display_name: 'NFL Result', latest_team: 'BAL' }] })
    throw new Error('Unexpected request ' + url)
  }
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  const render = async () => { await act(async () => root.render(createElement(compiled.exports.GlobalCommandPalette))) }
  await render()
  const open = async () => { await act(async () => window.dispatchEvent(new dom.window.Event('slipsurge:open-command'))) }
  const type = async (value: string) => {
    const input = host.querySelector('input')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(input, value)
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    })
  }
  const flush = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 210)) }) }
  const click = async (element: Element | null | undefined) => { assert.ok(element); await act(async () => element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))) }
  const close = async () => { await act(async () => root.unmount()); host.remove(); globalThis.fetch = originalFetch }
  const result = (name: string) => [...host.querySelectorAll('[role="option"]')].find(node => node.querySelector('strong')?.textContent === name)
  return { host, requests, render, open, type, flush, click, close, result }
}

test('lower-tier command search discovers NBA upgrades without requesting NBA identities', async () => {
  const ui = await harness('user')
  try {
    await ui.open()
    assert.ok(ui.result('Community Feed'))
    assert.ok(ui.result('The Court · NBA'))
    await ui.type('NBA')
    assert.equal(ui.host.querySelectorAll('[role="option"]').length,16)
    assert.ok([...ui.host.querySelectorAll('[role="option"]')].every(node=>node.textContent?.includes('Upgrade to Ultimate')))
    await ui.click(ui.result('NBA Ladders'))
    assert.deepEqual(state.pushed,['/pricing#plan-ultimate'])
    await ui.open()
    await ui.type('tatum'); await ui.flush()
    assert.equal(ui.requests.some(request => request.path === '/api/search/nba'), false)
    assert.ok(ui.result('MLB Result')); assert.ok(ui.result('NFL Result'))
    assert.equal(ui.result('Jayson Tatum'), undefined)
  } finally { await ui.close() }
})

test('Ultimate member command results open NBA tools and fetch NBA identities', async () => {
  const ui = await harness('user',async()=>nbaResult(),{tier:'ultimate'})
  try {
    await ui.open();await ui.type('NBA Ladders')
    const tool=ui.result('NBA Ladders')
    assert.ok(tool);assert.equal(tool.textContent?.includes('Upgrade'),false)
    await ui.click(tool);assert.deepEqual(state.pushed,['/the-paint?view=ladders'])
    await ui.open();await ui.type('tatum');await ui.flush()
    assert.equal(ui.requests.filter(request=>request.path==='/api/search/nba').length,1)
    await ui.click(ui.result('Jayson Tatum'))
    assert.deepEqual(state.pushed,['/the-paint?view=ladders','/nba/players/434'])
  } finally { await ui.close() }
})

test('admin command results display NBA imagery and navigate to player and team profiles', async () => {
  const ui = await harness('admin')
  try {
    await ui.open(); await ui.type('tatum'); await ui.flush()
    assert.equal(ui.requests.filter(request => request.path === '/api/search/nba').length, 1)
    assert.equal(ui.result('Jayson Tatum')?.querySelector('img')?.getAttribute('src'), 'https://example.test/tatum.png')
    assert.equal(ui.result('Boston Celtics')?.querySelector('img')?.getAttribute('src'), 'https://example.test/boston.png')
    await ui.click(ui.result('Jayson Tatum'))
    assert.deepEqual(state.pushed, ['/nba/players/434'])
    await ui.open(); await ui.type('boston'); await ui.flush(); await ui.click(ui.result('Boston Celtics'))
    assert.deepEqual(state.pushed, ['/nba/players/434', '/nba/teams/2'])
  } finally { await ui.close() }
})

test('late NBA responses cannot replace a newer query or remain visible after access changes', async () => {
  let resolveOld!: (value: unknown) => void
  const old = new Promise(resolve => { resolveOld = resolve })
  const ui = await harness('admin', async query => query === 'old' ? old : nbaResult('Latest player'))
  try {
    await ui.open(); await ui.type('old'); await ui.flush()
    const oldSignal = ui.requests.find(request => request.path === '/api/search/nba')!.signal!
    await ui.type('new'); assert.equal(oldSignal.aborted, true); await ui.flush()
    assert.ok(ui.result('Latest player'))
    await act(async () => { resolveOld(nbaResult('Stale player')); await old })
    assert.ok(ui.result('Latest player')); assert.equal(ui.result('Stale player'), undefined)
    state.role = 'user'; await ui.render()
    assert.equal(ui.result('Latest player'), undefined); assert.equal(ui.result('Boston Celtics'), undefined)
    const nbaCalls = ui.requests.filter(request => request.path === '/api/search/nba').length
    await ui.flush(); assert.equal(ui.requests.filter(request => request.path === '/api/search/nba').length, nbaCalls)
    await ui.click(ui.host.querySelector('[aria-label="Clear search"]'))
    assert.equal(ui.result('MLB Result'), undefined); assert.ok(ui.result('Community Feed'))
  } finally { await ui.close() }
})

test('keyboard search announces and scrolls the active result and opens the selected NBA player', async () => {
  const ui = await harness('admin')
  try {
    await ui.open(); await ui.type('tatum'); await ui.flush()
    const input = ui.host.querySelector('input')!
    assert.equal(input.getAttribute('role'), 'combobox')
    assert.equal(input.getAttribute('aria-controls'), ui.host.querySelector('[role="listbox"]')!.id)
    assert.equal(ui.host.querySelectorAll('[role="option"][tabindex="-1"]').length, 4)
    for (let i = 0; i < 2; i++) await act(async () => input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })))
    const player = ui.result('Jayson Tatum')!
    assert.equal(input.getAttribute('aria-activedescendant'), player.id)
    assert.equal(player.getAttribute('aria-selected'), 'true')
    assert.equal(scrolled.at(-1), player.id)
    await act(async () => input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    assert.deepEqual(state.pushed, ['/nba/players/434'])
  } finally { await ui.close() }
})

test('search remains pending through debounce and a delayed response, then shows a genuine empty result', async () => {
  let resolveSearch!: (value: unknown) => void
  const response = new Promise(resolve => { resolveSearch = resolve })
  const ui = await harness('admin', async () => response, { emptyOtherSports: true })
  try {
    await ui.open(); await ui.type('unmatched')
    assert.equal(ui.requests.length, 0)
    assert.equal(ui.host.querySelector('[role="listbox"]')?.getAttribute('aria-busy'), 'true')
    assert.equal(ui.host.querySelector('[role="status"] strong')?.textContent, 'Searching…')
    assert.equal(ui.host.textContent?.includes('No matching results'), false)
    await ui.flush()
    assert.equal(ui.requests.length, 3)
    assert.equal(ui.host.textContent?.includes('No matching results'), false)
    await act(async () => { resolveSearch({ players: [], teams: [] }); await response })
    assert.equal(ui.host.querySelector('[role="listbox"]')?.getAttribute('aria-busy'), 'false')
    assert.equal(ui.host.querySelector('[role="status"] strong')?.textContent, 'No matching results')
    await ui.type('u')
    assert.equal(ui.host.querySelector('[role="listbox"]')?.getAttribute('aria-busy'), 'false')
    assert.equal(ui.host.textContent?.includes('Searching'), false)
  } finally { await ui.close() }
})

test('NBA routes prioritize NBA players and teams while other routes retain the existing order', async () => {
  const ui = await harness('admin', async () => nbaResult(), { pathname: '/the-paint' })
  const labels = () => [...ui.host.querySelectorAll('[role="option"] strong')].map(node => node.textContent)
  try {
    await ui.open(); await ui.type('tatum'); await ui.flush()
    const nbaFirst = ['Jayson Tatum', 'Boston Celtics', 'MLB Result', 'NFL Result']
    assert.deepEqual(labels(), nbaFirst)
    for (const pathname of ['/nba/players/434', '/nba/teams/2']) {
      state.pathname = pathname; await ui.render()
      assert.deepEqual(labels(), nbaFirst)
    }
    state.pathname = '/the-sideline'; await ui.render()
    assert.deepEqual(labels(), ['MLB Result', 'NFL Result', 'Jayson Tatum', 'Boston Celtics'])
    assert.equal(ui.requests.length, 3, 'route prioritization reuses current results')
  } finally { await ui.close() }
})

test('being on an NBA route never grants member search access to NBA', async () => {
  const ui = await harness('user', async () => nbaResult(), { pathname: '/nba/players/434' })
  try {
    await ui.open(); await ui.type('tatum'); await ui.flush()
    assert.deepEqual([...ui.host.querySelectorAll('[role="option"] strong')].map(node => node.textContent), ['MLB Result', 'NFL Result'])
    assert.equal(ui.requests.some(request => request.path === '/api/search/nba'), false)
    assert.equal(ui.host.textContent?.includes('Jayson Tatum'), false)
  } finally { await ui.close() }
})
