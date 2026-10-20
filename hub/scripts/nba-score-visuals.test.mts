import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import { act, createElement, type ComponentType } from 'react'

const require = createRequire(import.meta.url)
const { JSDOM } = require('jsdom')
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://www.slipsurge.com' })
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })
const { createRoot } = await import('react-dom/client')
const stubs: Record<string, string> = {
  '@/lib/nbaRefresh': 'export const watchNbaRefresh=()=>()=>{}',
  'next/image': 'import React from "react";export default function Image(props){return <img {...props}/>}',
  '@/components/BookLogo': 'export const BookLogo=()=>null',
  './PaintPickActions': 'export const PaintPickActions=()=>null',
  './PaintEntitySelect': 'export const PaintBookSelect=()=>null',
  '@/components/sports/PlayerAvatar': 'export const PlayerAvatar=()=>null',
}
const bundle = await build({ stdin: { contents: 'export {PaintMarketSupport} from "./src/app/the-paint/PaintMarketSupport"; export {PaintScoreCell} from "./src/app/the-paint/PaintResearchCells"; export {PaintIntelligence} from "./src/app/the-paint/PaintIntelligence"; export {PaintSlate} from "./src/app/the-paint/PaintSlate"', resolveDir: resolve('.'), loader: 'tsx' }, bundle: true, write: false, outfile: 'score-visuals.cjs', platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react-dom'], tsconfig: 'tsconfig.json', loader: { '.css': 'empty' }, plugins: [{ name: 'score-fixture', setup(builder) {
  builder.onResolve({ filter: /.*/ }, args => args.path in stubs ? { path: args.path, namespace: 'stub' } : undefined)
  builder.onLoad({ filter: /.*/, namespace: 'stub' }, args => ({ contents: stubs[args.path], loader: 'tsx', resolveDir: resolve('.') }))
} }] })
const fixtureModule = { exports: {} as Record<string, ComponentType<Record<string, unknown>>> }
new Function('require', 'module', 'exports', bundle.outputFiles.find(file => file.path.endsWith('.cjs'))!.text)(require, fixtureModule, fixtureModule.exports)
const team = (id: number, full_name: string) => ({ id, full_name, abbreviation: id === 1 ? 'BOS' : 'DET', name: full_name, city: 'City' })
const teams = [team(1, 'Alpha Defense'), team(2, 'Beta Defense'), team(3, 'Gamma Defense')]
const players = [1, 2, 3].map((id, index) => ({ id, first_name: ['Alex', 'Ben', 'Cal'][index], last_name: 'Player', position: 'G', team: teams[0], props: [] }))
const board = { game: { id: 123, date: '2026-10-20', home_team: teams[0], visitor_team: teams[1] }, players, teams, sampleSeason: 2025, fetchedAt: '2026-10-20T12:00:00Z' }
const support = { status: 'none', signal: null }
const profiles = [1, 2, 3].flatMap((id, index) => ['G', 'F'].map(position => ({ teamId: id, position, market: 'points', games: 20, minutes: 100, per48: [15, 20, 25][index], leaguePer48: 20, allowance: [-.25, 0, .25][index] })))
const context = { teams, profiles, season: 2025, ready: true, stale: false, games: 20, fetchedAt: board.fetchedAt, scores: players.map((player, index) => ({ playerId: player.id, score: [71, null, 48][index], offer: null, mm: null, minutes: [35, null, 27][index], production: [25, null, 17][index], newTeam: false, marketSignals: support })) }
const noop = () => {}
const props = { board, market: 'points', book: 'all', side: 'over', mode: 'score', open: noop, onMarketChange: noop, onBookChange: noop, onSideChange: noop }
async function mount(name: string, initial: Record<string, unknown>, data: unknown = context) {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => Response.json(data)
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  const render = async (next = initial) => { await act(async () => root.render(createElement(fixtureModule.exports[name], next))) }
  const click = async (label: string) => {
    const button = [...host.querySelectorAll('button')].find(node => node.textContent?.trim() === label)
    assert.ok(button, `Missing ${label}`)
    await act(async () => button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
  }
  await render()
  return { host, render, click, close: async () => { await act(async () => root.unmount()); host.remove(); globalThis.fetch = originalFetch } }
}

test('market signal cells explain loading, missing quotes, no match and unavailable sides instead of blank dashes', async () => {
  const ui = await mount('PaintMarketSupport', {})
  try {
    assert.match(ui.host.textContent ?? '', /Loading/)
    for (const [status,reason,text] of [
      ['none','','No opposing moves'], ['unavailable','','Awaiting data'],
      ['unavailable','No market quote available','No market'], ['under_unsupported','','Over-side only'],
      ['quote_changed','','Updating'], ['stale','','Updating'],
    ]) {
      await ui.render({ support: { status, reason, signal: null } })
      assert.equal(ui.host.textContent, text)
      assert.ok(ui.host.querySelector('[title]')?.getAttribute('title'))
    }
  } finally { await ui.close() }
})

test('a discovered signal labels its own line and opens its exact book and quote', async () => {
  const target = {market:'points',type:'milestone',line:30,side:'over',open:150,now:180,changePp:-4,openedAt:'2026-10-20T10:00:00Z'}
  const related = {...target,market:'assists',line:5,open:140,now:110,changePp:5}
  let opened: unknown[] = []
  const ui = await mount('PaintMarketSupport', { support: { status:'confirmed',signal:{playerId:1,book:'fanduel',target,related,targetPicks:20,relatedPicks:80}},onOpen:(...args:unknown[])=>{opened=args} })
  try {
    assert.match(ui.host.textContent ?? '', /Points · 30\+/)
    const toggle=ui.host.querySelector('button[aria-expanded]')!
    await act(async()=>toggle.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true})))
    assert.equal(toggle.getAttribute('aria-expanded'),'true')
    const quote=[...ui.host.querySelectorAll('button')].find(button=>button.textContent?.includes('Lengthening'))!
    assert.ok(quote)
    await act(async()=>quote.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true})))
    assert.deepEqual(opened,['points','fanduel',target])
    assert.doesNotMatch(ui.host.textContent ?? '', /pikkit|adjustment|attenuation/i)
  } finally { await ui.close() }
})

