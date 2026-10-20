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
  '@/components/ui/ModalSurface': 'export const ModalSurface=({children})=>children',
  './PaintPickActions': 'export const PaintPickActions=()=>null',
  '@/components/sports/PlayerAvatar': 'export const PlayerAvatar=()=>null',
  'next/link': 'import React from "react";export default function Link(props){return <a {...props}/>}',
}
const names = ['PaintSlate', 'PaintDivergence', 'PaintTracking', 'PaintMovement', 'PaintEstimate', 'PaintMatchup', 'PaintFirstBasketOdds']
const source = names.map(name => `export {${name}} from './src/app/the-paint/${name}'`).join('\n') + '\nexport {NbaEntityHistory} from "./src/components/nba/NbaEntityHistory"; export {NbaTeamRoster} from "./src/components/nba/NbaTeamRoster"'
const bundle = await build({ stdin: { contents: source, resolveDir: resolve('.'), loader: 'tsx' }, bundle: true, write: false, outfile: 'deep-tools.cjs', platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react-dom'], tsconfig: 'tsconfig.json', loader: { '.css': 'empty' }, plugins: [{ name: 'deep-tool-fixture', setup(builder) {
  builder.onResolve({ filter: /.*/ }, args => args.path in stubs ? { path: args.path, namespace: 'stub' } : undefined)
  builder.onLoad({ filter: /.*/, namespace: 'stub' }, args => ({ contents: stubs[args.path], loader: 'tsx', resolveDir: resolve('.') }))
} }] })
const fixtureModule = { exports: {} as Record<string, ComponentType<Record<string, unknown>>> }
new Function('require', 'module', 'exports', bundle.outputFiles.find(file => file.path.endsWith('.cjs'))!.text)(require, fixtureModule, fixtureModule.exports)

