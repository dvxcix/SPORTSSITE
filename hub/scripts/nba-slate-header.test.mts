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
const bundle = await build({ entryPoints: ['src/app/the-paint/PaintSlateHeader.tsx'], bundle: true, write: false, outfile: 'slate-header.cjs', platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react-dom'], tsconfig: 'tsconfig.json', loader: { '.css': 'empty' }, plugins: [{ name: 'logos', setup(builder) {
  builder.onResolve({ filter: /^\.\/PaintVisuals$/ }, () => ({ path: 'visuals', namespace: 'fixture' }))
  builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const TeamLogo=({abbr})=><img alt="" data-team={abbr}/>', loader: 'tsx', resolveDir: resolve('.') }))
} }] })
const fixture = { exports: {} as { PaintSlateHeader:ComponentType<{date:string;days:string[];games:unknown[];gameId?:number;onChange:(date:string,gameId?:number)=>void}>; paintSlateDay:(date:string,direction:number)=>string } }
new Function('require', 'module', 'exports', bundle.outputFiles.find(file => file.path.endsWith('.cjs'))!.text)(require, fixture, fixture.exports)
const { PaintSlateHeader, paintSlateDay } = fixture.exports
globalThis.fetch = async () => { throw new Error('No implicit network calls in slate tests') }

test('slate day navigation crosses calendar and daylight-saving boundaries without drifting', () => {
  assert.equal(paintSlateDay('2026-11-01', 1), '2026-11-02')
  assert.equal(paintSlateDay('2026-03-08', -1), '2026-03-07')
  assert.equal(paintSlateDay('2028-03-01', -1), '2028-02-29')
  assert.equal(paintSlateDay('2026-12-31', 1), '2027-01-01')
})

test('logo matchup and date controls preserve exact game identity and expose readable state', async () => {
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host), changes: unknown[][] = []
  const games = [{ id: 77, date: '2026-10-20', datetime: '2026-10-20T23:30:00Z', status: '', status_state: 'scheduled', visitor_team: { abbreviation: 'BOS', full_name: 'Boston Celtics' }, home_team: { abbreviation: 'DET', full_name: 'Detroit Pistons' } }]
  const props = { date: '2026-10-20', days: ['2026-10-19', '2026-10-20'], games, gameId: 77, onChange: (...value: unknown[]) => changes.push(value) }
  try {
    await act(async () => root.render(createElement(PaintSlateHeader, props)))
    const game = host.querySelector('[aria-label="NBA matchups"] button') as HTMLButtonElement
    assert.equal(game.getAttribute('aria-pressed'), 'true')
    assert.match(game.getAttribute('aria-label')!, /Boston Celtics at Detroit Pistons, 7:30 PM Eastern/)
    assert.equal(game.querySelectorAll('img').length, 2)
    assert.equal(game.textContent?.includes('Boston'), false)
    await act(async () => game.click())
    assert.deepEqual(changes.pop(), ['2026-10-20', 77])
    await act(async () => (host.querySelector('[aria-label="Next day"]') as HTMLButtonElement).click())
    assert.deepEqual(changes.pop(), ['2026-10-21'])
    await act(async () => root.render(createElement(PaintSlateHeader, { ...props, days: [], games: [] })))
    assert.equal(host.querySelector('[aria-label="NBA matchups"]'), null)
    assert.equal(host.querySelector('[aria-label="NBA slate dates"] button[aria-pressed="true"]')?.getAttribute('aria-label'), 'Tuesday, October 20, 2026')
    const earlier=host.querySelector<HTMLButtonElement>('[aria-label="Monday, October 19, 2026"]')!
    assert.ok(earlier,'the date rail includes previous dates even on an empty slate')
    await act(async()=>earlier.click());assert.deepEqual(changes.pop(),['2026-10-19'])
  } finally { await act(async () => root.unmount()); host.remove() }
})

test('a no-game previous day does not block reaching the prior saved slate',async()=>{
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host),changes:string[]=[]
  const props={date:'2026-11-04',days:['2026-11-04'],games:[],onChange:(date:string)=>changes.push(date)}
  try{
    await act(async()=>root.render(createElement(PaintSlateHeader,props)))
    await act(async()=>(host.querySelector('[aria-label="Previous day"]') as HTMLButtonElement).click())
    assert.equal(changes.pop(),'2026-11-03')
    await act(async()=>root.render(createElement(PaintSlateHeader,{...props,date:'2026-11-03'})))
    assert.ok(host.querySelector('[aria-label="Monday, November 2, 2026"]'))
    await act(async()=>(host.querySelector('[aria-label="Previous day"]') as HTMLButtonElement).click())
    assert.equal(changes.pop(),'2026-11-02')
  }finally{await act(async()=>root.unmount());host.remove()}
})

test('all matchup scores refresh independently, retain the last view on failure, and stop polling after final', async () => {
  const originalNow = Date.now, originalFetch = globalThis.fetch
  let now = 0, calls = 0, fail = false, final = false
  Date.now = () => now
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  const game = { id: 91, date: '2030-11-20', datetime: '2030-11-21T00:00:00Z', status_state: 'in_progress', period: 1, visitor_team_score: 0, home_team_score: 0, visitor_team: { full_name: 'Away', abbreviation: 'ATL' }, home_team: { full_name: 'Home', abbreviation: 'BOS' } }
  globalThis.fetch = async (url) => {
    assert.equal(url, '/the-paint/schedule?date=2030-11-20&mode=pregame'); calls++
    if (fail) return Response.json({}, { status: 503 })
    return Response.json({ date: game.date, games: [{ ...game, status_state: final ? 'final' : 'in_progress', status: final ? 'Final' : 'Live', visitor_team_score: calls * 10, home_team_score: calls * 8 }] })
  }
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host)
  try {
    await act(async () => root.render(createElement(PaintSlateHeader, { date: game.date, days: [game.date], games: [game], onChange: () => {} })))
    const score = () => host.querySelector('[aria-label="NBA matchups"] button')!.getAttribute('aria-label')!
    assert.match(score(), /10 to 8/)
    now = 31_000; await act(async () => window.dispatchEvent(new dom.window.Event('focus')))
    assert.match(score(), /20 to 16/)
    fail = true; now = 62_000; await act(async () => window.dispatchEvent(new dom.window.Event('focus')))
    assert.match(score(), /20 to 16/, 'A failed score read preserves the prior values')
    assert.ok(host.querySelector('[aria-label="Game status refresh delayed. Retry"]'))
    fail = false; final = true; now = 93_000; await act(async () => window.dispatchEvent(new dom.window.Event('focus')))
    assert.match(score(), /Final, 40 to 32/)
    assert.equal(host.querySelector('[aria-label="Game status refresh delayed. Retry"]'), null)
    now = 124_000; await act(async () => window.dispatchEvent(new dom.window.Event('focus')))
    assert.equal(calls, 4, 'A complete final slate stops mutable polling')
  } finally { await act(async () => root.unmount()); host.remove(); Date.now = originalNow; globalThis.fetch = originalFetch }
})
