import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(new URL('../package.json', import.meta.url))
const ts = require('typescript')

test('MLB name diagnostic authenticates and stops before external reads in hibernation', async () => {
  const source = fs.readFileSync(new URL('../src/app/api/admin/dugout-name-check/route.ts', import.meta.url), 'utf8')
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  let authenticated = false, calls = 0
  const fixtures = {
    'next/server': { NextResponse: { json: Response.json } },
    '@/lib/mlbOffseason': { MLB_HIBERNATING: true, mlbPausedResponse: status => Response.json({ paused: true }, { status }) },
    '@/lib/supabase/server': { createClient: async () => ({
      auth: { getUser: async () => ({ data: { user: authenticated ? { id: 'admin' } : null } }) },
      from: () => ({ select() { return this }, eq() { return this }, single: async () => ({ data: { account_type: 'admin' } }) }),
    }) },
    '@slipsurge/core/nameNorm': {},
  }
  const fixtureModule = { exports: {} }
  new Function('require', 'module', 'exports', js)(id => { if (!(id in fixtures)) throw Error(`Unexpected dependency ${id}`); return fixtures[id] }, fixtureModule, fixtureModule.exports)
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => { calls++; throw Error('unexpected MLB source') }
  try {
    assert.equal((await fixtureModule.exports.GET(new Request('https://example.test/'))).status, 401)
    authenticated = true
    const response = await fixtureModule.exports.GET(new Request('https://example.test/'))
    assert.equal(response.status, 503)
    assert.deepEqual(await response.json(), { paused: true })
    assert.equal(calls, 0)
  } finally { globalThis.fetch = originalFetch }
})

test('MLB intelligence stops before analysis, and shared browser login navigates to NBA', async () => {
  let called = 0, destination = null
  const fixtures = {
    'next/server': { NextResponse: { json: Response.json } },
    '@/lib/mlbOffseason': { MLB_HIBERNATING: true, mlbPausedResponse: status => Response.json({ paused: true }, { status }) },
    '@/lib/supabase/server': { createClient: async () => ({
      auth: { getUser: async () => ({ data: { user: { id: 'admin' } } }) },
      from: () => ({ select() { return this }, eq() { return this }, single: async () => ({ data: { account_type: 'admin' } }) }),
    }) },
    '@/lib/hrIntelligenceData': { buildHrIntelligenceSlate: () => { called++; throw Error('unexpected MLB work') } },
    '@/lib/browserbase': { createPersistentContext: async (url, opts) => { destination = { url, opts }; return { sessionId: 'session', contextId: 'context', continuity: 'persisted', region: 'test', proxyMode: 'managed', expiresAt: 'later' } } },
  }
  function load(path) {
    const source = fs.readFileSync(new URL(`../src/app/api/admin/${path}/route.ts`, import.meta.url), 'utf8')
    const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
    const fixtureModule = { exports: {} }
    new Function('require', 'module', 'exports', js)(id => { if (!(id in fixtures)) throw Error(`Unexpected dependency ${id}`); return fixtures[id] }, fixtureModule, fixtureModule.exports)
    return fixtureModule.exports
  }
  const paused = await load('hr-intelligence').GET(new Request('https://example.test/'))
  assert.equal(paused.status, 503)
  assert.equal(called, 0)
  const nextUrl = new URL('https://example.test/api/admin/pikkit-context?fresh=1')
  const response = await load('pikkit-context').GET({ nextUrl })
  assert.equal(response.status, 200)
  assert.deepEqual(destination, { url: 'https://app.pikkit.com/leagues/nba', opts: { fresh: true } })
})
