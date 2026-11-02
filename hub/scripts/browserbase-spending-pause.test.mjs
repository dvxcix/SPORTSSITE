import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(new URL('../package.json', import.meta.url))
const ts = require('typescript')
const source = fs.readFileSync(new URL('../src/lib/browserbase.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const pauseSource = fs.readFileSync(new URL('../src/lib/browserbaseSpendingPause.ts', import.meta.url), 'utf8')
const pauseCompiled = ts.transpileModule(pauseSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const pauseModule = { exports: {} }
new Function('module', 'exports', pauseCompiled)(pauseModule, pauseModule.exports)

test('the spending pause blocks automated and manual sessions before any provider or lease access', async () => {
  const calls = []
  const mocks = {
    '@browserbasehq/sdk': { default: class { constructor() { calls.push('provider') } } },
    'playwright-core': { chromium: {} },
    '@/lib/pikkitBrowserLease': { acquirePikkitBrowserLease: async () => { calls.push('lease') } },
    '@/lib/nbaBrowserBudget': {
      NbaBrowserBudgetError: class extends Error { constructor(code) { super('NBA spending limit'); this.code = code } },
      reserveNbaBrowserBudget: async () => { calls.push('reservation') },
    },
    '@/lib/browserbaseAtomicAdmission': {},
    '@/lib/browserbaseAtomicRpc': {},
    '@/lib/browserbaseAdmissionError': {},
  }
  const compiledModule = { exports: {} }
  assert.equal(pauseModule.exports.BROWSERBASE_SPENDING_PAUSED, true, 'pause provenance must match the unconditional browser guard')
  new Function('require', 'module', 'exports', compiled)(id => {
    assert.ok(id in mocks, `unexpected dependency ${id}`)
    return mocks[id]
  }, compiledModule, compiledModule.exports)
  await assert.rejects(compiledModule.exports.openSession({ metadata: { sport: 'nba' } }), error => error.code === 'spend-limit')
  for (const metadata of [{ sport: 'nfl' }, { sport: 'mlb' }, {}]) {
    await assert.rejects(compiledModule.exports.openSession({ metadata }), /paused for the spending limit/)
  }
  for (const fresh of [true, false]) {
    await assert.rejects(compiledModule.exports.createPersistentContext(undefined, { fresh }), /paused for the spending limit/)
  }
  assert.deepEqual(calls, [])
})
