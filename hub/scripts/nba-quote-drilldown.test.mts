import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import { act, createElement, type ComponentType } from 'react'
import type { PaintBoard, PaintProp, PaintStat } from '../src/lib/nbaPaint.ts'

const require = createRequire(import.meta.url)
const { JSDOM } = require('jsdom')
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://www.slipsurge.com/the-paint' })
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, HTMLInputElement: dom.window.HTMLInputElement, IS_REACT_ACT_ENVIRONMENT: true })
dom.window.HTMLElement.prototype.scrollIntoView = () => {}
const { createRoot } = await import('react-dom/client')
const state = { search: '', error: false, offer: null as PaintProp | null }
;(globalThis as typeof globalThis & { nbaQuoteFixture: typeof state }).nbaQuoteFixture = state
const stubs: Record<string, string> = {
  'next/navigation': `export const useSearchParams=()=>new URLSearchParams(globalThis.nbaQuoteFixture.search);export const useRouter=()=>({push(){}})`,
  'next/link': `import React from 'react';export default function Link({children,...props}){return <a {...props}>{children}</a>}`,
  '@/components/ui/ModalSurface': `import React from 'react';export const ModalSurface=({open,label,children})=>open?<div role="dialog" aria-label={label}>{children}</div>:null`,
  '@/context/WatchlistContext': `export const useWatchlist=()=>({items:[]})`,
  '@/lib/nbaRefresh': `export const watchNbaRefresh=()=>()=>{}`,
  './PaintPickActions': `import React from 'react';export const PaintPickActions=({offer,side})=><button data-testid="pick" data-book={offer.vendor} data-side={side} data-type={offer.market.type} data-line={offer.line_value}>Save</button>`,
  './PaintVisuals': `import React from 'react';export const CourtMark=()=>null;export const PlayerAvatar=()=>null;export const TeamLogo=()=>null;export const TrendBars=()=>null;export const ShotCourt=()=>null;export const number=(n)=>n==null?'—':n.toFixed(1);export const marketNumber=number`,
  './PaintMatchup': `export const PaintMatchup=()=>null;export const PaintMatrix=()=>null`,
  './PaintMovement': `export const PaintMovement=()=>null`,
  './PaintPublic': `export const PaintPublic=()=>null`,
  './PaintDivergence': `export const PaintDivergence=()=>null`,
  './PaintSlate': `export const PaintSlate=()=>null`,
  './PaintTracking': `export const PaintTracking=()=>null`,
  './PaintEstimate': `export const PaintEstimate=()=>null`,
  './PaintShotChart': `export const PaintShotChart=()=>null`,
  './PaintMarketSupport': `export const PaintMarketSupport=()=>null`,
  './PaintResearchTools': `export const PAINT_TOOLS=[{key:'research',label:'The Court',icon:()=>null},{key:'score',label:'SlipSurge Score',icon:()=>null}];export const PaintCheatsheets=()=>null;export const PaintUsage=()=>null;export const PaintAvailability=()=>null;export const PaintGameMarkets=()=>null;export const PaintMatchupLab=()=>null`,
}
const bundled = await build({ stdin: { contents: `export {PaintBoardClient} from './src/app/the-paint/PaintBoardClient'`, resolveDir: resolve('.'), loader: 'tsx' }, bundle: true, write: false, outfile: 'quote.cjs', platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react-dom'], tsconfig: 'tsconfig.json', loader: { '.css': 'empty' }, plugins: [{ name: 'quote-fixture', setup(builder) {
  builder.onResolve({ filter: /.*/ }, args => args.path in stubs ? { path: args.path, namespace: 'stub' } : undefined)
  builder.onLoad({ filter: /.*/, namespace: 'stub' }, args => ({ contents: stubs[args.path], loader: 'tsx', resolveDir: resolve('.') }))
} }] })
const compiled = { exports: {} as { PaintBoardClient: ComponentType<{ initial: PaintBoard; games: PaintBoard['game'][]; days: string[]; date: string }> } }
new Function('require', 'module', 'exports', bundled.outputFiles.find(file => file.path.endsWith('.cjs'))!.text)(require, compiled, compiled.exports)
const team = { id: 2, abbreviation: 'BOS', name: 'Celtics', full_name: 'Boston Celtics' }
const main: PaintProp = { id: 1, game_id: 123, player_id: 434, vendor: 'fanduel', prop_type: 'points', line_value: '20', market: { type: 'over_under', over_odds: -110, under_odds: -110 }, updated_at: '2026-10-19T14:00:00Z' }
const alt: PaintProp = { ...main, id: 2, vendor: 'draftkings', line_value: '24.5', market: { type: 'over_under', over_odds: 210, under_odds: -280 } }
const milestone: PaintProp = { ...main, id: 3, vendor: 'caesars', line_value: '30', market: { type: 'milestone', odds: 500 } }
const quarterMilestone: PaintProp = { ...milestone, id: 4, prop_type: 'points_1q', line_value: '5' }
const sameBookMilestone: PaintProp = { ...milestone, id: 5, vendor: main.vendor, line_value: main.line_value }
const tiedMilestone: PaintProp = { ...sameBookMilestone, id: 6, vendor: 'draftkings' }
const board: PaintBoard = {
  game: { id: 123, date: '2026-10-20', season: 2026, status: 'Scheduled', status_state: 'scheduled', datetime: '2026-10-20T23:00:00Z', period: 0, home_team: team, visitor_team: { ...team, id: 9, name: 'Pistons', full_name: 'Detroit Pistons' }, home_team_score: 0, visitor_team_score: 0 },
  sampleSeason: 2025, historical: false, sampleEnd: '2026-04-13', statsComplete: true, fetchedAt: '2026-10-19T14:00:00Z', issues: [],
  players: [{ id: 434, first_name: 'Test', last_name: 'Player', position: 'G', team, headshot: null, injury: null, average: { pts: 22, min: 30 }, props: [main, alt, milestone, quarterMilestone, sameBookMilestone, tiedMilestone], logs: [21, 22, 23, 24, 20].map((pts, i) => ({ id: i + 10, pts, reb: 5, ast: 4, fg3m: 2, stl: 1, blk: 0, turnover: 1, fga: 14, fgm: 8, fg3a: 6, fta: 5, ftm: 3, min: '30:00', player: { id: 434 }, team, game: { id: i + 10, date: `2026-04-${String(i + 1).padStart(2, '0')}`, status: 'Final', season: 2025, home_team_id: 2, visitor_team_id: 9 } } satisfies PaintStat)) }],
}
const originalFetch = globalThis.fetch
async function harness(view: string, side = 'over', offer: PaintProp | null = null, error = false, market = 'points', extraParams = '') {
  state.search = `contract=${market.endsWith('_1q')||extraParams.includes('contract=milestone')?'milestone':'over_under'}&view=${view}&market=${market}&book=all&side=${side}${extraParams}`; state.offer = offer; state.error = error
  window.history.replaceState(null, '', '/the-paint?' + state.search)
  globalThis.fetch = async input => {
    assert.ok(String(input).startsWith('/the-paint/intelligence?'), String(input))
    return state.error ? Response.json({}, { status: 503 }) : Response.json({ season: 2025, ready: true, profiles: [], games: 20, fetchedAt: board.fetchedAt, stale: false, scores: [{ playerId: 434, score: 70, mm: 1, offer: state.offer, minutes: 30, production: 22, newTeam: false, marketSupport: { status: 'unavailable', signal: null } }] })
  }
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  await act(async () => root.render(createElement(compiled.exports.PaintBoardClient, { initial: board, games: [board.game], days: [board.game.date], date: board.game.date })))
  const click = async (element: Element | null | undefined) => { assert.ok(element); await act(async () => element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))) }
  const byLabel = (label: string) => [...host.querySelectorAll('button')].find(button => button.getAttribute('aria-label') === label)
  const close = async () => { await act(async () => root.unmount()); host.remove(); globalThis.fetch = originalFetch }
  return { host, click, byLabel, close }
}
function assertSelected(host: Element, quote: PaintProp, side: string) {
  const dialog = host.querySelector('[role="dialog"]')!
  assert.ok(dialog)
  assert.equal(dialog.querySelector('[data-paint-entity-select="book"]')?.getAttribute('data-value'), quote.vendor)
  const pick = [...dialog.querySelectorAll('[data-testid="pick"]')].find(element => element.getAttribute('data-book') === quote.vendor && element.getAttribute('data-type') === quote.market.type && element.getAttribute('data-line') === quote.line_value)!
  assert.ok(pick)
  assert.equal(pick.getAttribute('data-book'), quote.vendor); assert.equal(pick.getAttribute('data-type'), quote.market.type)
  assert.equal(pick.getAttribute('data-line'), quote.line_value); assert.equal(pick.getAttribute('data-side'), side)
  assert.equal(new URL(window.location.href).searchParams.get('line'), quote.line_value)
  assert.equal(new URL(window.location.href).searchParams.get('side'), side)
}

