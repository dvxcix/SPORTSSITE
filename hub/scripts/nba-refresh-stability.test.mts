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
Object.defineProperty(dom.window.document, 'visibilityState', { value: 'visible', configurable: true })
dom.window.HTMLElement.prototype.scrollIntoView = () => {}
// Next's native-history integration publishes query changes without remounting.
for (const method of ['pushState', 'replaceState'] as const) {
  const original = dom.window.history[method].bind(dom.window.history)
  dom.window.history[method] = (...args: Parameters<History[typeof method]>) => {
    original(...args)
    dom.window.dispatchEvent(new dom.window.Event('fixture:url'))
  }
}
const { createRoot } = await import('react-dom/client')
const state = { search: '', error: false, offer: null as PaintProp | null, navigations: [] as string[], requests: [] as string[] }
;(globalThis as typeof globalThis & { nbaQuoteFixture: typeof state }).nbaQuoteFixture = state
const stubs: Record<string, string> = {
  'next/navigation': `import {useSyncExternalStore} from 'react';const subscribe=callback=>{window.addEventListener('fixture:url',callback);window.addEventListener('popstate',callback);return()=>{window.removeEventListener('fixture:url',callback);window.removeEventListener('popstate',callback)}};const snapshot=()=>window.location.search;export const useSearchParams=()=>new URLSearchParams(useSyncExternalStore(subscribe,snapshot,snapshot));export const useRouter=()=>({push(href){globalThis.nbaQuoteFixture.navigations.push(href)}})`,
  'next/link': `import React from 'react';export default function Link({children,...props}){return <a {...props}>{children}</a>}`,
  '@/components/ui/ModalSurface': `import React from 'react';export const ModalSurface=({open,label,children})=>open?<div role="dialog" aria-label={label}>{children}</div>:null`,
  '@/context/WatchlistContext': `export const useWatchlist=()=>({items:[]})`,
  '@/components/nba/NbaMatrixButton': `export const NbaMatrixButton=()=>null`,
  '@/components/nba/NbaMatrixContext': `export const NbaMatrixProvider=({children})=>children;export const NbaMatrixResults=()=>null`,
  '@/lib/nbaRefresh': `export const watchNbaRefresh=refresh=>{window.addEventListener('fixture:board-poll',refresh);return()=>window.removeEventListener('fixture:board-poll',refresh)}`,
  './PaintPickActions': `import React from 'react';export const PaintPickActions=({offer,side})=><button data-testid="pick" data-book={offer.vendor} data-side={side} data-type={offer.market.type} data-line={offer.line_value}>Save</button>`,
  './PaintVisuals': `import React from 'react';export const CourtMark=()=>null;export const PlayerAvatar=()=>null;export const TeamLogo=()=>null;export const TrendBars=()=>null;export const ShotCourt=()=>null;export const number=(n)=>n==null?'—':n.toFixed(1);export const marketNumber=number`,
  './PaintMatchup': `export const PaintMatchup=()=>null;export const PaintMatrix=()=>null`,
  './PaintMovement': `export const PaintMovement=()=>null`,
  './PaintFirstBasket': `import React from 'react';export const PaintFirstBasket=()=><section aria-label="First Basket fixture">First Basket</section>`,
  './PaintPublic': `export const PaintPublic=()=>null`,
  './PaintDivergence': `export const PaintDivergence=()=>null`,
  './PaintSlate': `export const PaintSlate=()=>null`,
  './PaintTracking': `export const PaintTracking=()=>null`,
  './PaintEstimate': `export const PaintEstimate=()=>null`,
  './PaintShotChart': `export const PaintShotChart=()=>null`,
  './PaintMarketSupport': `export const PaintMarketSupport=()=>null`,
  './PaintResearchTools': `export const PAINT_TOOLS=[{key:'research',label:'The Court',icon:()=>null},{key:'score',label:'SlipSurge Score',icon:()=>null},{key:'first-basket',label:'First Basket',icon:()=>null}];export const PaintCheatsheets=()=>null;export const PaintUsage=()=>null;export const PaintAvailability=()=>null;export const PaintGameMarkets=()=>null;export const PaintMatchupLab=()=>null`,
}
const bundled = await build({ stdin: { contents: `export {PaintBoardClient} from './src/app/the-paint/PaintBoardClient'`, resolveDir: resolve('.'), loader: 'tsx' }, bundle: true, write: false, outfile: 'quote.cjs', platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react-dom'], tsconfig: 'tsconfig.json', loader: { '.css': 'empty' }, plugins: [{ name: 'quote-fixture', setup(builder) {
  builder.onResolve({ filter: /.*/ }, args => args.path in stubs ? { path: args.path, namespace: 'stub' } : undefined)
  builder.onLoad({ filter: /.*/, namespace: 'stub' }, args => ({ contents: stubs[args.path], loader: 'tsx', resolveDir: resolve('.') }))
} }] })
const compiled = { exports: {} as { PaintBoardClient: ComponentType<{ initial: PaintBoard; games: PaintBoard['game'][]; days: string[]; date: string; initialMode?: 'pregame'|'live' }> } }
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
async function harness(view: string, side = 'over', offer: PaintProp | null = null, error = false, market = 'points', extraParams = '', initial = board) {
  state.search = `contract=${market.endsWith('_1q')||extraParams.includes('contract=milestone')?'milestone':'over_under'}&view=${view}&market=${market}&book=all&side=${side}${extraParams}`; state.offer = offer; state.error = error; state.navigations = []; state.requests = []
  window.history.replaceState(null, '', '/the-paint?' + state.search)
  globalThis.fetch = async input => {
    state.requests.push(String(input))
    assert.ok(String(input).startsWith('/the-paint/intelligence?'), String(input))
    return state.error ? Response.json({}, { status: 503 }) : Response.json({ season: 2025, ready: true, profiles: [], games: 20, fetchedAt: board.fetchedAt, stale: false, scores: [{ playerId: 434, score: 70, mm: 1, offer: state.offer, minutes: 30, production: 22, newTeam: false, marketSignals: { status: 'unavailable', signal: null } }] })
  }
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  const render=(next:PaintBoard)=>{
    const initialMode=new URLSearchParams(state.search).get('mode')==='live'?'live':'pregame'
    root.render(createElement(compiled.exports.PaintBoardClient, { key:`${next.game.id}:${initialMode}`,initial:next,games:[next.game],days:[next.game.date],date:next.game.date,initialMode }))
  }
  await act(async () => render(initial))
  const commitNavigation=async(next:PaintBoard)=>{
    const href=state.navigations.at(-1);assert.ok(href)
    await act(async()=>{
      window.history.pushState(null,'',href)
      state.search=new URL(href,window.location.origin).search
      render(next)
    })
  }
  const click = async (element: Element | null | undefined) => { assert.ok(element); await act(async () => element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))) }
  const byLabel = (label: string) => [...host.querySelectorAll('button')].find(button => button.getAttribute('aria-label') === label)
  const close = async () => { await act(async () => root.unmount()); host.remove(); globalThis.fetch = originalFetch }
  return { host, click, byLabel, close, commitNavigation }
}
test('background board checks keep the studied player, filters and nested scroll across 200, 304 and failure', async () => {
  const preTipBoard = { ...board, game: { ...board.game, datetime: new Date(Date.now() + 86400000).toISOString() } }
  const ui = await harness('research', 'over', null, false, 'points', '', preTipBoard)
  try {
    const search = ui.host.querySelector<HTMLInputElement>('input[aria-label="Find a player"]')!
    assert.ok(search)
    const table = ui.host.querySelector<HTMLElement>('[aria-label="Player research table"]')!
    table.scrollLeft = 97
    await ui.click(ui.byLabel('Analyze Test Player, Boston Celtics'))
    const dialog = ui.host.querySelector('[role="dialog"]')
    assert.ok(dialog)
    const panel = dialog.querySelector<HTMLElement>('[class]') ?? dialog as HTMLElement
    panel.scrollTop = 86
    let call = 0
    globalThis.fetch = async input => {
      assert.match(String(input), /^\/the-paint\/board\?game=123/)
      call++
      if (call === 1) return Response.json({ ...preTipBoard, fetchedAt:'2026-10-19T14:01:00Z' }, { headers:{ETag:'W/"one"'} })
      if (call === 2) return new Response(null,{status:304,headers:{'X-NBA-Fetched-At':'2026-10-19T14:02:00Z',ETag:'W/"one"'}})
      return new Response(null,{status:503})
    }
    for (let i=0;i<3;i++) {
      await act(async()=>{window.dispatchEvent(new dom.window.Event('fixture:board-poll'));await new Promise(resolve=>setTimeout(resolve,0))})
      assert.equal(ui.host.querySelector('[role="dialog"]'),dialog,'the open player must not be remounted')
      assert.equal(table.scrollLeft,97,'the research table must not reset its position')
      assert.equal(panel.scrollTop,86,'the player panel must not reset its position')
      assert.equal(ui.host.querySelector('input[aria-label="Find a player"]'),search,'the filter control must remain mounted')
    }
    assert.equal(call,3)
    assert.match(ui.host.textContent??'', /Refresh failed\. Showing your last loaded board\./)
  } finally { await ui.close() }
})

