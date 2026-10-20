import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import * as crypto from 'node:crypto'
import ts from 'typescript'
import { nbaFirstMovements } from '../src/lib/nbaFirstBasketMovement.ts'
import { nbaEconomicSnapshot } from '../src/lib/nbaMovement.ts'
import { nbaGameEconomicSnapshot, type NbaQuoteOpeningRow } from '../src/lib/nbaOddsHistory.ts'
import type { FirstBasketRow } from '../src/lib/nbaFirstBasketOdds.ts'
import * as modes from '../src/lib/nbaOddsMode.ts'
import type { PaintGame, PaintProp } from '../src/lib/nbaPaint.ts'

const at = '2026-10-20T12:00:00Z', priorAt = '2026-10-20T11:55:00Z', openingAt = '2026-10-20T10:00:00Z', now = Date.parse(at)
const team = { id: 2, abbreviation: 'BOS', full_name: 'Boston Celtics', name: 'Celtics' }
const game: PaintGame = { id: 123, date: '2026-10-20', season: 2026, status: 'Scheduled', datetime: '2026-10-20T23:00:00Z', status_state: 'scheduled', period: 0, home_team: team, visitor_team: { ...team, id: 9 }, home_team_score: 0, visitor_team_score: 0 }
const offer: PaintProp = { id: -1, game_id: 123, player_id: 434, vendor: 'fanduel', prop_type: 'first_score', line_value: '0.5', market: { type: 'over_under', over_odds: 500 }, updated_at: at }
const row: FirstBasketRow = { game, player: { id: 434, first_name: 'Test', last_name: 'Player', team, position: 'C', headshot: null }, offer }
const opening: NbaQuoteOpeningRow = { game_id: 123, player_id: 434, vendor: 'fanduel', market: 'first_score', market_type: 'over_under', line: .5, side: 'over', odds: 700, observed_at: openingAt }
const frame = (price: number, captured_at: string) => ({ captured_at, props: [{ ...offer, market: { type: 'over_under' as const, over_odds: price } }] })

test('first basket movement compares exact first observations and previous captures in probability points', () => {
  const result = nbaFirstMovements([row], [opening], { captures: 7, frames: [frame(600, priorAt), frame(500, at)] }, now + 1000)[0]
  assert.equal(result.offer.opening?.over?.odds, 700)
  assert.ok(Math.abs(result.movement!.change! - (100 / 600 - 100 / 800) * 100) < 1e-10)
  assert.ok(result.movement!.previousChange! > 0)
  assert.equal(result.movement!.previousOdds, 600)
  assert.equal(result.movement!.captures, 7)
  const longer = nbaFirstMovements([{ ...row, offer: { ...offer, market: { type: 'over_under', over_odds: 900 } } }], [opening], { captures: 2, frames: [frame(500, priorAt)] }, now)[0]
  assert.ok(longer.movement!.change! < 0)
  assert.ok(longer.movement!.previousChange! < 0)
})

test('first basket movement never crosses book, game, player, method, side or future observations', () => {
  for (const mismatch of [{ vendor: 'draftkings' }, { game_id: 124 }, { player_id: 435 }, { market: 'first_field_goal' }, { market: 'first_score_dunk' }, { line: 1 }, { side: 'under' as const }, { observed_at: '2026-10-20T13:00:00Z' }]) {
    const result = nbaFirstMovements([row], [{ ...opening, ...mismatch }], { captures: 0, frames: [] }, now)[0]
    assert.equal(result.movement?.change, null)
  }
  const absent = nbaFirstMovements([row], [], { captures: 2, frames: [frame(600, priorAt), { captured_at: at, props: [] }] }, now + 1000)[0]
  assert.equal(absent.movement?.previousOdds, null)
  assert.equal(absent.movement?.change, null)
  assert.equal(nbaFirstMovements([], [opening], { captures: 1, frames: [frame(600, at)] }, now).length, 0)
})

test('first-basket economics preserve every event/method change and ignore provider metadata', () => {
  assert.deepEqual(nbaEconomicSnapshot([offer]), nbaEconomicSnapshot([{ ...offer, id: -555, updated_at: openingAt }]))
  assert.notDeepEqual(nbaEconomicSnapshot([offer]), nbaEconomicSnapshot([{ ...offer, prop_type: 'first_score_dunk' }]))
  assert.notDeepEqual(nbaEconomicSnapshot([offer]), nbaEconomicSnapshot([{ ...offer, market: { ...offer.market, over_odds: 550 } }]))
  assert.notDeepEqual(nbaEconomicSnapshot([offer]), nbaEconomicSnapshot([]))
})

