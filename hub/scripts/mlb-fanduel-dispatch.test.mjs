import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(new URL('../package.json', import.meta.url)), ts = require('typescript')
const source = fs.readFileSync(new URL('../src/app/api/cron/dispatch-scrapes/route.ts', import.meta.url), 'utf8')
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const good = { result: { imported: { ok: true, body: { marketSummary: { ready: 1 } } } } }
function harness({ retryCount = 0, fdStatus = 200, fdBody = good, timeout = false, live = false, liveAfter = false, queueError = false, publicBody = { failed: 0, results: [{ imported: { ok: true } }] } } = {}) {
  const calls = [], writes = []
  let schedules = 0
  const due = [{ game_pk: 123, retry_count: retryCount }]
  const admin = { from(table) {
    const query = { table, update: null, filters: [] }
    return { update(value) { query.update = value; return this }, is(...value) { query.filters.push(['is', ...value]); return this }, lte(...value) { query.filters.push(['lte', ...value]); return this }, eq(...value) { query.filters.push(['eq', ...value]); return this }, async select() {
      writes.push(query)
      return query.update.dispatched_at === null ? { data: queueError ? null : [{ game_pk: 123 }], error: queueError ? { code: 'unavailable' } : null } : { data: due, error: null }
    } }
  } }
  const mocks = {
    'next/server': { NextResponse: { json: Response.json } }, '@/lib/supabase/admin': { createAdminClient: () => admin }, '@/lib/cron-auth': { requireCronAuth: () => null },
    '@slipsurge/core/mlbSchedule': { getTodaysMatchups: async () => [{ gamePk: 123, status: live || (++schedules > 1 && liveAfter) ? 'Live' : 'Scheduled' }], isPregame: value => value === 'Scheduled' },
    '@/lib/platform': { PLATFORM_URL: 'https://fixture.test' }, '@/lib/scrapers/retryMarkets': { missingOpeningMarkets: summary => summary.ready ? [] : ['fhr_fd'] },
    '@/lib/pipelineHealth': { withPipelineHealth: (_key, fn) => fn }, '@/lib/safeApiError': { safeApiError: () => Response.json({ error: 'fixture' }, { status: 503 }) },
  }
  const fixture = { exports: {} }
  new Function('require', 'module', 'exports', 'fetch', 'AbortSignal', code)(id => {
    if (!(id in mocks)) throw Error('Unexpected dependency ' + id)
    return mocks[id]
  }, fixture, fixture.exports, async (url, init) => {
    calls.push({ url, timeout: init.signal.ms })
    if (url.includes('scrape-pikkit')) return Response.json(publicBody)
    if (timeout) throw Error('request timeout')
    return Response.json(fdBody, { status: fdStatus })
  }, { timeout: ms => ({ ms }) })
  return { ...fixture.exports, calls, writes, async run() { const response = await fixture.exports.GET(new Request('https://fixture.test/api/cron/dispatch-scrapes')); return { status: response.status, body: await response.json() } } }
}

test('dispatcher outlives the 300-second MLB collector and preserves the public request cap', async () => {
  const fixture = harness(), result = await fixture.run()
  assert.equal(fixture.maxDuration, 360)
  assert.match(fs.readFileSync(new URL('../src/app/api/cron/scrape-fanduel/route.ts', import.meta.url), 'utf8'), /maxDuration = 300/)
  assert.equal(fixture.calls.find(call => call.url.includes('scrape-fanduel')).timeout, 330000)
  assert.equal(fixture.calls.find(call => call.url.includes('scrape-pikkit')).timeout, 260000)
  assert.equal(result.status, 200)
  assert.equal(result.body.ok, true)
  assert.deepEqual(result.body.retryQueued, [])
  assert.equal(fixture.writes.length, 1)
})

test('partial and timed-out captures retain game identity and earn exactly one delayed sportsbook retry', async () => {
  for (const options of [{ fdStatus: 502, fdBody: { result: { error: 'incomplete', imported: good.result.imported } } }, { timeout: true }, { fdBody: { result: { imported: { ok: true, body: { marketSummary: {} } } } } }, { fdBody: null }]) {
    const fixture = harness(options), result = await fixture.run()
    assert.equal(result.status, 502)
    assert.equal(result.body.ok, false)
    assert.equal(result.body.results[0].gamePk, 123)
    assert.equal(result.body.retryQueued[0].gamePk, 123)
    assert.equal(fixture.writes[1].update.retry_count, 1)
    assert.equal(fixture.writes[1].filters.some(filter => filter[1] === 'retry_count' && filter[2] === 0), true)
    assert.equal(fixture.writes[1].filters.some(filter => filter[1] === 'dispatched_at' && typeof filter[2] === 'string'), true)
    const retry = harness({ ...options, retryCount: 1 }), second = await retry.run()
    assert.equal(second.status, 502)
    assert.deepEqual(second.body.retryQueued, [])
    assert.equal(retry.writes.length, 1)
    assert.equal(retry.calls.some(call => call.url.includes('scrape-pikkit')), false)
  }
})

test('games already live or live after extraction cannot be queued for another capture', async () => {
  const live = harness({ live: true }), result = await live.run()
  assert.equal(result.status, 200)
  assert.deepEqual(result.body.skippedAlreadyLive, [123])
  assert.equal(live.calls.length, 0)
  const closing = harness({ timeout: true, liveAfter: true }), failed = await closing.run()
  assert.equal(failed.status, 502)
  assert.deepEqual(failed.body.retryQueued, [])
  assert.equal(closing.writes.length, 1)
})

test('queue and public checkpoint failures are reported honestly without duplicating public capture', async () => {
  const failedQueue = harness({ timeout: true, queueError: true }), result = await failedQueue.run()
  assert.equal(result.status, 502)
  assert.deepEqual(result.body.retryFailed, [123])
  assert.deepEqual(result.body.retryQueued, [])
  for (const publicBody of [null, { failed: 1, results: [{ error: 'failed' }] }, { failed: 0, results: [{ partial: true, imported: { ok: true } }] }]) {
    const fixture = harness({ publicBody }), response = await fixture.run()
    assert.equal(response.status, 502)
    assert.equal(response.body.pikkit.ok, false)
    assert.deepEqual(response.body.retryQueued, [])
    assert.equal(fixture.calls.filter(call => call.url.includes('scrape-pikkit')).length, 1)
  }
})
