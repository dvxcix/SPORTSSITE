import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(new URL('../package.json', import.meta.url))
const ts = require('typescript')
const { unstable_doesMiddlewareMatch } = require('next/experimental/testing/server')

function load(path, fixtures) {
  const source = fs.readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8')
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', js)(id => {
    if (id in fixtures) return fixtures[id]
    if (id === 'react/jsx-runtime') return require(id)
    throw Error(`Unexpected dependency ${id}`)
  }, mod, mod.exports)
  return mod.exports
}

test('Next matcher protects dynamic API and MLB paths with image-like suffixes', () => {
  const { config } = load('proxy.ts', { 'next/server': {}, '@/lib/supabase/middleware': { updateSession: () => {} } })
  for (const url of ['/api/dugout/data.png', '/players/123.png', '/mlb/teams/1.webp', '/sports/mlb/849802.png', '/marketplace/id.svg']) {
    assert.equal(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url }), true, url)
  }
  assert.equal(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: '/logo.png' }), false)
})

test('MLB game page stops before auth or provider, including suffix bypass attempts', async () => {
  const halted = Error('not found'), nflContinues = Error('NFL continued')
  let providerCalls = 0
  const page = load('app/sports/[sport]/[gameId]/page.tsx', {
    '@slipsurge/core/espn-api': {}, '@slipsurge/core/mlb-api': { getMLBGameFeed: () => { providerCalls++ } },
    '@/lib/supabase/server': { createClient: () => { throw nflContinues } },
    'next/navigation': { notFound: () => { throw halted } },
    './GameDetailClient': {}, './MLBGameClient': {}, '@/lib/nflGameCenterServer': {}, '@/lib/nbaGameReference': {},
    '@/lib/visiblePickRecords': { hydrateVisibleAuthorRecords: () => { providerCalls++ } },
    '@/lib/mlbOffseason': { MLB_HIBERNATING: true },
  }).default
  for (const gameId of ['849802', '849802.png']) await assert.rejects(page({ params: Promise.resolve({ sport: 'mlb', gameId }) }), error => error === halted)
  await assert.rejects(page({ params: Promise.resolve({ sport: 'nfl', gameId: '123' }) }), error => error === nflContinues)
  assert.equal(providerCalls, 0)
})

test('matrix backtest authenticates before stopping and never starts MLB work', async () => {
  let role = 'anonymous', providerCalls = 0
  const route = load('app/api/admin/matrix-backtest/route.ts', {
    'next/server': { NextResponse: { json: Response.json } },
    '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: role === 'anonymous' ? null : { id: '1' } } }) }, from: () => ({ select() { return this }, eq() { return this }, single: async () => ({ data: { account_type: role } }) }) }) },
    '@/lib/supabase/admin': { createAdminClient: () => { providerCalls++; throw Error('unexpected admin read') } },
    '@/lib/adminMatrixBacktest': { backtestSavedMatrix: () => { providerCalls++; throw Error('unexpected backtest') } },
    '@/lib/mlbOffseason': { MLB_HIBERNATING: true },
  })
  for (const [nextRole, expected] of [['anonymous', 401], ['member', 403], ['admin', 503]]) {
    role = nextRole
    assert.equal((await route.POST(new Request('https://example.test/', { method: 'POST' }))).status, expected)
  }
  assert.equal(providerCalls, 0)
  const native = load('app/api/mobile/admin/matrix-backtest/route.ts', {
    'next/server': { NextResponse: { json: Response.json } },
    '@/lib/supabase/adminDecisionActor': { adminDecisionActor: async () => role === 'admin' ? { admin: {} } : { error: Response.json({}, { status: 403 }) } },
    '@/lib/adminMatrixBacktest': { MAX_RANGE_DAYS: 14, backtestSavedMatrix: () => { providerCalls++; throw Error('unexpected backtest') } },
    '@/lib/mlbOffseason': { MLB_HIBERNATING: true },
  })
  const url = 'https://example.test/api/mobile/admin/matrix-backtest'
  const authorized = new Request(url, { headers: { authorization: 'Bearer fixture' } })
  assert.equal((await native.GET(new Request(url))).status, 401)
  role = 'member'
  assert.equal((await native.GET(authorized)).status, 403)
  assert.equal((await native.POST(authorized)).status, 403)
  role = 'admin'
  assert.deepEqual(await (await native.GET(authorized)).json(), { paused: true, maximumDays: 14 })
  assert.equal((await native.POST(authorized)).status, 503)
  assert.equal(providerCalls, 0)
})

test('the shared date backtest passes the saved pipeline and bounded dates to the original evaluator', async () => {
  const database = {
    from(table) {
      return {
        select() { return this },
        eq(key, value) {
          assert.deepEqual([key, value], table === 'matrices' ? ['element_code', 'EL-TEST-BOOK'] : ['matrix_id', 'fixture'])
          return this
        },
        maybeSingle: async () => ({ data: { id: 'fixture', name: 'Fixture Matrix', matrix_type: 'pipeline' } }),
        order: async () => ({ data: [{ kind: 'filter', field_key: 'hr' }] }),
      }
    },
  }
  const runner = load('lib/adminMatrixBacktest.ts', {
    'server-only': {}, 'next/server': { NextResponse: { json: Response.json } },
    '@slipsurge/core/mlbTeamColors': { getTeamLogoPngUrl: code => `https://example.test/${code}.png` },
    '@/lib/matrixBacktest': { runMatrixBacktest: async (matrix, dates) => {
      assert.deepEqual(matrix.pipeline_steps, [{ kind: 'filter', field_key: 'hr' }])
      assert.equal(dates.length, 14)
      assert.equal(dates[0], '2026-10-01')
      assert.equal(dates.at(-1), '2026-10-14')
      return { dates: [{ date: dates[0], games: [{ homeAbbr: 'LAD', awayAbbr: 'TOR', winners: [], actualHrHitters: [], missDetails: [] }] }],
        aggregate: { precision: 0.5 } }
    } },
  })
  const result = await runner.backtestSavedMatrix(new Request('https://example.test', {
    method: 'POST', body: JSON.stringify({ element_code: 'el-test-book', start_date: '2026-10-01', end_date: '2026-10-25' }),
  }), () => database)
  const data = await result.json()
  assert.equal(data.matrix.element_code, 'EL-TEST-BOOK')
  assert.equal(data.dates[0].games[0].awayLogo, 'https://example.test/TOR.png')
  assert.equal(data.aggregate.precision, 0.5)
})
