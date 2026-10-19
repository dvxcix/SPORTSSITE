import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import { act, createElement, type ComponentType } from 'react'
import { nbaCenteredHeat, nbaHeatStyle, nbaRelativeHeat } from '../src/app/the-paint/paintHeat.ts'
import type { PaintBoard, PaintPlayer } from '../src/lib/nbaPaint.ts'
import { nbaPlayerSeasons } from '../src/lib/nbaEntities.ts'

test('relative heat preserves direction, missingness and neutral equal or insufficient pools', () => {
  assert.equal(nbaRelativeHeat(10, [10, 20, 30]), 0)
  assert.equal(nbaRelativeHeat(20, [10, 20, 30]), 50)
  assert.equal(nbaRelativeHeat(30, [10, 20, 30]), 100)
  assert.equal(nbaRelativeHeat(10, [10, 20, 30], { invert: true }), 100)
  for (const pool of [[10], [10, 10], [null, undefined, NaN]]) assert.equal(nbaRelativeHeat(10, pool), null)
  assert.equal(nbaRelativeHeat(null, [10, 20]), null)
  assert.equal(nbaRelativeHeat(Infinity, [10, 20]), null)
  assert.equal(nbaRelativeHeat(20, [10, NaN, null, 30]), 50)
})

test('signed heat keeps zero neutral and positive evidence above neutral even in a wholly positive pool', () => {
  assert.equal(nbaCenteredHeat(0, [-4, 8]), 50)
  assert.equal(nbaCenteredHeat(2, [2, 4]), 75)
  assert.equal(nbaCenteredHeat(-2, [-2, -4]), 25)
  assert.equal(nbaCenteredHeat(-2, [-2, -4], { invert: true }), 75)
  assert.equal(nbaCenteredHeat(2, [2, 2]), null)
})

test('solid heat palettes provide readable small-text contrast throughout both gradients', () => {
  const luminance = (rgb: number[]) => rgb.map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0)
  for (const tone of ['volume', 'performance'] as const) {
    const fills = new Set<string>()
    for (let heat = 0; heat <= 100; heat++) {
      const style = nbaHeatStyle(heat, 50, tone) as Record<string, string>
      const fill = style['--heat-fill']; fills.add(fill)
      const contrast = (luminance([244, 248, 252]) + .05) / (luminance(fill.match(/\d+/g)!.map(Number)) + .05)
      assert.ok(contrast >= 4.5, `${tone} ${heat}: ${contrast}`)
    }
    assert.ok(fills.size > 50, 'Heat is a continuous gradient, not three discrete buckets')
  }
  assert.equal(nbaHeatStyle(null), undefined)
})