const team = { id: 2, abbreviation: 'BOS', full_name: 'Boston Celtics', name: 'Celtics' }
const board = { game: { id: 123, date: '2026-10-20', visitor_team: team, home_team: { ...team, id: 9, abbreviation: 'DET', full_name: 'Detroit Pistons', name: 'Pistons' } }, players: [], sampleSeason: 2025 }
const noop = () => {}
async function harness(component: string, props: Record<string, unknown>, success: unknown) {
  const originalFetch = globalThis.fetch
  let failing = true, requests = 0
  globalThis.fetch = async () => { requests++; if (failing) throw new Error('Fixture request failed'); return Response.json(success) }
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  const render = async (next = props) => { await act(async () => root.render(createElement(fixtureModule.exports[component], next))) }
  const click = async (label: string) => {
    const button = [...host.querySelectorAll('button')].find(node => node.textContent?.trim() === label || node.getAttribute('aria-label') === label)
    assert.ok(button, `Missing ${label}`)
    await act(async () => button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
  }
  await render()
  return { host, render, click, succeed: () => { failing = false }, fail: () => { failing = true }, requests: () => requests, close: async () => { await act(async () => root.unmount()); host.remove(); globalThis.fetch = originalFetch } }
}

const scenarios = [
  { component: 'PaintSlate', props: { date: board.game.date, market: 'points', side: 'over', book: 'all', books: [], onMarketChange: noop, onSideChange: noop, onBookChange: noop }, data: { date: board.game.date, games: 0, loaded: 0, complete: true, failed: [], rows: [], fetchedAt: '2026-10-20T12:00:00Z', stale: false }, loading: 'Loading the slate', unavailable: 'The slate could not load.', refresh: 'Refresh NBA slate edge', preserved: 'Last loaded prices' },
  { component: 'PaintDivergence', props: { board, open: noop }, data: { rows: [], captures: 2, publicCapturedAt: null, latestAt: null, stale: false }, loading: 'Loading market signals', unavailable: 'Market signals could not load.', refresh: 'Refresh cross-market signals', preserved: 'Last available moves' },
  { component: 'PaintTracking', props: { board, players: [], open: noop }, data: { gameId: 123, rows: [], seasons: [2025], fields: ['usage_percentage'], complete: true, fetchedAt: '2026-10-20T12:00:00Z', stale: false }, loading: 'Loading game tracking', unavailable: 'Game tracking could not load.', refresh: 'Refresh NBA game tracking', preserved: 'Last loaded observations' },
]
for (const scenario of scenarios) {
  test(`${scenario.component} settles initial failure, retries, and preserves prior data on refresh failure`, async () => {
    const ui = await harness(scenario.component, scenario.props, scenario.data)
    try {
      assert.ok(ui.host.textContent?.includes(scenario.unavailable))
      assert.equal(ui.host.textContent?.includes(scenario.loading), false)
      ui.succeed(); await ui.click('Retry')
      assert.equal(ui.requests(), 2)
      assert.equal(ui.host.textContent?.includes(scenario.unavailable), false)
      assert.equal(ui.host.textContent?.includes(scenario.loading), false)
      ui.fail(); await ui.click(scenario.refresh)
      assert.ok(ui.host.textContent?.includes(scenario.preserved))
      assert.equal(ui.host.textContent?.includes(scenario.loading), false)
    } finally { await ui.close() }
  })
}

test('Market Story distinguishes failed history from a successfully loaded empty history', async () => {
  const ui = await harness('PaintMovement', { board, players: [], market: 'points', book: 'all' }, { frames: [], openingRows: [] })
  try {
    assert.ok(ui.host.textContent?.includes('Market history could not load.'))
    assert.equal(ui.host.textContent?.includes('Loading market history'), false)
    assert.equal(ui.host.textContent?.includes('No odds history yet.'), false)
    ui.succeed(); await ui.click('Retry')
    assert.equal(ui.requests(), 2)
    assert.ok(ui.host.textContent?.includes('No odds history yet.'))
    assert.equal(ui.host.textContent?.includes('Market history could not load.'), false)
  } finally { await ui.close() }
})

test('projection failure can retry without reopening the player', async () => {
  const ui = await harness('PaintEstimate', { game: 123, player: { id: 434 }, market: 'points' }, { estimate: 25.2, games: 10 })
  try {
    assert.ok(ui.host.textContent?.includes('Projection unavailable'))
    ui.succeed(); await ui.click('Retry')
    assert.ok(ui.host.textContent?.includes('25.2'))
    assert.ok(ui.host.textContent?.includes('10 recent appearances'))
  } finally { await ui.close() }
})

test('matchup spread lines display their spread prices rather than moneylines', async () => {
  const ui = await harness('PaintMatchup', { board: { ...board, gameOdds: [{ id: 1, vendor: 'draftkings', spread_away_value: '4.5', spread_home_value: '-4.5', spread_away_odds: -111, spread_home_odds: -109, moneyline_away_odds: 250, moneyline_home_odds: -300, total_value: '220.5', updated_at: '2026-10-20T12:00:00Z' }] } }, {})
  try {
    assert.ok(ui.host.textContent?.includes('+4.5'))
    assert.ok(ui.host.textContent?.includes('-111'))
    assert.ok(ui.host.textContent?.includes('-109'))
    assert.equal(ui.host.textContent?.includes('+250'), false)
    assert.equal(ui.host.textContent?.includes('-300'), false)
  } finally { await ui.close() }
})

test('matchup starter portraits match confirmed IDs per team and preserve pending teams', async () => {
  const away = { id: 11, first_name: 'Jayson', last_name: 'Tatum', team: board.game.visitor_team, headshot: 'https://example.test/tatum.png' }
  const home = { id: 12, first_name: 'Cade', last_name: 'Cunningham', team: board.game.home_team, headshot: 'https://example.test/cunningham.png' }
  const lineup = { ...board, players: [away, home], starters: [away.id, 99999] }
  const ui = await harness('PaintMatchup', { board: lineup }, {})
  try {
    await ui.click('Matchup')
    const awayPanel = ui.host.querySelector('[aria-label="Boston Celtics matchup"]')!
    const homePanel = ui.host.querySelector('[aria-label="Detroit Pistons matchup"]')!
    assert.ok(awayPanel.textContent?.includes('1 confirmed starter'))
    const player = awayPanel.querySelector('a[aria-label="Jayson Tatum, confirmed starter"]')!
    assert.equal(player.getAttribute('href'), '/nba/players/11')
    assert.equal(player.querySelector('img')?.getAttribute('src'), away.headshot)
    assert.equal(awayPanel.querySelectorAll('li').length, 1, 'unmatched provider IDs do not invent a player')
    assert.ok(homePanel.textContent?.includes('Starters pending'))
    assert.equal(homePanel.querySelector('footer a'), null)
    assert.equal(ui.host.textContent?.includes('provider'), false)
    await ui.render({ board: { ...lineup, starters: [away.id, home.id] } })
    assert.ok(homePanel.querySelector('a[aria-label="Cade Cunningham, confirmed starter"]'))
    await ui.render({ board: { ...lineup, starters: [] } })
    assert.equal(ui.host.querySelectorAll('footer a').length, 0)
    assert.ok(awayPanel.textContent?.includes('Starters pending'))
    assert.ok(homePanel.textContent?.includes('Starters pending'))
  } finally { await ui.close() }
})

test('NBA profile tables expose named keyboard-focusable scroll regions', async () => {
  for (const [component, props, labels] of [
    ['NbaEntityHistory', { player: { id: 434, logs: [] }, teams: [], seasons: [] }, ['NBA season history table', 'NBA player game log table']],
    ['NbaTeamRoster', { players: [] }, ['NBA team roster table']],
  ] as const) {
    const ui = await harness(component, props, {})
    try {
      for (const label of labels) {
        const region = ui.host.querySelector<HTMLElement>(`[role="region"][aria-label="${label}"]`)
        assert.ok(region); assert.equal(region.tabIndex, 0)
        region.focus(); assert.equal(document.activeElement, region)
      }
    } finally { await ui.close() }
  }
})

test('First Basket sorts signed movement and changes baseline without dropping the other books', async () => {
  const row=(id:number,name:string,book:string,change:number|null,previousChange:number|null,market='first_score')=>({
    game:{...board.game,datetime:'2026-10-20T23:00:00Z',status_state:'scheduled'},
    player:{id,first_name:name,last_name:'Player',position:'G',team,headshot:null},
    offer:{id,game_id:123,player_id:id,vendor:book,prop_type:market,line_value:'0.5',market:{type:'milestone',odds:900},updated_at:'2026-10-20T12:00:00Z',opening:change==null?undefined:{over:{odds:1100,at:'2026-10-20T10:00:00Z'}}},
    movement:{change,previousChange,previousOdds:1000,previousAt:'2026-10-20T11:00:00Z',firstAt:'2026-10-20T10:00:00Z',latestAt:'2026-10-20T12:00:00Z',captures:3},
  })
  const rows=[row(1,'Alpha','fanduel',3,-1),row(1,'Alpha','draftkings',-5,-2),row(2,'Beta','fanduel',-4,2),row(3,'Gamma','fanduel',null,null)]
  const ui=await harness('PaintFirstBasketOdds',{date:board.game.date},{requestedDate:board.game.date,date:board.game.date,games:1,loaded:1,failed:0,status:'ready',unmatched:0,rows,fetchedAt:'2026-10-20T12:00:00Z'})
  const select=async(label:string,value:string)=>{
    const node=ui.host.querySelector(`select[aria-label="${label}"]`) as HTMLSelectElement
    assert.ok(node,label);await act(async()=>{node.value=value;node.dispatchEvent(new dom.window.Event('change',{bubbles:true}))})
  }
  const names=()=>[...ui.host.querySelectorAll('tbody tr>th strong')].map(node=>node.textContent)
  try {
    ui.succeed();await ui.click('Retry')
    assert.deepEqual(names(),['Alpha Player','Beta Player','Gamma Player'])
    await select('Sort first-basket prices','lengthened')
    assert.deepEqual(names(),['Alpha Player','Beta Player','Gamma Player'])
    await select('First-basket sportsbook','fanduel')
    assert.deepEqual(names(),['Beta Player','Alpha Player','Gamma Player'])
    await select('Sort first-basket prices','shortened')
    assert.deepEqual(names(),['Alpha Player','Beta Player','Gamma Player'])
    await select('First-basket movement baseline','previous')
    assert.deepEqual(names(),['Beta Player','Alpha Player','Gamma Player'])
    assert.match(ui.host.textContent??'',/PREV/)
    await select('First-basket sportsbook','all')
    await select('First-basket movement direction','shortened')
    assert.deepEqual(names(),['Beta Player'])
    await select('First-basket movement baseline','opening')
    assert.deepEqual(names(),['Alpha Player'])
    assert.equal(ui.host.querySelectorAll('tbody tr td').length,2)
    assert.equal(ui.host.querySelectorAll('tbody tr td span[aria-label^="Now "]').length,2)
    await select('Minimum first-basket change','5')
    assert.deepEqual(names(),[])
    assert.equal(ui.host.querySelector('[title], [role="tooltip"]'),null)
    assert.doesNotMatch(ui.host.textContent??'',/Compare the same|free throws count|rules|configured/i)
  } finally {await ui.close()}
})