test('exact pregame cutoff hides an unfrozen board even when the boundary fetch fails', async () => {
  const beforeTip = { ...board, game: { ...board.game, datetime:new Date(Date.now()+250).toISOString() } }
  const ui = await harness('research', 'over', null, false, 'points', '', beforeTip)
  try {
    assert.ok(ui.byLabel('Analyze Test Player, Boston Celtics'))
    let attempts = 0
    globalThis.fetch = async input => {
      assert.match(String(input), /^\/the-paint\/board\?game=123/)
      attempts++
      return new Response(null,{status:503})
    }
    await act(async()=>{await new Promise(resolve=>setTimeout(resolve,400))})
    assert.equal(ui.byLabel('Analyze Test Player, Boston Celtics'),undefined,'open pregame data must be hidden at the boundary even after failure')
    assert.match(ui.host.textContent??'',/Pregame research is unavailable/)
    assert.ok(attempts>=1,'a frozen replacement must be requested at the cutoff')
  } finally { await ui.close() }
})

test('an older in-flight board never reappears after tip while a saved frozen board can recover', async () => {
  const beforeTip = { ...board, game:{...board.game,datetime:new Date(Date.now()+300).toISOString()} }
  const ui = await harness('research', 'over', null, false, 'points', '', beforeTip)
  let finish: ((response:Response)=>void)|undefined
  let finishFrozen: ((response:Response)=>void)|undefined
  let request = 0
  try {
    globalThis.fetch = async input => {
      assert.match(String(input), /^\/the-paint\/board\?game=123/)
      request++
      if(request===1)return await new Promise<Response>(resolve=>{finish=resolve})
      return await new Promise<Response>(resolve=>{finishFrozen=resolve})
    }
    await act(async()=>{window.dispatchEvent(new dom.window.Event('fixture:board-poll'));await new Promise(resolve=>setTimeout(resolve,0))})
    assert.equal(request,1)
    await act(async()=>{await new Promise(resolve=>setTimeout(resolve,400))})
    assert.equal(ui.byLabel('Analyze Test Player, Boston Celtics'),undefined)
    await act(async()=>{finish!(Response.json(beforeTip));await new Promise(resolve=>setTimeout(resolve,0))})
    assert.equal(ui.byLabel('Analyze Test Player, Boston Celtics'),undefined,'a late open board cannot leak past tip')
    assert.ok(finishFrozen,'the boundary queues one replacement after the in-flight request')
    await act(async()=>{finishFrozen!(Response.json({...beforeTip,researchSnapshot:{frozen:true,observedAt:board.fetchedAt,source:'capture'}}));await new Promise(resolve=>setTimeout(resolve,0))})
    assert.ok(ui.byLabel('Analyze Test Player, Boston Celtics'),'a genuine frozen snapshot restores research')
    assert.match(ui.host.textContent??'',/Frozen pregame baseline/)
  } finally { await ui.close() }
})