const require = createRequire(import.meta.url)
const { JSDOM } = require('jsdom')
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://www.slipsurge.com/the-paint' })
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })
const { createRoot } = await import('react-dom/client')
const stubs: Record<string, string> = {
  '@/lib/nbaRefresh': 'export const watchNbaRefresh=()=>()=>{}',
  '@/components/BookLogo': 'export const BookLogo=()=>null;export const bookName=value=>value',
  './PaintVisuals': `export const PlayerAvatar=()=>null;export const TeamLogo=()=>null;export const number=(value)=>value==null?'—':value.toFixed(1);export const marketNumber=number`,
  './PaintEntitySelect': 'export const PaintBookSelect=()=>null',
  './PaintPrice': 'export const PaintGamePrice=()=>null;export const PaintPrice=()=>null',
  './PaintPickActions': `import React from 'react';export const PaintPickActions=({offer,side})=><button data-offer={offer.id} data-side={side}>Save</button>`,
  '@/app/the-paint/PaintShotChart': 'export const PaintShotChart=()=>null',
  '@/app/the-paint/PaintVisuals': 'export const TeamLogo=()=>null',
  'next/link': `import React from 'react';export default function Link({children,...props}){return <a {...props}>{children}</a>}`,
}
const bundle = await build({ stdin: { contents: `export {PaintUsage,PaintCheatsheets,PaintMatchupLab} from './src/app/the-paint/PaintResearchTools';export {PaintTracking} from './src/app/the-paint/PaintTracking';export {NbaEntityHistory} from './src/components/nba/NbaEntityHistory'`, resolveDir: resolve('.'), loader: 'tsx' }, bundle: true, write: false, outfile: 'heatmaps.cjs', platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react-dom'], tsconfig: 'tsconfig.json', loader: { '.css': 'empty' }, plugins: [{ name: 'heatmap-fixture', setup(builder) {
  builder.onResolve({ filter: /.*/ }, args => args.path in stubs ? { path: args.path, namespace: 'stub' } : undefined)
  builder.onLoad({ filter: /.*/, namespace: 'stub' }, args => ({ contents: stubs[args.path], loader: 'tsx', resolveDir: resolve('.') }))
} }] })
const fixtureModule = { exports: {} as Record<string, ComponentType<Record<string, unknown>>> }
new Function('require', 'module', 'exports', bundle.outputFiles.find(file => file.path.endsWith('.cjs'))!.text)(require, fixtureModule, fixtureModule.exports)
const home = { id: 2, abbreviation: 'BOS', full_name: 'Boston Celtics', name: 'Celtics' }, away = { id: 9, abbreviation: 'DET', full_name: 'Detroit Pistons', name: 'Pistons' }
function player(id: number, minutes: number | null): PaintPlayer {
  return { id, first_name: 'Player', last_name: String(id), position: 'G', team: id === 3 ? away : home, headshot: null, injury: null, average: { min: minutes, pts: id * 10 - 5 }, props: [{ id, player_id: id, game_id: 123, vendor: 'fanduel', prop_type: 'points', line_value: '10', market: { type: 'over_under', over_odds: -110, under_odds: -110 }, updated_at: '2026-10-20T12:00:00Z' }], logs: minutes == null ? [] : Array.from({ length: 20 }, (_, index) => ({ id: id * 100 + index, player: { id }, team: { id: id === 3 ? away.id : home.id }, game: { id: index + 1000, date: `2026-04-${String(index + 1).padStart(2, '0')}`, status: 'Final', home_team_id: home.id, visitor_team_id: away.id }, min: `${minutes}:00`, pts: id * 10 - 5, reb: 5, ast: 5, fg3m: 1, stl: 0, blk: 0, turnover: 1, fga: 10, fgm: 4, fg3a: id * 2, fta: 2, ftm: 2 })) }
}
const players = [player(1, 10), player(2, 20), player(3, 30), player(4, null)]
const board: PaintBoard = { game: { id: 123, date: '2026-10-20', datetime: '2026-10-20T23:00:00Z', season: 2026, status: 'Scheduled', period: 0, home_team: home, visitor_team: away, home_team_score: 0, visitor_team_score: 0 }, players, sampleSeason: 2025, historical: false, sampleEnd: '2026-04-20', fetchedAt: '2026-10-20T12:00:00Z', issues: [], statsComplete: true, teams: [home, away], teamStats: [{ team: home, stats: { pace: 98, off_rating: 110, def_rating: 100, net_rating: 10, reb_pct: .5, ts_pct: .6 } }, { team: away, stats: { pace: 105, off_rating: 115, def_rating: 120, net_rating: -5, reb_pct: .5, ts_pct: .5 } }] }
const scout = { season: 2025, fetchedAt: board.fetchedAt, issues: [], players: players.map(player => ({ id: player.id, advanced: { usg_pct: player.id < 4 ? player.id / 10 : null }, passing: {}, rebounding: {}, drives: {} })) }
const tracking = { gameId: 123, rows: players.flatMap(player => player.logs.map(log => ({ id: log.id, playerId: player.id, teamId: player.team.id, gameId: log.game.id, values: { usage_percentage: player.id / 10, defensive_rating: 90 + player.id * 10 } }))), seasons: [2025], fields: ['usage_percentage', 'defensive_rating'], complete: true, fetchedAt: board.fetchedAt, stale: false }
async function harness(component: string, props: Record<string, unknown>) {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async input => Response.json(String(input).includes('/scouting?') ? scout : tracking)
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host)
  const render = async (next = props) => { await act(async () => root.render(createElement(fixtureModule.exports[component], next))) }
  await render()
  return { host, render, close: async () => { await act(async () => root.unmount()); host.remove(); globalThis.fetch = originalFetch } }
}
const noop = () => {}
const heat = (host: Element, label: string) => host.querySelector(`[data-heat-value][aria-label="${label}"]`)?.getAttribute('data-heat-value')

test('Role & Minutes renders per-column heat, neutral missing/equal data, and a stable full-roster scale after filtering', async () => {
  const props = { board, players, open: noop }, ui = await harness('PaintUsage', props)
  try {
    assert.equal(heat(ui.host, 'Minutes: 10.0'), '0.00')
    assert.equal(heat(ui.host, 'Minutes: 20.0'), '50.00')
    assert.equal(heat(ui.host, 'Minutes: 30.0'), '100.00')
    assert.equal(heat(ui.host, 'Minutes: —'), 'neutral')
    assert.equal(heat(ui.host, 'FGA: 10.0'), 'neutral')
    assert.equal(heat(ui.host, 'Usage %: 20.0%'), '50.00')
    await ui.render({ ...props, players: [players[1]] })
    assert.equal(heat(ui.host, 'Minutes: 20.0'), '50.00')
    assert.equal(heat(ui.host, 'Usage %: 20.0%'), '50.00')
    assert.equal(ui.host.querySelector('[role="region"]')?.getAttribute('tabindex'), '0')
  } finally { await ui.close() }
})

