import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import type { PaintGame } from '../src/lib/nbaPaint.ts'

async function fixture(options: { closed?: boolean; cross?: boolean; rosterFails?: boolean; lineupFails?: boolean; savedFails?: boolean; statuses?: string[] } = {}) {
  let open = !options.closed
  const calls: string[] = []
  const imports: Record<string, unknown> = {
    'server-only': {},
    './nbaOddsMode': { nbaPregameOpen: () => open, nbaLiveOpen: () => open },
    './nbaPaintData': { getPaintMarketRoster: async () => { calls.push('injuries'); if (options.rosterFails) throw Error('source'); return [{ id: 1 }] } },
    './nbaLineupsData': { getNbaGameLineups: async () => {
      calls.push('lineups')
      if (options.cross) open = false
      if (options.lineupFails) throw Error('source')
      return { unavailable: options.savedFails ?? false, teams: (options.statuses ?? []).map(status => ({ status })) }
    } },
  }
  const source = await readFile(new URL('../src/lib/nbaAvailabilityCapture.ts', import.meta.url), 'utf8')
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const module = { exports: {} as typeof import('../src/lib/nbaAvailabilityCapture.ts') }
  new Function('require', 'module', 'exports', js)((name: string) => { assert.ok(name in imports, name); return imports[name] }, module, module.exports)
  return { capture: module.exports.captureNbaAvailability, calls }
}
const game = { id: 123 } as PaintGame

test('every active game refreshes injuries and lineups without a member panel or a price receipt', async () => {
  const h = await fixture({ statuses: ['expected', 'confirmed'] }), result = await h.capture(game, 'pregame')
  assert.deepEqual(h.calls.sort(), ['injuries', 'lineups'])
  assert.equal(result.status, 'verified')
  assert.equal(result.expected, 1)
  assert.equal(result.confirmed, 1)
  assert.equal(result.actual, 0)
  assert.equal(result.marketPlayers, 1)
})
test('an unpublished lineup stays pending; it is never promoted to confirmed', async () => {
  const h = await fixture(), result = await h.capture(game, 'pregame')
  assert.equal(result.status, 'verified')
  assert.equal(result.pendingTeams, 2)
  assert.equal(result.confirmed, 0)
})
test('an injury outage, lineup outage or failed durable save remains an unavailable receipt', async () => {
  for (const option of [{ rosterFails: true }, { lineupFails: true }, { savedFails: true }]) {
    const h = await fixture(option), result = await h.capture(game, 'pregame')
    assert.equal(result.status, 'unavailable')
    assert.equal(h.calls.length, 2)
    if (option.rosterFails) assert.equal(result.marketPlayers, null)
  }
})
test('closed and tip-crossing pregame attempts cannot certify changing availability', async () => {
  const closed = await fixture({ closed: true }), result = await closed.capture(game, 'pregame')
  assert.equal(result.status, 'deferred'); assert.deepEqual(closed.calls, [])
  const cross = await fixture({ cross: true, statuses: ['confirmed'] }), crossing = await cross.capture(game, 'pregame')
  assert.equal(crossing.status, 'deferred'); assert.equal(crossing.confirmed, 0)
})
test('actual starter receipts remain explicitly Live', async () => {
  const h = await fixture({ statuses: ['actual', 'actual'] }), result = await h.capture(game, 'live')
  assert.equal(result.mode, 'live'); assert.equal(result.actual, 2); assert.equal(result.confirmed, 0)
})
test('cloud market dispatch runs each minute while independent paid First Basket cadence is retained', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'))
  assert.equal(config.crons.find((row: { path: string }) => row.path === '/api/cron/nba-market-capture').schedule, '* * * * *')
  const source = await readFile(new URL('../src/app/api/cron/nba-market-capture/route.ts', import.meta.url), 'utf8')
  assert.match(source, /first-basket-attempt:v3:.*240, 0/)
  assert.match(source, /market-attempt:v4:.*60,0/)
})