test('a missing player does not close the study panel or expose stale pick actions', async () => {
  const beforeTip = { ...board, game:{...board.game,datetime:new Date(Date.now()+86400000).toISOString()} }
  const ui = await harness('research', 'over', null, false, 'points', '', beforeTip)
  try {
    await ui.click(ui.byLabel('Analyze Test Player, Boston Celtics'))
    const dialog = ui.host.querySelector('[role="dialog"]')!
    await ui.click([...dialog.querySelectorAll('button')].find(button=>button.textContent==='L5'))
    assert.equal([...dialog.querySelectorAll('button')].find(button=>button.textContent==='L5')?.getAttribute('aria-pressed'),'true')
    let count=0
    globalThis.fetch = async input => {
      assert.match(String(input), /^\/the-paint\/board\?game=123/)
      count++
      return Response.json(count===1?{...beforeTip,players:[]}:beforeTip)
    }
    await act(async()=>{window.dispatchEvent(new dom.window.Event('fixture:board-poll'));await new Promise(resolve=>setTimeout(resolve,0))})
    assert.equal(ui.host.querySelector('[role="dialog"]'),dialog)
    assert.match(dialog.textContent??'',/Player unavailable/)
    assert.equal(dialog.querySelector('[data-testid="pick"]'),null,'a missing player has no stale pick')
    await act(async()=>{window.dispatchEvent(new dom.window.Event('fixture:board-poll'));await new Promise(resolve=>setTimeout(resolve,0))})
    assert.equal(ui.host.querySelector('[role="dialog"]'),dialog)
    assert.equal([...dialog.querySelectorAll('button')].find(button=>button.textContent==='L5')?.getAttribute('aria-pressed'),'true','local study controls survive return')
  } finally { await ui.close() }
})

