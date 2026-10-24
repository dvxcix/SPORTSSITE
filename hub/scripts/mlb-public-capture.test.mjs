import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(new URL('../package.json', import.meta.url))
const ts = require('typescript')

function load(file, mocks, fetchFixture) {
  const compiled = ts.transpileModule(fs.readFileSync(new URL('../src/' + file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const fixture = { exports: {} }
  new Function('require', 'module', 'exports', 'fetch', compiled)(id => {
    if (!(id in mocks)) throw Error('Unexpected dependency ' + id)
    return mocks[id]
  }, fixture, fixture.exports, fetchFixture)
  return fixture.exports
}
const responseQuery = value => ({ abortSignal() { return this }, then(resolve) { resolve(value) } })
const row = (playerName, market, picks) => ({ playerName, market, picks })
function captureHarness({ games, rpcResult, receiptRows = [], receiptError = null } = {}) {
  const calls = [], date = new Date().toISOString().slice(0, 10), start = new Date(Date.now() + 3_600_000).toISOString()
  const schedule = games ?? [{ gamePk: 123, gameDate: start, status: { abstractGameState: 'Preview', detailedState: 'Scheduled' }, teams: { away: { team: { abbreviation: 'TBR', name: 'Tampa Bay Rays' } }, home: { team: { abbreviation: 'MIL', name: 'Milwaukee Brewers' } } } }]
  const admin = { rpc(name, args) { calls.push({ name, args }); return responseQuery(rpcResult?.(name, args) ?? { data: name.startsWith('finish') ? { changed: true, rows: args.p_rows.length, observedAt: new Date().toISOString() } : true, error: null }) },
    from(table) { calls.push({ table }); return { select() { return this }, eq() { return this }, not() { return this }, limit() { return this }, ...responseQuery({ data: receiptRows, error: receiptError }) } } }
  const api = load('lib/mlbPublicCapture.ts', { 'server-only': {}, 'node:crypto': { randomUUID: () => 'test-token' }, './supabase/admin': { createAdminClient: () => admin }, './nbaSharedCache': { nbaSharedCache: async (_key, _ttl, _stale, callback) => ({ value: await callback() }) } }, async url => {
    calls.push({ url: String(url) }); return Response.json({ dates: [{ date, games: schedule }] })
  })
  const input = { gameDate: date, gameKey: 'TB@MIL', awayTeam: 'Tampa Bay Rays', homeTeam: 'Milwaukee Brewers', capturedAt: new Date(Date.now() - 5000).toISOString() }
  return { api, input, calls, schedule, start }
}

test('writer binds exact official game, source observation, normalized rows and same lease token', async () => {
  const { api, input, calls } = captureHarness()
  const session = await api.beginMlbPublicCapture(input, [row('Z Player', 'home_runs', 3), row('A Player', 'hits', 0)])
  session.assertWritable()
  assert.equal((await session.finish()).changed, true)
  await session.cancel()
  assert.equal(calls.find(call => call.name === 'begin_mlb_public_capture').args.p_observed_at, input.capturedAt)
  assert.deepEqual(calls.find(call => call.name === 'finish_mlb_public_capture').args.p_rows, [row('A Player', 'hits', 0), row('Z Player', 'home_runs', 3)])
  assert.equal(calls.filter(call => call.name).every(call => call.args.p_token === 'test-token'), true)
  assert.equal(calls.filter(call => call.url).length, 1)
})

test('date, orientation, ambiguity, doubleheader leg, absent clock and started games fail closed before reservation', async () => {
  for (const change of [input => ({ ...input, gameDate: 'bad-date' }), input => ({ ...input, homeTeam: input.awayTeam }), input => ({ ...input, gameKey: 'TB@MIL-G2' }), input => ({ ...input, capturedAt: '' }), input => ({ ...input, capturedAt: new Date(Date.now() - 700000).toISOString() })]) {
    const { api, input, calls } = captureHarness()
    await assert.rejects(api.beginMlbPublicCapture(change(input), [row('Player', 'hits', 3)]))
    assert.equal(calls.some(call => call.name), false)
  }
  const fixture = captureHarness()
  for (const games of [[fixture.schedule[0], fixture.schedule[0]], [{ ...fixture.schedule[0], gameDate: new Date(Date.now() - 1).toISOString() }], [{ ...fixture.schedule[0], status: { abstractGameState: 'Live' } }]]) {
    const { api, input, calls } = captureHarness({ games })
    await assert.rejects(api.beginMlbPublicCapture(input, [row('Player', 'hits', 3)]))
    assert.equal(calls.some(call => call.name), false)
  }
  const second = captureHarness({ games: [{ ...fixture.schedule[0], gamePk: 124, gameNumber: 2 }] })
  await second.api.beginMlbPublicCapture({ ...second.input, gameKey: 'TB@MIL-G2' }, [row('Player', 'hits', 3)])
  assert.equal(second.calls.find(call => call.name).args.p_game_id, 124)
  const abbreviated = captureHarness()
  await abbreviated.api.beginMlbPublicCapture({ ...abbreviated.input, awayTeam: 'TB', homeTeam: 'MIL' }, [row('Player', 'hits', 3)])
  assert.equal(abbreviated.calls.find(call => call.name).args.p_game_id, 123)
})

test('busy reservation, bad rows and archive failure cannot report successful capture', async () => {
  const busy = captureHarness({ rpcResult: () => ({ data: false, error: null }) })
  await assert.rejects(busy.api.beginMlbPublicCapture(busy.input, [row('Player', 'hits', 3)]))
  const fixture = captureHarness({ rpcResult: name => name.startsWith('finish') ? { data: null, error: { message: 'database failure' } } : undefined })
  for (const rows of [[], [row('Player', 'hits', -1)], [row('Player', 'hits', 1), row('Player', 'hits', 2)]]) await assert.rejects(fixture.api.beginMlbPublicCapture(fixture.input, rows))
  assert.equal(fixture.calls.length, 0)
  const session = await fixture.api.beginMlbPublicCapture(fixture.input, [row('Player', 'hits', 3)])
  await assert.rejects(session.finish(), /history could not save/)
})

test('current-row write cannot start inside its 30-second timeout window before first pitch', async () => {
  const fixture = captureHarness()
  const closing = captureHarness({ games: [{ ...fixture.schedule[0], gameDate: new Date(Date.now() + 20000).toISOString() }] })
  const session = await closing.api.beginMlbPublicCapture(closing.input, [row('Player', 'hits', 3)])
  assert.throws(() => session.assertWritable(), /window closed/)
})

test('movement uses latest two exact pregame snapshots, real zero counts and null missing baselines', () => {
  const { api } = captureHarness(), now = Date.now()
  const old = { game_id: 1, game_key: 'TB@MIL', starts_at: new Date(now + 1000).toISOString(), captured_at: new Date(now - 60000).toISOString(), rows: [row('Player A', 'hits', 5), row('Player A', 'home_runs', 0), row('Removed', 'hits', 99)] }
  const recent = { ...old, captured_at: new Date(now - 1000).toISOString(), rows: [row('Player A', 'hits', 8), row('Player A', 'home_runs', 0), row('New', 'hits', 2)] }
  const nextGame = { ...recent, game_id: 2, game_key: 'TB@MIL-G2', rows: [row('Player A', 'hits', 100)] }
  const late = { ...recent, game_id: 3, captured_at: new Date(now - 1000).toISOString(), starts_at: new Date(now - 2000).toISOString() }
  const output = api.mlbPublicMovement([old, nextGame, recent, late]).rows
  assert.equal(output.length, 4)
  assert.equal(output.find(r => r.gameKey === 'TB@MIL' && r.market === 'hits' && r.playerName === 'Player A').delta, 3)
  assert.equal(output.find(r => r.market === 'home_runs').delta, 0)
  assert.equal(output.find(r => r.playerName === 'New').previous, null)
  assert.equal(output.find(r => r.gameKey.endsWith('G2')).delta, null)
  assert.equal(output.some(r => r.playerName === 'Removed'), false)
})

test('primary receipts are batched, exclude invalid cutoff and fail instead of converting DB errors to empty history', async () => {
  const { api, calls, input } = captureHarness({ receiptRows: [{ game_key: 'TB@MIL', starts_at: new Date(Date.now() + 1000).toISOString(), observed_at: new Date(Date.now() - 1000).toISOString(), coverage: { complete: true } }, { game_key: 'TB@MIL-G2', starts_at: new Date(Date.now() - 10000).toISOString(), observed_at: new Date().toISOString() }] })
  const receipts = await api.getMlbPublicReceipts(input.gameDate)
  assert.equal(receipts.size, 1)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].table, 'mlb_public_capture_state')
  const failed = captureHarness({ receiptError: { code: 'unavailable' } })
  await assert.rejects(failed.api.getMlbPublicReceipts(failed.input.gameDate), /freshness unavailable/)
})

function importerHarness({ legacyOk = true, legacyUncertain = false, archiveFails = false, reserveFails = false, writable = true } = {}) {
  const actions = []
  const api = load('app/api/admin/pikkit-import/route.ts', {
    'next/server': { NextResponse: { json: Response.json } }, '@/lib/supabase/server': { createClient: async () => { throw Error('Unexpected member auth') } },
    '@/lib/safeApiError': { safeApiError: (_scope, _metadata, message, status) => Response.json({ error: message }, { status }) },
    '@/lib/pikkitImportValidation': { isValidPikkitGameMetadata: () => true },
    '@/lib/mlbPublicCapture': { beginMlbPublicCapture: async (input, rows) => {
      actions.push({ name: 'reserve', input, rows }); if (reserveFails) throw Error('busy')
      return { assertWritable: () => { if (!writable) throw Error('tipoff') }, finish: async () => { actions.push({ name: 'archive' }); if (archiveFails) throw Error('archive failed'); return { changed: true, observedAt: input.capturedAt, rows: rows.length } }, cancel: async () => { actions.push({ name: 'release' }) } }
    } },
  }, async () => { actions.push({ name: 'legacy' }); if (legacyUncertain) throw Error('Network timeout with unknown completion'); return new Response(null, { status: legacyOk ? 201 : 503 }) })
  return { ...api, actions }
}
test('import success requires current write then archive; all failure paths preserve honest status and cleanup', async () => {
  const oldCron = process.env.CRON_SECRET, oldLegacy = process.env.MLB_PARTY_SERVICE_ROLE_KEY
  process.env.CRON_SECRET = 'fixture-cron'; process.env.MLB_PARTY_SERVICE_ROLE_KEY = 'fixture-legacy'
  try {
    for (const [settings, status, sequence] of [[{}, 200, ['reserve', 'legacy', 'archive', 'release']], [{ legacyOk: false }, 502, ['reserve', 'legacy', 'release']], [{ legacyUncertain: true }, 502, ['reserve', 'legacy']], [{ archiveFails: true }, 502, ['reserve', 'legacy', 'archive']], [{ reserveFails: true }, 503, ['reserve']], [{ writable: false }, 502, ['reserve', 'release']]]) {
      const fixture = importerHarness(settings)
      const response = await fixture.POST(new Request('https://fixture.test/api/admin/pikkit-import', { method: 'POST', headers: { authorization: 'Bearer fixture-cron', 'content-type': 'application/json' }, body: JSON.stringify({ gameDate: '2026-10-24', gameKey: 'TB@MIL', awayTeam: 'Tampa Bay Rays', homeTeam: 'Milwaukee Brewers', json: { capturedAt: '2026-10-24T07:00:00.000Z', props: { hr: { 'Player A': 2 }, hits: { 'Player A': 0 } } } }) }))
      assert.equal(response.status, status)
      assert.deepEqual(fixture.actions.map(action => action.name), sequence)
      assert.equal(fixture.actions[0].rows[0].market, 'home_runs')
      if (status !== 200) assert.equal((await response.json()).ok, undefined)
    }
  } finally {
    if (oldCron == null) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = oldCron
    if (oldLegacy == null) delete process.env.MLB_PARTY_SERVICE_ROLE_KEY; else process.env.MLB_PARTY_SERVICE_ROLE_KEY = oldLegacy
  }
})

test('untimestamped or malformed manual payload is rejected as input without reserving or writing', async () => {
  const oldCron = process.env.CRON_SECRET, oldLegacy = process.env.MLB_PARTY_SERVICE_ROLE_KEY
  process.env.CRON_SECRET = 'fixture-cron'; process.env.MLB_PARTY_SERVICE_ROLE_KEY = 'fixture-legacy'
  try {
    for (const capturedAt of [undefined, null, '', 'not-a-date']) {
      const fixture = importerHarness()
      const response = await fixture.POST(new Request('https://fixture.test/api/admin/pikkit-import', { method: 'POST', headers: { authorization: 'Bearer fixture-cron', 'content-type': 'application/json' }, body: JSON.stringify({ gameDate: '2026-10-24', gameKey: 'TB@MIL', awayTeam: 'Tampa Bay Rays', homeTeam: 'Milwaukee Brewers', json: { capturedAt, props: { hits: { 'Player A': 2 } } } }) }))
      assert.equal(response.status, 400)
      assert.equal((await response.json()).error, 'Capture timestamp missing or invalid')
      assert.deepEqual(fixture.actions, [])
    }
  } finally {
    if (oldCron == null) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = oldCron
    if (oldLegacy == null) delete process.env.MLB_PARTY_SERVICE_ROLE_KEY; else process.env.MLB_PARTY_SERVICE_ROLE_KEY = oldLegacy
  }
})