test('sportsbook quote drilldown keeps exact main, alt, milestone and Under contracts across different books', async () => {
  for (const [quote, side, target] of [[main, 'over', 'O 20'], [alt, 'over', 'O 24.5'], [alt, 'under', 'U 24.5'], [quarterMilestone, 'over', '5+']] as const) {
    const ui = await harness('odds', side, null, false, quote.prop_type, quote.market.type==='milestone'?'&contract=milestone':'')
    try {
      const button = ui.byLabel(`Analyze Test Player, ${target}, ${quote.vendor}`)
      assert.ok(button, `${quote.vendor} ${side} ${target}: ${[...ui.host.querySelectorAll('button[aria-label]')].map(button => button.getAttribute('aria-label')).join('; ')}`)
      await ui.click(button)
      assertSelected(ui.host, quote, side)
      assert.equal(ui.host.querySelector('[role="dialog"] footer'), null)
      const active = [...ui.host.querySelectorAll('[role="dialog"] button[aria-pressed="true"]')].map(button => button.textContent)
      assert.ok(active.includes(quote.market.type === 'milestone' ? 'Milestones' : 'Alt O/U'))
    } finally { await ui.close() }
  }
})

test('sportsbook headers keep real logos and accessible names without repeated team or vendor text', async () => {
  const ui = await harness('odds')
  try {
    const header = ui.host.querySelector('button[aria-label="Sort FanDuel odds"]')!
    assert.ok(header)
    assert.equal(header.textContent, '')
    assert.equal(header.querySelector('img')?.getAttribute('src'), '/sportsbooks/fanduel.ico')
    assert.equal(ui.host.querySelector('tbody th button small'), null)
    await ui.click([...ui.host.querySelectorAll('tbody th button')].find(button => button.textContent?.includes('Test Player')))
    const dialog = ui.host.querySelector('[role="dialog"]')!
    const ladderHeader = dialog.querySelector('th[aria-label="FanDuel"]')!
    assert.ok(ladderHeader)
    assert.equal(ladderHeader.textContent, '')
    assert.equal(ladderHeader.querySelector('img')?.getAttribute('src'), '/sportsbooks/fanduel.ico')
    assert.ok(dialog.querySelectorAll('[data-testid="pick"]').length > 0)
  } finally { await ui.close() }
})

