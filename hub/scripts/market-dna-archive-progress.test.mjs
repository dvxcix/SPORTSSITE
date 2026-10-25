import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(new URL('../package.json', import.meta.url))
const ts = require('typescript')
function load(file, mocks = {}) {
  const source = fs.readFileSync(new URL('../src/' + file, import.meta.url), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)(id => {
    if (!(id in mocks)) throw Error(`Unexpected dependency ${id}`)
    return mocks[id]
  }, module, module.exports)
  return module.exports
}
const progress = load('lib/marketDnaArchiveProgress.ts')
const strict = progress.STRICT_ARCHIVE_VERSION
const coverage = [{ game_date: '2026-10-19', source_version: strict }]

test('verified empty dates advance through a no-game gap without inventing training rows', () => {
  const first = progress.planArchiveDates(coverage, [], '2026-10-24')
  assert.deepEqual(first.forward, ['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24'])
  const empty = first.forward.slice(0, 4).map(game_date => ({ game_date, status: 'no_games' }))
  assert.deepEqual(progress.planArchiveDates(coverage, empty, '2026-10-24').forward, ['2026-10-24'])
})

test('later checkpoints cannot hide unvisited dates and incomplete dates survive newer captures', () => {
  assert.equal(progress.planArchiveDates(coverage, [{ game_date: '2026-10-22', status: 'no_games' }], '2026-10-24').forward[0], '2026-10-20')
  const plan = progress.planArchiveDates([...coverage, { game_date: '2026-10-24', source_version: strict }], [{ game_date: '2026-10-23', status: 'incomplete' }], '2026-10-25')
  assert.deepEqual(plan.retry, ['2026-10-23'])
  assert.deepEqual(plan.forward, ['2026-10-25'])
})

test('no existing rows starts at the configured boundary and each forward scan is bounded', () => {
  const plan = progress.planArchiveDates([], [], '2026-10-24')
  assert.equal(plan.forward[0], '2026-07-16')
  assert.equal(plan.forward.length, 31)
  assert.deepEqual(progress.planArchiveDates([], [], '2026-07-15').forward, [])
})

test('a validated zero-game schedule differs from a missing or truncated response', () => {
  assert.deepEqual([...progress.parseArchiveSchedule({ totalGames: 0, dates: [] }, '2026-10-20', '2026-10-21')], [['2026-10-20', []], ['2026-10-21', []]])
  for (const bad of [{}, { dates: [] }, { totalGames: 1, dates: [] }, { totalGames: 0, dates: null }]) {
    assert.throws(() => progress.parseArchiveSchedule(bad, '2026-10-20', '2026-10-21'), /invalid/)
  }
})

test('schedule rejects duplicate games, incorrect dates and mismatched totals', () => {
  const game = { gamePk: 849802, officialDate: '2026-10-24' }
  const valid = { totalGames: 1, dates: [{ date: '2026-10-24', totalGames: 1, games: [game] }] }
  assert.deepEqual(progress.parseArchiveSchedule(valid, '2026-10-24', '2026-10-24').get('2026-10-24'), [849802])
  for (const bad of [
    { totalGames: 2, dates: [{ date: '2026-10-24', games: [game, game] }] },
    { totalGames: 1, dates: [{ date: '2026-10-25', games: [game] }] },
    { totalGames: 1, dates: [{ date: '2026-10-24', games: [{ ...game, officialDate: '2026-10-23' }] }] },
    { totalGames: 1, dates: [{ date: '2026-10-24', totalGames: 2, games: [game] }] },
  ]) assert.throws(() => progress.parseArchiveSchedule(bad, '2026-10-24', '2026-10-24'), /invalid/)
})

test('HTTP failures never become verified empty dates', async () => {
  const original = globalThis.fetch
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.cache, 'no-store')
    assert.ok(options.signal)
    return new Response('', { status: 503 })
  }
  try { await assert.rejects(progress.readArchiveSchedule('2026-10-24', '2026-10-24'), /HTTP 503/) }
  finally { globalThis.fetch = original }
})

test('same counts with wrong game identities, skipped boards, or missing players are incomplete', () => {
  const valid = { games: 2, players: 36, skipped: 0, gameIds: [1, 2] }
  assert.equal(progress.archiveResultComplete([1, 2], valid), true)
  for (const bad of [{ ...valid, gameIds: [1, 3] }, { ...valid, gameIds: [1, 1] }, { ...valid, players: 35 }, { ...valid, skipped: 1 }, { ...valid, games: 1 }]) {
    assert.equal(progress.archiveResultComplete([1, 2], bad), false)
  }
  assert.equal(progress.archiveResultComplete([], { games: 0, players: 0, skipped: 0, gameIds: [] }), false)
})