test('NBA score uses the canonical bolt dial and never converts missing or invalid scores into zero', async () => {
  const ui = await mount('PaintScoreCell', { score: 71 })
  try {
    const ring = ui.host.querySelector('[data-size="small"]')!
    assert.equal(ring.getAttribute('data-tone'), 'elite')
    assert.equal(ring.getAttribute('aria-label'), 'SlipSurge Score 71')
    assert.equal(ring.querySelector('strong')?.textContent, '71')
    assert.equal(ring.querySelector('img')?.getAttribute('src'), '/logo.png')
    for (const score of [null, undefined, NaN, Infinity]) {
      await ui.render({ score })
      const missing = ui.host.querySelector('[aria-label="SlipSurge Score unavailable"]')!
      assert.ok(missing)
      assert.equal(missing.querySelector('strong')?.textContent, '—')
      assert.equal(ui.host.querySelector('[data-tone]'), null)
    }
    await ui.render({ score: 0 })
    assert.equal(ui.host.querySelector('[data-tone]')?.getAttribute('data-tone'), 'cold')
    assert.equal(ui.host.querySelector('strong')?.textContent, '0')
  } finally { await ui.close() }
})

test('Score sorting keeps unknown values last in both directions with canonical dials on each known row', async () => {
  const ui = await mount('PaintIntelligence', props)
  const names = () => [...ui.host.querySelectorAll('tbody tr')].map(row => row.querySelector('strong')?.textContent)
  try {
    assert.deepEqual(names(), ['Alex Player', 'Cal Player', 'Ben Player'])
    assert.equal(ui.host.querySelectorAll('[data-size="small"]').length, 2)
    assert.equal(ui.host.querySelectorAll('[aria-label="SlipSurge Score unavailable"]').length, 1)
    await ui.click('Score')
    assert.deepEqual(names(), ['Cal Player', 'Alex Player', 'Ben Player'])
    assert.equal(ui.host.querySelector('[aria-sort="ascending"]')?.textContent?.trim(), 'Score')
  } finally { await ui.close() }
})

