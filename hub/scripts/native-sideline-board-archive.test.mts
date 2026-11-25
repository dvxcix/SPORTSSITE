import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { build } from 'esbuild'
import { nativeNflBoard } from '../src/lib/nativeNflBoard'
import type { SidelineGame, SidelineLens } from '../src/app/the-sideline/types'
import type { NflOddsPlayer, SidelineOddsBoard } from '../src/lib/nflOddsTypes'

const gameId = '2026_11_KC_DEN'
const date = '2026-11-15'
const early = '2026-11-15T18:00:00.000Z'
const final = '2026-11-15T19:00:00.000Z'
const game = { id: gameId, gameday: date, season: 2026, away: { abbr: 'KC' }, home: { abbr: 'DEN' } } as SidelineGame
const quote = { key: 'receiving_yards:25', propType: 'receiving_yards', label: '25+ Receiving Yards', category: 'receiving',
  line: 25, offers: [{ vendor: 'fanduel', line: 25, openingLine: 25, type: 'milestone',
    current: { odds: -115 }, opening: { odds: 120 }, updatedAt: early }] } as const
const athlete = { id: 10, gsisId: '00-0000010', name: 'Fixture Receiver', team: 'KC', position: 'WR',
  availability: { active: true, didNotPlay: false, updatedAt: early }, markets: [quote] } as unknown as NflOddsPlayer
const teammate = { ...athlete, id: 11, gsisId: '00-0000011', name: 'Fixture Veteran' }
const board = { players: [athlete, teammate], gameLines: [], capturedAt: early } as unknown as SidelineOddsBoard
const current = { id: athlete.gsisId, name: athlete.name, team: 'KC', position: 'WR', games: 4, targets: 18,
  receptions: 11, receivingYards: 118, separation: 2.5, catchRate: 61.1, unavailableMetrics: ['separation'] }
const moved = { ...current, id: teammate.gsisId, name: teammate.name, team: 'DEN' }
const lens = { season: 2026, windows: { l5: { players: [current, moved], teams: [], weeks: [9, 10] } },
  headline: 'Fixture', headlineDetail: 'Fixture sample' } as unknown as SidelineLens

test('Sideline stats keep original teams and omit unavailable historical measurements', () => {
  const result = nativeNflBoard(game, lens, 'l5', board, [], 'fanduel', false)
  assert.deepEqual(result.sampleWeeks, [9, 10])
  const currentRow = result.rows.find(row => row.player.id === 10)!
  assert.equal(currentRow.metrics.receivingYards, 118)
  assert.equal(currentRow.metrics.roleOpps, 18)
  assert.equal(currentRow.metrics.separation, undefined)
  assert.deepEqual(result.rows.find(row => row.player.id === 11)?.metrics, {})
})

test('Sideline stats withhold prices and mismatch context during an unverified availability state', () => {
  const stale = nativeNflBoard(game, lens, 'l5', { ...board, availabilityStale: true }, [], 'fanduel', false)
  assert.ok(stale.rows.every(row => row.signal === null && row.mm === null))
})

const requests: string[] = []
Object.assign(globalThis, { sidelineArchiveFixture: { game, board, requests, captures: [early, final] } })
const stubs: Record<string, string> = {
  'next/server': 'export const NextResponse = Response;',
  '@/app/the-sideline/data': `const f = globalThis.sidelineArchiveFixture;
    export const getSidelineGames = async () => ({ games: [f.game] });
    export const getSidelineTimeline = async () => f.captures;
    export const getSidelineMarketCapture = async (_, at) => { f.requests.push(at); return { board: f.board }; };`,
  './nflAccess': `export const requireNflAccess = async () => ({userId:'fixture'});`,
  './publicWorkspaceScope': 'export const publicWorkspaceGames = games => games;',
}
const bundle = await build({
  entryPoints: ['src/lib/nativeSidelineArchive.ts'], bundle: true, write: false, platform: 'node', format: 'cjs',
  plugins: [{ name: 'archive-fixture', setup(plugin) {
    plugin.onResolve({ filter: /.*/ }, arg => Object.hasOwn(stubs, arg.path) ? { path: arg.path, namespace: 'fixture' } : undefined)
    plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, arg => ({ contents: stubs[arg.path] }))
  } }],
})
const module = { exports: {} as typeof import('../src/lib/nativeSidelineArchive') }
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports)
const readArchive = (query: Record<string, string> = {}, viewer = 'fixture') => module.exports.getNativeSidelineArchive(
  new Request('https://fixture.invalid/api/mobile/sideline/market?' + new URLSearchParams({ game: gameId, ...query })), viewer)

test('NFL Market Story never chooses a frame outside the original cutoff-bounded index', async () => {
  assert.equal((await readArchive({}, 'other')).status, 403)
  assert.equal((await readArchive({ at: 'invalid' })).status, 400)
  const earlier = await (await readArchive({ at: '2026-11-15T18:30:00.000Z', player: '10' })).json()
  assert.equal(earlier.selectedAt, early)
  assert.equal(earlier.observedAt, early)
  assert.deepEqual(earlier.rows.map((row: { id: number }) => row.id), [10])
  assert.equal(earlier.rows[0].contracts[0].line, 25)
  assert.equal(earlier.rows[0].contracts[0].opening, 120)
  const after = await (await readArchive({ at: '2026-11-15T22:00:00.000Z' })).json()
  assert.equal(after.selectedAt, final)
  const before = await (await readArchive({ at: '2026-11-15T17:30:00.000Z' })).json()
  assert.equal(before.selectedAt, null)
  assert.deepEqual(before.rows, [])
  assert.deepEqual(requests, [early, final])
})