function routeFixture({ scheduleFailure = false, incomplete = false, archiveFailure = false, progressFailure = false, writeFailure = false, gameDates = ['2026-10-24'] } = {}) {
  const writes = [], archived = [], current = []
  const admin = { from(table) {
    return {
      select() { return this }, gte() { return this }, lte() { return this }, eq() { return this }, order() { return this },
      range: async () => ({ data: coverage, error: null }),
      limit: async () => ({ data: current, error: progressFailure ? Error('checkpoint read failed') : null }),
      upsert: async rows => { assert.equal(table, 'market_dna_archive_progress'); writes.push(...(Array.isArray(rows) ? rows : [rows])); return { error: writeFailure ? Error('checkpoint write failed') : null } },
    }
  } }
  const route = load('app/api/cron/market-dna-maintenance/route.ts', {
    'next/server': { NextResponse: { json: (data, init) => Response.json(data, init) } },
    '@/lib/cron-auth': { requireCronAuth: () => null },
    '@/lib/pipelineHealth': { withPipelineHealth: (_, handler) => handler },
    '@/lib/supabase/admin': { createAdminClient: () => admin },
    '@/lib/marketDnaArchiveProgress': { ...progress, readArchiveSchedule: async (start, end) => {
      if (scheduleFailure) throw Error('schedule unavailable')
      const result = new Map()
      for (let date = start; date <= end; date = progress.shiftArchiveDate(date, 1)) result.set(date, gameDates.includes(date) ? [849802] : [])
      return result
    } },
    '@/lib/marketDna': { archiveMarketDnaDate: async date => {
      archived.push(date)
      if (archiveFailure) throw Error('archive unavailable')
      return { date, games: incomplete ? 0 : 1, players: incomplete ? 0 : 18, skipped: incomplete ? 1 : 0, gameIds: incomplete ? [] : [849802] }
    } },
  })
  return { writes, archived, current, route }
}

async function runFixture(fixture) {
  const Original = globalThis.Date
  globalThis.Date = class extends Original {
    constructor(...args) { super(...(args.length ? args : ['2026-10-25T08:00:00Z'])) }
    static now() { return new Original('2026-10-25T08:00:00Z').valueOf() }
  }
  try { return await fixture.route.GET(new Request('https://fixture.test/api/cron/market-dna-maintenance')) }
  finally { globalThis.Date = Original }
}

test('archive cron checkpoints verified empty days, then completes the exact next game', async () => {
  const fixture = routeFixture()
  const response = await runFixture(fixture)
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.deepEqual(fixture.archived, ['2026-10-24'])
  assert.equal(fixture.writes.filter(row => row.status === 'no_games').length, 4)
  assert.ok(fixture.writes.slice(0, -1).some(row => row.status === 'incomplete'))
  assert.equal(fixture.writes.at(-1).status, 'complete')
  assert.deepEqual(body.coverage.completedDates, ['2026-10-24'])
  assert.equal(body.strictDates, 2)
})

test('schedule/checkpoint read failure cannot record progress or run reconstruction', async () => {
  for (const options of [{ scheduleFailure: true }, { progressFailure: true }]) {
    const fixture = routeFixture(options)
    await assert.rejects(runFixture(fixture), /unavailable|failed/)
    assert.equal(fixture.writes.length, 0)
    assert.equal(fixture.archived.length, 0)
  }
})

test('partial and interrupted archives remain retryable and do not inflate strict coverage', async () => {
  const partial = routeFixture({ incomplete: true })
  const response = await runFixture(partial)
  assert.equal(response.status, 425)
  assert.equal((await response.json()).strictDates, 1)
  assert.equal(partial.writes.at(-1).status, 'incomplete')
  const failed = routeFixture({ archiveFailure: true })
  await assert.rejects(runFixture(failed), /archive unavailable/)
  assert.equal(failed.writes.at(-1).status, 'incomplete')
})

test('archive reconstruction stays capped at two dates while leaving later games unclaimed', async () => {
  const fixture = routeFixture({ gameDates: ['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24'] })
  assert.equal((await runFixture(fixture)).status, 200)
  assert.deepEqual(fixture.archived.sort(), ['2026-10-20', '2026-10-21'])
  assert.ok(fixture.writes.every(row => row.game_date <= '2026-10-21'))
})

test('a missing durable attempt checkpoint stops reconstruction before partial archive writes', async () => {
  const fixture = routeFixture({ writeFailure: true })
  await assert.rejects(runFixture(fixture), /checkpoint write failed/)
  assert.equal(fixture.archived.length, 0)
})
