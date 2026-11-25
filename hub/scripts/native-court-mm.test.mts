import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { build } from 'esbuild'

const require = createRequire(import.meta.url)
const { NextRequest } = require('next/server')
const stubs: Record<string, string> = {
  'server-only': '',
  '@/lib/paintAccess': 'export const requirePaintAccess = async () => globalThis.courtMMFixture.gate',
  '@/lib/nbaPaintData': 'export const getPaintGame = async id => ({ id }); export const getPaintBoard = async () => globalThis.courtMMFixture.board',
  '@/lib/nbaOddsBoardPhaseData': 'export const getNbaOddsBoardPhase = async () => null',
}
const result = await build({
  stdin: {
    contents: `export { GET } from './src/app/the-paint/board/route'`,
    resolveDir: process.cwd(), loader: 'ts',
  },
  bundle: true, write: false, format: 'cjs', platform: 'node', tsconfig: 'tsconfig.json', external: ['next/server'],
  plugins: [{ name: 'court-mm-fixture', setup(plugin) {
    plugin.onResolve({ filter: /.*/ }, args => args.path in stubs ? { path: args.path, namespace: 'fixture' } : undefined)
    plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: stubs[args.path], loader: 'js' }))
  } }],
})
type Reader = typeof import('../src/app/the-paint/board/route').GET
const reader = { exports: {} as { GET: Reader } }
new Function('require', 'module', 'exports', result.outputFiles[0].text)(require, reader, reader.exports)

test('the Court MM projection uses captured ranks and leaves the ordinary web board response intact', async () => {
  const date = '2026-11-24', season = 2026, gameId = 51, snapshotAt = '2026-11-24T22:20:00Z'
  const player = (id: number, points: number, line: number) => ({
    id, averageSeason: season, average: { pts: points },
    props: [{
      game_id: gameId, player_id: id, prop_type: 'points', vendor: 'fanduel', line_value: String(line),
      market: { type: 'milestone', odds: -110 }, updated_at: snapshotAt,
    }],
    logs: [1, 2, 3, 4, 5].map(n => ({
      id: n, player: { id }, team: { id: 1 }, game: {
        id: n, date: `2026-11-1${n}`, status: 'Final', status_state: 'final', season, postseason: false,
        home_team_id: 1, visitor_team_id: 2,
      },
      min: '25:00', pts: points,
    })),
  })
  const fixture = {
    gate: { error: undefined as Response | undefined },
    board: {
      game: { id: gameId, date, season }, fetchedAt: snapshotAt, historical: true, issues: [],
      oddsMode: 'pregame', researchSnapshot: { frozen: true, observedAt: snapshotAt },
      sampleSeason: season, baselineSeasons: [season], statsComplete: true, periodStatsComplete: true,
      players: [player(20, 30, 15), player(21, 20, 25)],
    },
  }
  Object.assign(globalThis, { courtMMFixture: fixture })
  const get = (extra = '') => reader.exports.GET(new NextRequest('https://slipsurge.invalid/the-paint/board?game=51'+extra))
  const normal = await get()
  assert.equal((await normal.json()).players.length, 2)
  assert.match(normal.headers.get('etag') ?? '', /^W\//)
  const response = await get('&native_mm=points&book=fanduel')
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
  assert.deepEqual(await response.json(), {
    gameId, date, mode: 'pregame', market: 'points', book: 'fanduel', snapshotAt,
    rows: [{ playerId: 20, mm: 1, marketRank: 2, statRank: 1 }, { playerId: 21, mm: -1, marketRank: 1, statRank: 2 }],
  })
  assert.equal((await get('&native_mm=unknown')).status, 400)
  assert.equal((await get('&native_mm=points&slate_date=2026-11-23')).status, 400)
  fixture.board.players[0].averageSeason = 2025
  assert.deepEqual((await (await get('&native_mm=points')).json()).rows, [])
  fixture.gate.error = new Response(null, { status: 403 })
  assert.equal((await get('&native_mm=points')).status, 403)
})
