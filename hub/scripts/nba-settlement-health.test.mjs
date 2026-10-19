import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(new URL('../package.json', import.meta.url))
const ts = require('typescript')
function load(file, mocks, clock = Date, abortSignal = AbortSignal) {
  const code = ts.transpileModule(fs.readFileSync(new URL('../src/' + file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const fixtureModule = { exports: {} }
  new Function('require', 'module', 'exports', 'Date', 'AbortSignal', code)(id => {
    if (!(id in mocks)) throw Error(`Unexpected dependency ${id}`)
    return mocks[id]
  }, fixtureModule, fixtureModule.exports, clock, abortSignal)
  return fixtureModule.exports
}
const pick = (id, game = '1') => ({ id, game_pk: game, player_id: 'bdl:1', pick_type: 'points', numeric_line: 20, market_side: 'over' })
function settlementFixture(picks, options = {}) {
  let now = 0
  const attempts = new Map(), settled = [], games = [], requests = [], budgets = new Map()
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])) } static now() { return now } }
  const signals = { timeout(ms) { const controller = new AbortController(); budgets.set(controller.signal, ms); queueMicrotask(() => controller.abort()); return controller.signal } }
  const admin = {
    rpc: (name, args) => ({ abortSignal: async signal => {
      assert.ok(signal instanceof AbortSignal); requests.push({ name, budget: budgets.get(signal) })
      if (options.stalledRpc === name) {
        if (name === 'settle_nba_pick_exact') settled.push(args.p_pick_id)
        return new Promise((_resolve, reject) => signal.addEventListener('abort', () => { now += budgets.get(signal); reject(Error('Timed out')) }, { once: true }))
      }
      if (name === 'claim_pending_nba_picks') { assert.equal(args.p_limit, 200); return { data: [...picks].sort((a, b) => (attempts.get(a.id) ?? -1) - (attempts.get(b.id) ?? -1)), error: null } }
      assert.equal(name, 'settle_nba_pick_exact'); settled.push(args.p_pick_id)
      now += options.settleMs ?? 0
      if (options.writeThrows) throw Error('private database error')
      return { data: true, error: null }
    } }),
    from: table => {
      assert.equal(table, 'nba_settlement_attempts')
      return { upsert: rows => ({ abortSignal: async signal => {
        assert.ok(signal instanceof AbortSignal)
        requests.push({ name: 'checkpoint', budget: budgets.get(signal) })
        if (options.checkpointFails) return { error: { message: 'private error' } }
        rows.forEach(row => attempts.set(row.pick_id, Date.parse(row.checked_at)))
        return { error: null }
      } }) }
    },
  }
  const subject = load('lib/nbaSettlement.ts', {
    'server-only': {}, './nbaPaint': { nbaPeriod: () => 0 }, './nbaPickGrading': { gradeNbaPick: p => options.noResultGame === p.game_pk ? null : 'win' },
    './nbaPaintData': {
      getPaintGame: async (id, fresh) => { assert.equal(fresh, true); games.push(id); now += options.gameMs ?? 0; if (options.providerFails) throw Error('private provider error'); return { status_state: options.live ? 'in_progress' : 'final' } },
      getPaintFinalStats: async () => { now += options.statsMs ?? 0; return { complete: true, rows: [] } },
    },
  }, Clock, signals)
  return { run: deadline => subject.settleNbaPicks(admin, deadline), attempts, settled, games, requests }
}

test('200 selected picks rotate past an unresolved game when the time budget leaves another game unvisited', async () => {
  const picks = Array.from({ length: 200 }, (_, i) => pick(`p${i}`, i < 100 ? '1' : '2'))
  const fixture = settlementFixture(picks, { gameMs: 12_000, noResultGame: '1' })
  const first = await fixture.run()
  assert.equal(first.claimed, 200); assert.equal(first.attempted, 100); assert.equal(first.graded, 0)
  assert.equal(fixture.attempts.size, 100); assert.equal(fixture.attempts.has('p100'), false)
  const second = await fixture.run()
  assert.deepEqual(fixture.games, [1, 2]); assert.equal(second.graded, 100)
  assert.deepEqual(fixture.settled, picks.slice(100).map(p => p.id))
})

test('within-game budget skips and thrown writes do not advance unvisited selections', async () => {
  for (const writeThrows of [false, true]) {
    const fixture = settlementFixture([pick('first'), pick('unvisited')], { settleMs: 46_001, writeThrows })
    const result = await fixture.run()
    assert.equal(result.attempted, 1); assert.deepEqual([...fixture.attempts.keys()], ['first'])
    assert.equal(result.skipped, writeThrows ? 2 : 1)
    assert.ok(result.issues.includes('NBA time budget reached'))
    if (writeThrows) assert.ok(result.issues.includes('NBA atomic settlement failed'))
  }
})

test('nonfinal games and unavailable final data count as attempts without forcing results', async () => {
  for (const options of [{ live: true }, { providerFails: true }]) {
    const fixture = settlementFixture([pick('first'), pick('second', '2')], { gameMs: 12_000, ...options })
    const report = await fixture.run()
    assert.equal(report.graded, 0); assert.equal(report.attempted, 1)
    assert.deepEqual([...fixture.attempts.keys()], ['first']); assert.deepEqual(fixture.settled, [])
  }
})

test('attempt checkpoint failure remains visible and cannot pretend the rotation advanced', async () => {
  const fixture = settlementFixture([pick('first')], { checkpointFails: true })
  const report = await fixture.run()
  assert.equal(report.graded, 1); assert.equal(fixture.attempts.size, 0)
  assert.ok(report.issues.includes('NBA attempt checkpoint failed'))
})