test('milestone targets filter the board and preserve exact N+ pick contracts and URL state', async () => {
  const ui=await harness('research','over',null,false,'points','&contract=milestone&target=20')
  try {
    assert.ok(ui.byLabel('Analyze Test Player, 20+, fanduel'))
    assert.ok(!ui.byLabel('Analyze Test Player, O 20, fanduel'))
    assert.ok(ui.host.querySelector('[aria-label="NBA exact target"]'))
    const target=ui.host.querySelector('select[aria-label="NBA exact target"]') as HTMLSelectElement
    await act(async()=>{target.value='30';target.dispatchEvent(new dom.window.Event('change',{bubbles:true}))})
    assert.equal(new URL(window.location.href).searchParams.get('target'),'30')
    assert.ok(ui.byLabel('Analyze Test Player, 30+, caesars'))
    assert.ok(!ui.byLabel('Analyze Test Player, 20+, fanduel'))
    await ui.click(ui.byLabel('Analyze Test Player, 30+, caesars'))
    assertSelected(ui.host,milestone,'over')
  }finally{await ui.close()}
})

test('ordinary player opens retain the general all-book ladder without a stale selected threshold', async () => {
  const ui = await harness('odds')
  try {
    await ui.click([...ui.host.querySelectorAll('tbody th button')].find(button => button.textContent?.includes('Test Player')))
    const dialog = ui.host.querySelector('[role="dialog"]')!
    assert.equal(dialog.querySelector('[data-paint-entity-select="book"]')?.getAttribute('data-value'), 'all')
    assert.equal(new URL(window.location.href).searchParams.has('line'), false)
    assert.equal(dialog.querySelector('footer'), null)
    assert.ok([...dialog.querySelectorAll('[data-testid="pick"]')].every(pick => pick.getAttribute('data-type') === 'milestone'))
  } finally { await ui.close() }
})

test('switching ladder contract type clears the selected URL quote and keeps only exact rung save actions', async () => {
  const ui = await harness('odds')
  try {
    await ui.click(ui.byLabel('Analyze Test Player, O 20, fanduel'))
    for (const [label, type] of [['Milestones', 'milestone'], ['Alt O/U', 'over_under']] as const) {
      const dialog = ui.host.querySelector('[role="dialog"]')!
      await ui.click([...dialog.querySelectorAll('button')].find(button => button.textContent === label))
      assert.equal(new URL(window.location.href).searchParams.has('line'), false)
      assert.equal(new URL(window.location.href).searchParams.has('type'), false)
      assert.equal([...dialog.querySelectorAll('button')].find(button => button.textContent === label)?.getAttribute('aria-pressed'), 'true')
      assert.equal(dialog.querySelector('footer'), null)
      const picks = [...dialog.querySelectorAll('[data-testid="pick"]')]
      assert.equal(picks.length, 1)
      assert.equal(picks[0].getAttribute('data-book'), main.vendor)
      assert.equal(picks[0].getAttribute('data-line'), main.line_value)
      assert.equal(picks[0].getAttribute('data-type'), type)
      assert.equal(dialog.querySelector('[data-best="true"]'), null)
      assert.doesNotMatch(dialog.textContent ?? '', /Best price/)
    }
    const dialog = ui.host.querySelector('[role="dialog"]')!
    await ui.click([...dialog.querySelectorAll('button')].find(button => button.textContent === 'Overview'))
    assert.equal(dialog.querySelector('footer [data-testid="pick"]')?.getAttribute('data-type'), 'over_under')
  } finally { await ui.close() }
})