test('league DvP heat remains position-comparable and stable after sorting or filtering', async () => {
  const ui = await mount('PaintIntelligence', { ...props, mode: 'dvp' })
  try {
    const alpha = () => [...ui.host.querySelectorAll('tbody tr')].find(row => row.textContent?.includes('Alpha Defense'))!
    assert.equal(alpha().querySelector('[aria-label="Allowance versus league"]')?.getAttribute('data-heat-value'), '0.00')
    assert.equal(alpha().querySelector('[aria-label="Allowed per 48 position-minutes"]')?.getAttribute('data-heat-value'), '0.00')
    await ui.click('Allowance')
    const position = ui.host.querySelector('select[aria-label="Research position"]') as HTMLSelectElement
    await act(async () => { position.value = 'F'; position.dispatchEvent(new dom.window.Event('change', { bubbles: true })) })
    assert.equal(ui.host.querySelectorAll('tbody tr').length, 3)
    assert.equal(alpha().querySelector('[aria-label="Allowance versus league"]')?.getAttribute('data-heat-value'), '0.00')
    assert.equal(ui.host.querySelector('[aria-sort="ascending"]')?.textContent?.trim(), 'Allowance')
    const search = ui.host.querySelector('input[aria-label="Search NBA players or defenses"]') as HTMLInputElement
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(search, 'Alpha')
      search.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    })
    assert.equal(ui.host.querySelectorAll('tbody tr').length, 1)
    assert.equal(alpha().querySelector('[aria-label="Allowance versus league"]')?.getAttribute('data-heat-value'), '0.00')
  } finally { await ui.close() }
})

test('under matchup heat reverses favorability while retaining the actual signed allowance', async () => {
  const changed = { ...context, profiles: profiles.map(row => row.teamId === 2 ? { ...row, allowance: .1 } : row) }
  const ui = await mount('PaintIntelligence', props, changed)
  try {
    let cell = ui.host.querySelector('[aria-label="Over matchup allowance"]')!
    assert.equal(cell.textContent, '+10.0%'); assert.equal(cell.getAttribute('data-heat-value'), '70.00')
    await ui.render({ ...props, side: 'under' })
    cell = ui.host.querySelector('[aria-label="Under matchup allowance"]')!
    assert.equal(cell.textContent, '+10.0%'); assert.equal(cell.getAttribute('data-heat-value'), '30.00')
  } finally { await ui.close() }
})

test('Slate reuses the same dial and keeps positive form gaps above neutral even when all gaps are positive', async () => {
  const offer = { id: 'offer', player_id: 1, vendor: 'fanduel', prop_type: 'points', line_value: '24.5', market: { type: 'over_under', over_odds: 115, under_odds: -135 } }
  const rows = players.slice(0, 2).map((player, index) => ({ player, game: board.game, market: 'points', offer, score: [71, null][index], mm: 1, gap: index + 1, average: 25.5, estimate: 26, hit: { rate: 60, wins: 6, games: 10, pushes: 0 }, marketSignals: support }))
  const ui = await mount('PaintSlate', { date: board.game.date, market: 'points', book: 'all', side: 'over', books: [], onMarketChange: noop, onBookChange: noop, onSideChange: noop }, { rows, games: 1, loaded: 1, complete: true, stale: false, fetchedAt: board.fetchedAt })
  try {
    assert.equal(ui.host.querySelector('[data-size="small"] strong')?.textContent, '71')
    assert.equal(ui.host.querySelectorAll('[aria-label="SlipSurge Score unavailable"]').length, 1)
    assert.deepEqual([...ui.host.querySelectorAll('[aria-label="Form versus line"]')].map(cell => cell.getAttribute('data-heat-value')), ['75.00', '100.00'])
    assert.ok(ui.host.textContent?.includes('Slate MM'))
  } finally { await ui.close() }
})
