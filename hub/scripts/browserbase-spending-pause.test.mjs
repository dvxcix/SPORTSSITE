import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(new URL('../package.json', import.meta.url))
const ts = require('typescript')
const compile = file => ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const scopeModule = { exports: {} }
new Function('module', 'exports', compile('../src/lib/browserbaseSpendingPause.ts'))(scopeModule, scopeModule.exports)
const source = compile('../src/lib/browserbase.ts')

function fixture() {
  const calls = []
  class Browserbase {
    constructor() {
      calls.push('provider-client')
      this.projects = { list: async () => [{ id: 'fixture' }], usage: async () => ({ browserMinutes: 0, proxyBytes: 0 }) }
      this.sessions = { create: async () => { calls.push('paid-create'); throw new Error('Unexpected paid create') } }
    }
  }
  const mocks = {
    '@browserbasehq/sdk': { default: Browserbase },
    'playwright-core': { chromium: {} },
    '@/lib/pikkitBrowserLease': { acquirePikkitBrowserLease: async () => { calls.push('context-lease') } },
    '@/lib/nbaBrowserBudget': { NbaBrowserBudgetError: class extends Error {} },
    '@/lib/browserbaseAtomicAdmission': { reserveBrowserbaseAtomicAdmission: async () => { calls.push('atomic-reservation'); throw new Error('Admission unavailable') } },
    '@/lib/browserbaseAtomicRpc': {},
    '@/lib/browserbaseAdmissionError': {},
    '@/lib/browserbaseSpendingPause': scopeModule.exports,
  }
  const compiled = { exports: {} }
  new Function('require', 'module', 'exports', source)(id => {
    assert.ok(id in mocks, `unexpected dependency ${id}`)
    return mocks[id]
  }, compiled, compiled.exports)
  return { api: compiled.exports, calls }
}

test('automated admission is restricted to known NBA and NFL workflows', async () => {
  assert.equal(scopeModule.exports.BROWSERBASE_SPENDING_PAUSED, false)
  for (const metadata of [{ sport: 'mlb', book: 'pikkit' }, { sport: 'mlb', book: 'fanduel' }, { sport: 'nfl', book: 'betmgm' }, { sport: 'nba', book: 'unknown' }, { book: 'pikkit' }, {}]) {
    const { api, calls } = fixture()
    await assert.rejects(api.openSession({ metadata }), /unavailable for this workflow/)
    assert.deepEqual(calls, [])
  }
})

test('every allowed NBA and NFL launch still fails closed before session creation if the atomic guard fails', async () => {
  const prior = process.env.BROWSERBASE_API_KEY
  process.env.BROWSERBASE_API_KEY = 'synthetic-test-only'
  try {
    for (const metadata of [{ sport: 'nfl', book: 'pikkit' }, { sport: 'nfl', book: 'fanduel' }, { sport: 'nba', book: 'pikkit' }, { sport: 'nba', book: 'combined-direct' }, { sport: 'nba', book: 'draftkings' }, { sport: 'nba', book: 'betmgm' }]) {
      const { api, calls } = fixture()
      await assert.rejects(api.openSession({ metadata }), /Admission unavailable/)
      assert.deepEqual(calls, ['provider-client', 'atomic-reservation'])
    }
  } finally {
    if (prior === undefined) delete process.env.BROWSERBASE_API_KEY
    else process.env.BROWSERBASE_API_KEY = prior
  }
})

test('manual authentication stays paused before provider or lease access', async () => {
  for (const fresh of [true, false]) {
    const { api, calls } = fixture()
    await assert.rejects(api.createPersistentContext(undefined, { fresh }), /paused for the spending limit/)
    assert.deepEqual(calls, [])
  }
})