test('Tracking heat uses the full roster before player filtering and reverses only the known defensive-rating metric', async () => {
  const props = { board, players, open: noop }, ui = await harness('PaintTracking', props)
  try {
    assert.equal(heat(ui.host, 'L5 Usage %: 20.0%'), '50.00')
    await ui.render({ ...props, players: [players[1], players[2]] })
    assert.equal(heat(ui.host, 'L5 Usage %: 20.0%'), '50.00')
    const select = ui.host.querySelector('[aria-label="Game tracking metric"]') as HTMLSelectElement
    await act(async () => { select.value = 'defensive_rating'; select.dispatchEvent(new dom.window.Event('change', { bubbles: true })) })
    assert.equal(heat(ui.host, 'L5 Defensive rating: 110.0'), '50.00')
    assert.equal(heat(ui.host, 'L5 Defensive rating: 120.0'), '0.00')
  } finally { await ui.close() }
})

test('Cheatsheet heat preserves selected-side hit rates, market-specific form scales and exact save actions', async () => {
  const props = { board, players, open: noop, vendor: 'all', side: 'over', location: 'all' }, ui = await harness('PaintCheatsheets', props)
  try {
    assert.equal(heat(ui.host, 'L5 Points: 15.0'), '50.00')
    await ui.render({ ...props, players: [players[1]] })
    assert.equal(heat(ui.host, 'L5 Points: 15.0'), '50.00')
    assert.equal(heat(ui.host, 'L10 over hit rate: 100%'), '100.00')
    assert.ok(Number(heat(ui.host, 'Form vs line: 5')) > 50)
    assert.equal(ui.host.querySelector('[data-offer="2"]')?.getAttribute('data-side'), 'over')
    await ui.render({ ...props, players: [players[1]], side: 'under' })
    assert.equal(heat(ui.host, 'L10 under hit rate: 0%'), '0.00')
    assert.equal(ui.host.querySelector('[data-offer="2"]')?.getAttribute('data-side'), 'under')
  } finally { await ui.close() }
})

test('Team matchup heat inverts defensive rating, keeps tied rates neutral and retains roster-relative rotation minutes', async () => {
  const ui = await harness('PaintMatchupLab', { board, open: noop })
  try {
    assert.equal(heat(ui.host, 'Defensive rating: 100.0 · lower is stronger defense'), '100.00')
    assert.equal(heat(ui.host, 'Defensive rating: 120.0 · lower is stronger defense'), '0.00')
    assert.equal(heat(ui.host, 'Rebound share: 50.0%'), 'neutral')
    assert.equal(heat(ui.host, 'Player 2: 20.0 season minutes'), '50.00')
  } finally { await ui.close() }
})

test('Player history heat keeps each stat and season comparable, ties neutral, and colors unchanged by sorting', async () => {
  const entityPlayer = { ...players[1], logs: players[1].logs.slice(0, 4).map((log, index) => ({ ...log, pts: index < 3 ? (index + 1) * 10 : 10, game: { ...log.game, season: index < 3 ? 2025 : 2024 } })) }
  const seasons = nbaPlayerSeasons(entityPlayer.logs)
  const ui = await harness('NbaEntityHistory', { player: entityPlayer, seasons, teams: [home, away].map(team => ({ ...team, conference: 'East' })) })
  try {
    assert.equal(heat(ui.host, 'Game PTS: 10'), '0.00')
    assert.equal(heat(ui.host, 'Game PTS: 20'), '50.00')
    assert.equal(heat(ui.host, 'Game PTS: 30'), '100.00')
    assert.equal(heat(ui.host, 'Game REB: 5'), 'neutral')
    const pointsSort = [...ui.host.querySelectorAll('button')].find(button => button.textContent === 'PTS')!
    await act(async () => pointsSort.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
    assert.equal(heat(ui.host, 'Game PTS: 20'), '50.00')
    const seasonSelect = ui.host.querySelector('[aria-label="NBA player history season"]') as HTMLSelectElement
    await act(async () => { seasonSelect.value = '2024'; seasonSelect.dispatchEvent(new dom.window.Event('change', { bubbles: true })) })
    assert.equal(heat(ui.host, 'Game PTS: 10'), 'neutral')
    assert.equal(heat(ui.host, 'Season PTS: 10.0'), '0.00')
  } finally { await ui.close() }
})
