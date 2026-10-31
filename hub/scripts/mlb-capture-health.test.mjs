import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(new URL('../package.json', import.meta.url))
const ts = require('typescript')
function load(file, mocks, fetchFixture) {
  const code = ts.transpileModule(fs.readFileSync(new URL('../src/' + file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const fixtureModule = { exports: {} }
  new Function('require', 'module', 'exports', 'fetch', code)(id => {
    if (id === '@/lib/mlbOffseason' && !(id in mocks)) return { isMlbCronPaused: () => false }
    if (!(id in mocks)) throw Error(`Unexpected dependency ${id}`)
    return mocks[id]
  }, fixtureModule, fixtureModule.exports, fetchFixture)
  return fixtureModule.exports
}

const zeroCounts = { games: 0, pregame: 0, due: 0, browserSessions: 0, succeeded: 0, failed: 0, skipped: 0, rowsImported: 0 }
const coverage = { marketCount: 8, playerCount: 18, rowCount: 90, complete: true, hasHomeRuns: true }

async function recordResponse(handler) {
  const writes = []
  const query = { eq() { return this }, lt() { return this }, then(resolve) { resolve({ error: null }) } }
  const admin = { from: () => ({ update: row => { writes.push(row); return query }, insert: async row => { writes.push(row); return { error: null } } }) }
  const { withPipelineHealth } = load('lib/pipelineHealth.ts', {
    'node:crypto': { randomUUID: () => 'fixture-run' }, '@/lib/supabase/admin': { createAdminClient: () => admin },
    '@/lib/cron-auth': { isCronRequestAuthorized: () => true }, '@/lib/safeApiError': { safeErrorMetadata: () => ({}) },
  })
  const response = await withPipelineHealth('poll-pikkit-picks', handler)(new Request('https://fixture.test/api/cron/poll-pikkit-picks'))
  return { response, row: writes.at(-1) }
}

function pollFixture(hoursUntilGame, captureResult) {
  const calls = []
  const game = { gamePk: 849802, gameKey: 'TB@MIL', status: 'Scheduled', gameDate: new Date(Date.now() + hoursUntilGame * 3_600_000).toISOString() }
  const { GET } = load('app/api/cron/poll-pikkit-picks/route.ts', {
    'next/server': { NextResponse: { json: Response.json } },
    '@/lib/pipelineHealth': { withPipelineHealth: (_job, handler) => handler },
    '@/lib/cron-auth': { requireBrowserbaseCronAuth: () => null },
    '@slipsurge/core/mlbSchedule': { getTodaysMatchups: async () => hoursUntilGame == null ? [] : [game], isPregame: () => true },
    '@/lib/platform': { PLATFORM_URL: 'https://fixture.test' },
    '@/lib/scrapers/pikkitAuth': { PIKKIT_SIGNED_OUT_ERROR: 'fixture-auth-error', checkPikkitAuthAndAlert: async () => 'valid', checkPikkitImportHealthAndAlert: async () => {} },
    '@/lib/pikkitCaptureSchedule': load('lib/pikkitCaptureSchedule.ts', {}),
    '@/lib/pikkitCoverage': load('lib/pikkitCoverage.ts', {}),
    '@/lib/mlbPublicCapture': { getMlbPublicReceipts: async () => { calls.push('primary-receipts'); return new Map() } },
  }, async url => {
    calls.push(String(url))
    assert.equal(String(url), 'https://fixture.test/api/cron/scrape-pikkit?gamePks=849802')
    return Response.json({ results: [captureResult] })
  })
  return { GET, calls }
}

test('no-pregame route and ledger explicitly record zero captures without any source request', async () => {
  const fixture = pollFixture(null)
  const { response, row } = await recordResponse(fixture.GET)
  assert.equal(response.status, 200)
  assert.equal((await response.json()).reason, 'no-pregame-games')
  assert.equal(row.status, 'succeeded')
  assert.equal(row.records_processed, 0)
  for (const [key, value] of Object.entries(zeroCounts)) assert.equal(row.details[key], value)
  assert.equal(row.details.reason, 'no-pregame-games')
  assert.deepEqual(fixture.calls, [])
})

test('not-yet-due pregame is distinguishable from an imported capture and retains bounded checkpoint evidence', async () => {
  const previous = process.env.MLB_PARTY_SERVICE_ROLE_KEY
  process.env.MLB_PARTY_SERVICE_ROLE_KEY = 'fixture-only-not-a-credential'
  try {
    const fixture = pollFixture(20)
    const { response, row } = await recordResponse(fixture.GET)
    assert.equal(response.status, 200)
    assert.equal(row.details.reason, 'no-captures-due')
    assert.equal(row.details.games, 1)
    assert.equal(row.details.pregame, 1)
    assert.equal(row.details.due, 0)
    assert.equal(row.details.browserSessions, 0)
    assert.equal(row.records_processed, 0)
    assert.equal(row.details.decisions[0].reason, 'fresh-for-current-slot')
    assert.equal(row.details.decisions[0].capture.capturedAt, null)
    assert.equal(fixture.calls.length, 1)
  } finally {
    if (previous == null) delete process.env.MLB_PARTY_SERVICE_ROLE_KEY
    else process.env.MLB_PARTY_SERVICE_ROLE_KEY = previous
  }
})

test('a real successful import response records imported rows and completed captures', async () => {
  const previous = process.env.MLB_PARTY_SERVICE_ROLE_KEY
  process.env.MLB_PARTY_SERVICE_ROLE_KEY = 'fixture-only-not-a-credential'
  try {
    const fixture = pollFixture(3, { imported: { ok: true, body: { rowsImported: 90 } }, coverage })
    const { response, row } = await recordResponse(fixture.GET)
    assert.equal(response.status, 200)
    assert.equal(row.status, 'succeeded')
    assert.equal(row.details.reason, 'captures-imported')
    assert.equal(row.details.due, 1)
    assert.equal(row.details.succeeded, 1)
    assert.equal(row.details.failed, 0)
    assert.equal(row.details.browserSessions, 1)
    assert.equal(row.records_processed, 90)
    assert.equal(row.details.rowsImported, 90)
    assert.equal(row.details.decisions[0].reason, 't-4h')
    assert.equal(fixture.calls.length, 2)
  } finally {
    if (previous == null) delete process.env.MLB_PARTY_SERVICE_ROLE_KEY
    else process.env.MLB_PARTY_SERVICE_ROLE_KEY = previous
  }
})

test('partial failed captures keep counts while excluding raw private errors and unbounded provider data', async () => {
  const decision = { gamePk: 849802, gameKey: 'TB@MIL', due: true, reason: 't-4h', slotHours: 4, targetAt: '2026-10-24T12:00:00.000Z', capture: { ...coverage, capturedAt: 1792828800000, player_name: 'private-name' }, secret: 'private-secret' }
  const body = { ...zeroCounts, games: 2, pregame: 2, due: 2, browserSessions: 1, succeeded: 1, failed: 1, rowsImported: 90,
    reason: 'private-provider-error', results: [{ token: 'private-token' }], decisions: Array.from({ length: 100 }, () => decision) }
  const { row } = await recordResponse(async () => Response.json(body, { status: 502 }))
  assert.equal(row.status, 'failed')
  assert.equal(row.records_processed, 90)
  assert.equal(row.details.reason, 'capture-failed')
  assert.equal(row.error, 'MLB public capture failed')
  assert.equal(row.details.decisions.length, 30)
  assert.equal(row.details.decisions[0].capture.rowCount, 90)
  assert.equal(JSON.stringify(row).includes('private'), false)
})

test('HTTP200 import with a missing response body cannot claim completed capture rows', async () => {
  const previous = process.env.MLB_PARTY_SERVICE_ROLE_KEY
  process.env.MLB_PARTY_SERVICE_ROLE_KEY = 'fixture-only-not-a-credential'
  try {
    const fixture = pollFixture(3, { imported: { ok: true, body: null }, coverage })
    const { response, row } = await recordResponse(fixture.GET)
    assert.equal(response.status, 200, 'telemetry must preserve the collector response')
    assert.equal(row.details.succeeded, 1)
    assert.equal(row.details.rowsImported, 0)
    assert.equal(row.status, 'failed')
    assert.equal(row.details.reason, 'capture-report-incomplete')
    assert.equal(row.error, 'MLB public capture report incomplete')
  } finally {
    if (previous == null) delete process.env.MLB_PARTY_SERVICE_ROLE_KEY
    else process.env.MLB_PARTY_SERVICE_ROLE_KEY = previous
  }
})

test('contradictory successful and no-due reports cannot claim healthy captures', async () => {
  for (const body of [
    { ...zeroCounts, games: 1, pregame: 1, due: 1, rowsImported: 90 },
    { ...zeroCounts, games: 1, pregame: 1, due: 1, succeeded: 2, rowsImported: 90 },
    { ...zeroCounts, games: 1, pregame: 1, rowsImported: 90 },
    { ...zeroCounts, games: 1, pregame: 1, browserSessions: 1 },
    { ...zeroCounts, games: 1, pregame: 2 },
  ]) {
    const { row } = await recordResponse(async () => Response.json(body))
    assert.equal(row.status, 'failed')
    assert.equal(row.details.reason, 'capture-report-incomplete')
  }
})

test('doubleheader decisions preserve their exact second-game key', async () => {
  const { row } = await recordResponse(async () => Response.json({ ...zeroCounts, games: 2, pregame: 2, decisions: [
    { gamePk: 849802, gameKey: 'TB@MIL-G2', due: false, reason: 'fresh-for-current-slot', capture: coverage },
  ] }))
  assert.equal(row.status, 'succeeded')
  assert.equal(row.details.decisions[0].gameKey, 'TB@MIL-G2')
})

test('malformed and negative-count reports cannot be marked as successful captures', async () => {
  for (const body of [{}, { ...zeroCounts, rowsImported: -1 }, { ...zeroCounts, games: Number.MAX_SAFE_INTEGER + 1 }]) {
    const { row } = await recordResponse(async () => Response.json(body))
    assert.equal(row.status, 'failed')
    assert.equal(row.details.reason, 'capture-report-incomplete')
  }
  const { row } = await recordResponse(async () => new Response('not-json'))
  assert.equal(row.status, 'failed')
})

test('unknown decision values cannot copy response content into operational metadata', async () => {
  const { row } = await recordResponse(async () => Response.json({ ...zeroCounts, decisions: [
    { gamePk: 849802, gameKey: 'TB@MIL', reason: 'private-reason', targetAt: 'private-url', capture: { capturedAt: 'private-time', rowCount: -1 } },
    { gamePk: 849802, gameKey: 'private-game-key', reason: 't-4h' },
  ] }))
  assert.equal(row.details.decisions.length, 1)
  assert.equal(row.details.decisions[0].reason, 'unknown')
  assert.equal(JSON.stringify(row).includes('private'), false)
})
