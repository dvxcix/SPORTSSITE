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
  const { config } = load('proxy.ts', { '@/lib/supabase/middleware': { updateSession: () => {} } })
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
    '@/lib/matrixBacktest': { runMatrixBacktest: () => { providerCalls++; throw Error('unexpected backtest') } },
    '@/lib/mlbOffseason': { MLB_HIBERNATING: true },
  })
  for (const [nextRole, expected] of [['anonymous', 401], ['member', 403], ['admin', 503]]) {
    role = nextRole
    assert.equal((await route.POST(new Request('https://example.test/', { method: 'POST' }))).status, expected)
  }
  assert.equal(providerCalls, 0)
})