for (const reason of ['past clock','live status'] as const) test(`already closed pregame requests a frozen board immediately: ${reason}`, async () => {
  const original=globalThis.fetch
  const started={...board,game:{...board.game,datetime:new Date(Date.now()+(reason==='past clock'?-10000:86400000)).toISOString(),status_state:reason==='live status'?'in_progress':'scheduled'}}
  let requests=0
  globalThis.fetch=async input=>{assert.match(String(input),/^\/the-paint\/board\?game=123/);requests++;return new Response(null,{status:503})}
  window.history.replaceState(null,'','/the-paint?view=research&mode=pregame')
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host)
  try {
    await act(async()=>{root.render(createElement(compiled.exports.PaintBoardClient,{initial:started,games:[started.game],days:[started.game.date],date:started.game.date,initialMode:'pregame'}))})
    await act(async()=>{await new Promise(resolve=>setTimeout(resolve,20))})
    assert.match(host.textContent??'',/Pregame research is unavailable/)
    assert.equal(requests,1,'closed research must request a durable frozen replacement immediately')
  } finally {await act(async()=>root.unmount());host.remove();globalThis.fetch=original}
})

test('resuming after a throttled cutoff hides the board and immediately requests its saved snapshot', async () => {
  const now = Date.now; let time = now()
  Date.now=()=>time
  const beforeTip={...board,game:{...board.game,datetime:new Date(time+10000).toISOString()}}
  const ui=await harness('research','over',null,false,'points','',beforeTip)
  let requests=0
  try {
    globalThis.fetch=async()=>{requests++;return new Response(null,{status:503})}
    time+=10000
    await act(async()=>{window.dispatchEvent(new dom.window.Event('focus'));await new Promise(resolve=>setTimeout(resolve,0))})
    assert.equal(ui.byLabel('Analyze Test Player, Boston Celtics'),undefined)
    assert.equal(requests,1,'returning after tip requests the frozen replacement immediately')
  } finally {await ui.close();Date.now=now}
})