async function runCapture(failFirst = false, failProps = false, empty = false, firstState = { eventMatched: true, unmatched: 0 }) {
  const source = await readFile(new URL('../src/app/api/cron/nba-market-capture/route.ts', import.meta.url), 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const calls: { name: string; args: Record<string, unknown> }[] = []
  const regular = { ...offer, id: 1, prop_type: 'points', line_value: '15', market: { type: 'milestone', odds: -110 } }
  const admin = {
    from: () => ({ select: () => ({ in: async () => ({ data: [], error: null }) }) }),
    rpc: (name: string, args: Record<string, unknown>) => { calls.push({ name, args }); return { abortSignal: async () => ({ data: true, error: null }) } },
  }
  const mocks: Record<string, unknown> = {
    'node:crypto': crypto, 'next/server': { NextResponse: { json: (body: unknown, options: ResponseInit) => Response.json(body, options) } },
    '@/lib/cron-auth': { requireCronAuth: () => null },
    '@/lib/pipelineHealth': { withPipelineHealth: (_name: string, run: unknown) => run },
    '@/lib/supabase/admin': { createAdminClient: () => admin },
    '@/lib/nbaPaintData': { getPaintGame:async()=>game, getPaintSchedule: async () => ({ games: [game] }), getPaintProps: async () => { if (failProps) throw Error('fixture'); return empty ? [] : [regular] }, getPaintGameOdds: async () => [] },
    '@/lib/nbaMovement': { nbaEconomicSnapshot },
    '@/lib/nbaOddsHistory': { nbaGameEconomicSnapshot },
    '@/lib/nbaPaint': { nbaToday: () => game.date },
    '@/lib/nbaOddsMode':{...modes,nbaPregameOpen:(g:PaintGame)=>modes.nbaPregameOpen(g,now),nbaLiveOpen:(g:PaintGame)=>modes.nbaLiveOpen(g,now),nbaQuoteInMode:(q:PaintProp,g:PaintGame,m:modes.NbaOddsMode)=>modes.nbaQuoteInMode(q,g,m,now)},
    '@/lib/nbaSharedCache': { nbaSharedCache: async (_key: string, _ttl: number, _stale: number, load: () => Promise<unknown>) => ({ value: await load() }) },
    '@/lib/nbaFirstBasketOddsData': { getNbaFirstEvents: async () => [], getNbaFirstOdds: async () => { if (failFirst) throw Error('fixture'); return { rows: empty ? [] : [row], ...firstState } } },
  }
  const compiled = { exports: {} as { GET: (request: Request) => Promise<Response> } }
  class Clock extends Date { constructor(value: string | number = now) { super(value) } static now() { return now } }
  new Function('require', 'module', 'exports', 'Date', output)((name: string) => { assert.ok(name in mocks, name); return mocks[name] }, compiled, compiled.exports, Clock)
  const response = await compiled.exports.GET(new Request('https://www.slipsurge.com/api/cron/nba-market-capture'))
  return { calls, response, body: await response.json() }
}
test('cloud capture persists First Basket separately without suppressing ordinary markets during a feed outage', async () => {
  const healthy = await runCapture()
  assert.equal(healthy.response.status, 200)
  assert.deepEqual(new Set(healthy.calls.map(call => call.args.p_feed)), new Set(['props','game','first']))
  assert.equal(healthy.body.firstBasket.captured, 1)
  const failed = await runCapture(true)
  assert.equal(failed.response.status, 503)
  assert.equal(failed.body.captured, 1)
  assert.equal(failed.body.firstBasket.failed, 1)
  assert.equal(failed.calls.some(call => call.args.p_feed === 'first'), false)
  const failedProps = await runCapture(false, true)
  assert.equal(failedProps.body.firstBasket.captured, 1)
  assert.equal(failedProps.calls.some(call => call.args.p_feed === 'props'), false)
})
test('successful empty feeds record withdrawals; failed feeds cannot erase a tape', async () => {
  const empty = await runCapture(false, false, true)
  assert.equal(empty.response.status, 200)
  for (const call of empty.calls) assert.deepEqual(call.args.p_quotes, [])
})
test('missing events and unmatched or stale first-basket quotes cannot create empty withdrawals', async () => {
  const missing = await runCapture(false, false, true, { eventMatched: false, unmatched: 0 })
  assert.equal(missing.body.firstBasket.deferred, 1)
  assert.equal(missing.calls.some(call => call.args.p_feed === 'first'), false)
  const stale = await runCapture(false, false, true, { eventMatched: true, unmatched: 10 })
  assert.equal(stale.body.firstBasket.failed, 1)
  assert.equal(stale.calls.some(call => call.args.p_feed === 'first'), false)
})
