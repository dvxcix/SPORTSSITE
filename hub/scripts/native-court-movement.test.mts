import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { build } from 'esbuild'

const early = '2026-11-25T18:00:00.000Z'
const later = '2026-11-25T19:00:00.000Z'
const before = '2026-11-25T17:00:00.000Z'
const threshold = (line: number, odds: number, kind = 'milestone', book = 'fanduel') => ({
  id: line * 10, game_id: 42, player_id: 77, vendor: book, prop_type: 'points', line_value: line,
  market: kind === 'milestone' ? { type: kind, odds } : { type: kind, over_odds: odds, under_odds: -110 },
})
const fixture = {
  response: {
    frames: [
      { captured_at: early, props: [threshold(20, 130), threshold(22, 205), threshold(21.5, -110, 'over_under')] },
      { captured_at: later, props: [threshold(20, -105), threshold(25, 195), threshold(23.5, -115, 'over_under'),
        threshold(20, 177, 'milestone', 'draftkings')] },
    ],
    openingRows: [
      { game_id: 42, player_id: 77, vendor: 'fanduel', market: 'points', market_type: 'milestone',
        line: 20, side: 'over', odds: 145, observed_at: before },
      { game_id: 42, player_id: 77, vendor: 'fanduel', market: 'points', market_type: 'milestone',
        line: 22, side: 'over', odds: 225, observed_at: later },
    ],
  },
}
Object.assign(globalThis, { nativeCourtMovementFixture: fixture })
const stubs: Record<string, string> = {
  'next/server': 'export const NextResponse = Response;',
  '@/app/the-paint/history/route': `export const GET = async req => req.headers.has('authorization')
    ? Response.json(globalThis.nativeCourtMovementFixture.response) : Response.json({}, {status:403});`,
}
const bundle = await build({
  entryPoints: ['src/lib/nativeCourtMovement.ts'], bundle: true, write: false, platform: 'node', format: 'cjs',
  plugins: [{ name: 'movement-fixture', setup(plugin) {
    plugin.onResolve({ filter: /.*/ }, arg => Object.hasOwn(stubs, arg.path) ? { path: arg.path, namespace: 'fixture' } : undefined)
    plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, arg => ({ contents: stubs[arg.path] }))
  } }],
})
const module = { exports: {} as typeof import('../src/lib/nativeCourtMovement') }
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports)
const read = (extra: Record<string, string> = {}, member = true) => {
  const params = new URLSearchParams({ game: '42', market: 'points', book: 'fanduel', mode: 'pregame', ...extra })
  const url = new URL('https://fixture.invalid/api/mobile/court/tools?' + params)
  const request = new Request(url, { headers: member ? { authorization: 'Bearer fixture' } : {} })
  return module.exports.getNativeCourtMovement(Object.assign(request, { nextUrl: url }) as Parameters<typeof module.exports.getNativeCourtMovement>[0])
}

test('movement inherits Court authorization and checks exact query values', async () => {
  assert.equal((await read({}, false)).status, 403)
  assert.equal((await read({ game: '042' })).status, 400)
  assert.equal((await read({ side: 'under' })).status, 400)
  assert.equal((await read({ capture: 'invalid' })).status, 400)
})

test('pregame replay holds the exact book and threshold and excludes later openings', async () => {
  const current = await read({ player: '77', target: '20' })
  const payload = await current.json()
  assert.deepEqual(payload.captures, [early, later])
  assert.deepEqual(payload.books, ['draftkings', 'fanduel'])
  assert.equal(payload.rows.length, 1)
  assert.equal(payload.rows[0].price, -105)
  assert.equal(payload.rows[0].firstPrice, 145)
  assert.equal(payload.rows[0].openingKnown, true)
  assert.deepEqual(payload.rows[0].points.map((point: { at: string }) => point.at), [early, later])

  const past = await (await read({ target: '22', capture: early })).json()
  assert.equal(past.selectedAt, early)
  assert.equal(past.rows[0].price, 205)
  assert.equal(past.rows[0].firstPrice, null)
  assert.equal(past.rows[0].movement, null)
  const withdrawn = await (await read({ target: '22' })).json()
  assert.deepEqual(withdrawn.rows, [])
})

test('over/under line movement does not compare prices across different thresholds', async () => {
  const response = await read({ contract: 'over_under', side: 'under', player: '77' })
  const payload = await response.json()
  assert.equal(payload.rows[0].firstLine, 21.5)
  assert.equal(payload.rows[0].line, 23.5)
  assert.equal(payload.rows[0].lineChange, 2)
  assert.equal(payload.rows[0].price, -110)
  assert.equal(payload.rows[0].movement, null)
})