test('a later schedule correction cannot reopen an earlier known pregame cutoff', async () => {
  const originalFetch=globalThis.fetch,originalNow=Date.now;let time=originalNow()
  Date.now=()=>time
  const early={...board,game:{...board.game,datetime:new Date(time+10000).toISOString()}}
  const later={...early,game:{...early.game,datetime:new Date(time+20000).toISOString()}}
  let requests=0
  globalThis.fetch=async()=>{requests++;return requests===1?Response.json(later):new Response(null,{status:503})}
  window.history.replaceState(null,'','/the-paint?view=research&mode=pregame')
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host)
  const render=(games:PaintBoard['game'][])=>root.render(createElement(compiled.exports.PaintBoardClient,{initial:early,games,days:[early.game.date],date:early.game.date,initialMode:'pregame'}))
  try {
    await act(async()=>render([early.game]))
    await act(async()=>{window.dispatchEvent(new dom.window.Event('fixture:board-poll'));await new Promise(resolve=>setTimeout(resolve,0))})
    await act(async()=>render([later.game]))
    assert.ok([...host.querySelectorAll('button')].some(button=>button.getAttribute('aria-label')==='Analyze Test Player, Boston Celtics'))
    time+=10000
    await act(async()=>{window.dispatchEvent(new dom.window.Event('focus'));await new Promise(resolve=>setTimeout(resolve,0))})
    assert.match(host.textContent??'',/Pregame research is unavailable/)
    assert.equal([...host.querySelectorAll('button')].some(button=>button.getAttribute('aria-label')==='Analyze Test Player, Boston Celtics'),false)
  } finally {await act(async()=>root.unmount());host.remove();globalThis.fetch=originalFetch;Date.now=originalNow}
})

test('a frozen observation captured after a newly learned earlier start is hidden', async () => {
  const originalFetch=globalThis.fetch,originalNow=Date.now;const start=originalNow(), time=start+1000;Date.now=()=>time
  const late={...board,game:{...board.game,datetime:new Date(start+2000).toISOString()},researchSnapshot:{frozen:true,observedAt:new Date(start+500).toISOString(),source:'capture' as const}}
  const early={...late.game,datetime:new Date(start+400).toISOString()}
  let requests=0
  globalThis.fetch=async()=>{requests++;return new Response(null,{status:503})}
  window.history.replaceState(null,'','/the-paint?view=research&mode=pregame')
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host)
  const render=(games:PaintBoard['game'][])=>root.render(createElement(compiled.exports.PaintBoardClient,{initial:late,games,days:[late.game.date],date:late.game.date,initialMode:'pregame'}))
  try {
    await act(async()=>render([late.game]))
    assert.ok([...host.querySelectorAll('button')].some(button=>button.getAttribute('aria-label')==='Analyze Test Player, Boston Celtics'))
    await act(async()=>{render([early])})
    await act(async()=>{await new Promise(resolve=>setTimeout(resolve,20))})
    assert.match(host.textContent??'',/Pregame research is unavailable/)
    assert.equal([...host.querySelectorAll('button')].some(button=>button.getAttribute('aria-label')==='Analyze Test Player, Boston Celtics'),false)
    assert.ok(requests>=1,'the invalid snapshot must trigger a replacement request')
  } finally {await act(async()=>root.unmount());host.remove();globalThis.fetch=originalFetch;Date.now=originalNow}
})

test('a frozen observation from the future is hidden and cannot be selected', async () => {
  const originalFetch=globalThis.fetch,originalNow=Date.now;const time=originalNow();Date.now=()=>time
  const invalid={...board,game:{...board.game,datetime:new Date(time+86400000).toISOString()},researchSnapshot:{frozen:true,observedAt:new Date(time+60000).toISOString(),source:'capture' as const}}
  let requests=0
  globalThis.fetch=async()=>{requests++;return new Response(null,{status:503})}
  window.history.replaceState(null,'','/the-paint?view=research&mode=pregame')
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host)
  try {
    await act(async()=>root.render(createElement(compiled.exports.PaintBoardClient,{initial:invalid,games:[invalid.game],days:[invalid.game.date],date:invalid.game.date,initialMode:'pregame'})))
    await act(async()=>{await new Promise(resolve=>setTimeout(resolve,20))})
    assert.match(host.textContent??'',/Pregame research is unavailable/)
    assert.equal([...host.querySelectorAll('button')].some(button=>button.getAttribute('aria-label')==='Analyze Test Player, Boston Celtics'),false)
    assert.equal(host.querySelector('[data-testid="pick"]'),null)
    assert.ok(requests>=1)
  } finally {await act(async()=>root.unmount());host.remove();globalThis.fetch=originalFetch;Date.now=originalNow}
})
