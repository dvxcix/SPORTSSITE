import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { build } from 'esbuild'

const output = await build({
  entryPoints: ['src/lib/nativeMlbOddsHistory.ts'], bundle: true, write: false, format: 'cjs', platform: 'node', tsconfig: 'tsconfig.json',
  plugins: [{ name: 'server-marker', setup(plugin) {
    plugin.onResolve({ filter: /^server-only$/ }, () => ({ path: 'server-only', namespace: 'empty' }))
    plugin.onLoad({ filter: /.*/, namespace: 'empty' }, () => ({ contents: '' }))
  } }],
})
const moduleFixture = { exports: {} as typeof import('../src/lib/nativeMlbOddsHistory') }
new Function('require', 'exports', 'module', output.outputFiles[0].text)(createRequire(import.meta.url), moduleFixture.exports, moduleFixture)
const { nativeMlbOddsHistory } = moduleFixture.exports
const at = (minute: number) => `2026-09-25T19:${String(minute).padStart(2, '0')}:00Z`

test('native MLB history keeps confirmed player, book, timestamp and price at the pregame boundary', () => {
  const archive: Parameters<typeof nativeMlbOddsHistory>[1] = [
    { captured_at: at(45), prop_map: { player: { name: 'Jose Tester', sa: { fanduel: 390, betmgm: 500 } } } },
    { captured_at: at(3), prop_map: { player: { name: 'José Tester', sa: { fanduel: 520 } }, other: { name: 'Wrong Team', sa: { fanduel: 500 } } } },
    { captured_at: at(10), prop_map: { player: { name: 'Jose Tester', sa: { fanduel: 430 } } } },
    { captured_at: at(15), prop_map: { player: { name: 'Jose Tester', sa: { fanduel: 430, betmgm: -110 } } } },
  ]
  const result = nativeMlbOddsHistory([{ id: 12, name: 'José Tester' }], archive, at(45))
  assert.deepEqual(result.map(({ playerId, book, points }) => [playerId, book, points.map(point => point.odds)]),
    [[12, 'fanduel', [520, 430]], [12, 'betmgm', [-110]]])
  assert.equal(result[0].points[0].time, '2026-09-25T19:03:00.000Z')
})

test('native MLB history keeps different thresholds independent and drops conflicting or ambiguous observations', () => {
  const withQuote = (minute: number, hrr: number, threshold?: number) => ({ captured_at: at(minute), prop_map: { player: {
    name: 'Player A', hrr: { fanduel: hrr }, ...(threshold == null ? {} : { hrr_line: { fanduel: threshold } }),
  } } })
  const history = [withQuote(2, 120, 0.5), withQuote(8, 145), withQuote(10, 220, 2.5), withQuote(12, 240), withQuote(12, 300), withQuote(13, 250)]
  const roster = [{ id: 12, name: 'Player A' }]
  const series = nativeMlbOddsHistory(roster, history, null)
  assert.deepEqual(series.map(({ line, points }) => [line, points.map(point => point.odds)]), [[0.5, [120, 145]], [2.5, [220, 250]]])
  assert.deepEqual(nativeMlbOddsHistory([...roster, { id: 14, name: 'Player A' }], history, null), [])
})