test('ladder best-price badges require competing books at the exact line and retain tied prices', async () => {
  const ui = await harness('odds')
  try {
    await ui.click([...ui.host.querySelectorAll('tbody th button')].find(button => button.textContent?.includes('Test Player')))
    const rows = [...ui.host.querySelectorAll('[role="dialog"] tbody tr')]
    const competing = rows.find(row => row.querySelector('th')?.textContent === '20+')!
    const unique = rows.find(row => row.querySelector('th')?.textContent === '30+')!
    assert.equal(competing.querySelectorAll('[data-best="true"]').length, 2)
    assert.equal((competing.textContent?.match(/Best price/g) ?? []).length, 2)
    assert.equal(unique.querySelectorAll('[data-best="true"]').length, 0)
    assert.doesNotMatch(unique.textContent ?? '', /Best price/)
  } finally { await ui.close() }
})

test('primary Line/Odds click preserves its exact reference and side while opening Overview', async () => {
  const ui = await harness('research', 'under', null, false, 'points', '&line=99&type=milestone&panel=movement&player=999')
  try {
    await ui.click(ui.byLabel('Analyze Test Player, U 20, fanduel'))
    assertSelected(ui.host, main, 'under')
    assert.equal(new URL(window.location.href).searchParams.get('panel'), 'trends')
    assert.ok([...ui.host.querySelectorAll('[role="dialog"] button[aria-pressed="true"]')].some(button => button.textContent === 'Overview'))
  } finally { await ui.close() }
})

test('ordinary desktop and mobile player opens clear an orphaned URL quote instead of selecting an unrelated threshold', async () => {
  for (const [label, index] of [['Analyze Test Player, Boston Celtics', 0], ['Analyze Test Player, Boston Celtics', -1], ['Open Test Player details', 0], ['Open Test Player details', -1]] as const) {
    const ui = await harness('research', 'over', null, false, 'points', '&line=99&type=milestone&panel=movement&player=999')
    try {
      await ui.click([...ui.host.querySelectorAll('button')].filter(button => button.getAttribute('aria-label') === label).at(index))
      const dialog = ui.host.querySelector('[role="dialog"]')!
      assert.equal(dialog.querySelector('[data-paint-entity-select="book"]')?.getAttribute('data-value'), 'all')
      assert.equal(new URL(window.location.href).searchParams.has('line'), false)
      assert.equal(new URL(window.location.href).searchParams.get('panel'), 'trends')
      assert.equal(dialog.querySelector('footer [data-testid="pick"]')?.getAttribute('data-line'), main.line_value)
    } finally { await ui.close() }
  }
})

test('Score quote drilldown follows its server-selected offer and preserves Under rather than a different board reference', async () => {
  const ui = await harness('score', 'under', alt)
  try {
    await ui.click(ui.byLabel('Analyze Test Player, U 24.5, draftkings'))
    assertSelected(ui.host, alt, 'under')
  } finally { await ui.close() }
})

test('Score initial failure stops the loading label and leaves a keyboard-accessible retryable region', async () => {
  const ui = await harness('score', 'over', null, true)
  try {
    assert.match(ui.host.textContent ?? '', /Matchup context could not refresh/)
    assert.doesNotMatch(ui.host.textContent ?? '', /Loading matchup context/)
    assert.ok([...ui.host.querySelectorAll('button')].some(button => button.textContent === 'Retry'))
    assert.equal(ui.host.querySelector('[role="region"][aria-label="NBA player scores and market signals"]')?.getAttribute('tabindex'), '0')
  } finally { await ui.close() }
})

test('board and player hit labels use the same push-excluded denominator as their percentage', async () => {
  const ui = await harness('research')
  try {
    const heat = ui.host.querySelector('[aria-label="4/4 hits · 1 pushes"]')!
    assert.ok(heat); assert.match(heat.textContent ?? '', /100%4\/4 · 1P/)
    await ui.click(ui.byLabel('Analyze Test Player, Boston Celtics'))
    const text = ui.host.querySelector('[role="dialog"]')?.textContent ?? ''
    assert.match(text, /100%4\/4 · 1 pushes/)
  } finally { await ui.close() }
})