test('an exhausted daily deadline returns deferred without selecting candidates', async () => {
  const fixture = settlementFixture([pick('first')])
  const report = await fixture.run(2_000)
  assert.deepEqual(fixture.requests, []); assert.equal(report.claimed, 0)
  assert.deepEqual(report.issues, ['NBA time budget reached'])
})

test('a stalled selector is aborted after its bounded allowance without grading or checkpoint writes', async () => {
  const fixture = settlementFixture([pick('first')], { stalledRpc: 'claim_pending_nba_picks' })
  const report = await fixture.run()
  assert.deepEqual(fixture.requests, [{ name: 'claim_pending_nba_picks', budget: 5_000 }])
  assert.deepEqual(report.issues, ['NBA pending picks unavailable'])
  assert.equal(report.attempted, 0); assert.deepEqual(fixture.settled, [])
})

test('stalled uncertain writes reserve checkpoint time, never retry inline and leave later selections unvisited', async () => {
  const fixture = settlementFixture([pick('first'), pick('unvisited')], { stalledRpc: 'settle_nba_pick_exact', statsMs: 43_000 })
  const report = await fixture.run()
  assert.deepEqual(fixture.requests, [{ name: 'claim_pending_nba_picks', budget: 5_000 }, { name: 'settle_nba_pick_exact', budget: 3_000 }, { name: 'checkpoint', budget: 2_000 }])
  assert.deepEqual(fixture.settled, ['first']); assert.deepEqual([...fixture.attempts.keys()], ['first'])
  assert.equal(report.graded, 0); assert.equal(report.attempted, 1)
  assert.ok(report.issues.includes('NBA atomic settlement failed')); assert.ok(report.issues.includes('NBA time budget reached'))
})

async function healthResult(job, body, json = true) {
  const writes = []
  const query = { eq() { return this }, lt() { return this }, then(resolve) { resolve({ error: null }) } }
  const admin = { from: () => ({ update: row => { writes.push(row); return query }, insert: async row => { writes.push(row); return { error: null } } }) }
  const subject = load('lib/pipelineHealth.ts', {
    'node:crypto': { randomUUID: () => 'fixture-run' }, '@/lib/supabase/admin': { createAdminClient: () => admin },
    '@/lib/cron-auth': { isCronRequestAuthorized: () => true }, '@/lib/safeApiError': { safeErrorMetadata: () => ({}) },
  })
  const response = await subject.withPipelineHealth(job, async () => json ? Response.json(body) : new Response('malformed'))(new Request(`https://fixture.test/api/cron/${job}`))
  assert.equal(response.status, 200)
  return writes.at(-1)
}
const nba = { claimed: 2, attempted: 2, checked: 2, graded: 1, skipped: 1, issues: [], graded_ids: ['private-pick-id'] }

test('both grading ledgers retain bounded NBA counters without pick IDs or names', async () => {
  for (const job of ['grade-live-picks', 'settle-picks']) {
    const row = await healthResult(job, { nba, notified: ['private-post-id'], graded_ids: ['private-pick-id'], player_name: 'private name' })
    assert.equal(row.status, 'succeeded'); assert.equal(row.error, null)
    assert.deepEqual(row.details.nba, { claimed: 2, attempted: 2, checked: 2, graded: 1, skipped: 1, issues: [] })
    assert.equal(JSON.stringify(row).includes('private'), false)
  }
})

test('partial NBA failures are visible even with HTTP200; deferred data and malformed reports are distinct', async () => {
  for (const [issue, status] of [['NBA period 1 final stats incomplete', 'deferred'], ['NBA time budget reached', 'deferred'], ['NBA atomic settlement failed', 'failed'], ['NBA attempt checkpoint failed', 'failed'], ['private provider secret', 'failed']]) {
    const row = await healthResult('grade-live-picks', { nba: { ...nba, issues: [issue] } })
    assert.equal(row.status, status)
    assert.equal(JSON.stringify(row).includes('private'), false)
  }
  assert.equal((await healthResult('settle-picks', {})).status, 'failed')
  assert.equal((await healthResult('settle-picks', { nba: { issues: [] } })).status, 'failed')
  assert.equal((await healthResult('settle-picks', { nba: { ...nba, attempted: -1 } })).status, 'failed')
  assert.equal((await healthResult('settle-picks', {}, false)).status, 'failed')
})

test('daily settlement returns its actual NBA report for ledger inspection', async () => {
  const query = { select() { return this }, eq() { return this }, not() { return this }, then(resolve) { resolve({ data: [], error: null }) } }
  const route = load('app/api/cron/settle-picks/route.ts', {
    'next/server': { NextResponse: { json: Response.json } }, '@/lib/pipelineHealth': { withPipelineHealth: (_job, handler) => handler },
    '@/lib/supabase/admin': { createAdminClient: () => ({ from: () => query }) }, '@/lib/cron-auth': { requireCronAuth: () => null },
    '@/lib/watchlist': { PROP_META: {} }, '@/lib/pickGrading': {}, '@/lib/safeApiError': {}, '@/lib/nflPickGrading': {}, '@/app/the-sideline/kickoff': {},
    '@/lib/nbaSettlement': { settleNbaPicks: async () => nba },
  })
  const body = await (await route.GET(new Request('https://fixture.test/api/cron/settle-picks'))).json()
  assert.deepEqual(body.nba, nba); assert.equal(body.graded, 1)
})
