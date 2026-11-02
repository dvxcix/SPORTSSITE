import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(new URL('../package.json', import.meta.url))
const ts = require('typescript')

const environment = {
  NBA_BROWSER_CAPTURE_ENABLED: 'true', NBA_BROWSER_DAILY_SESSION_LIMIT: '2', NBA_BROWSER_MONTHLY_SESSION_LIMIT: '100',
  NBA_BROWSER_DAILY_MINUTE_LIMIT: '10', NBA_BROWSER_MONTHLY_MINUTE_LIMIT: '500', NBA_BROWSER_BUDGET_RESET_DAY: '18',
  NBA_BROWSER_DAILY_CENT_LIMIT: '300', NBA_BROWSER_PERIOD_CENT_LIMIT: '5000',
}
function loadApi() {
  const cache = new Map()
  function load(name) {
    if (name === 'server-only') return {}
    if (name === 'node:crypto') return require(name)
    if (name === './supabase/admin') return { createAdminClient: () => { throw Error('unexpected DB call') } }
    if (cache.has(name)) return cache.get(name).exports
    const filename = { './browserbaseAtomicAdmission': 'browserbaseAtomicAdmission', './browserbaseSharedAdmission': 'browserbaseSharedAdmission',
      './browserbaseAdmissionError': 'browserbaseAdmissionError', './nbaBrowserBudget': 'nbaBrowserBudget' }[name]
    assert.ok(filename, `unexpected import ${name}`)
    const source = fs.readFileSync(new URL(`../src/lib/${filename}.ts`, import.meta.url), 'utf8')
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
    const compiled = { exports: {} }; cache.set(name, compiled)
    new Function('require', 'module', 'exports', code)(load, compiled, compiled.exports)
    return compiled.exports
  }
  return { api: load('./browserbaseAtomicAdmission'), errors: load('./browserbaseAdmissionError'), nbaErrors: load('./nbaBrowserBudget') }
}
async function fixture(work) {
  const prior = Object.fromEntries(Object.keys(environment).map(key => [key, process.env[key]]))
  Object.assign(process.env, environment)
  try { await work(loadApi()) }
  finally { for (const [key, value] of Object.entries(prior)) { if (value === undefined) delete process.env[key]; else process.env[key] = value } }
}
const periodId = '10000000-0000-4000-8000-000000000001'
function base(nba) {
  return { projectId: 'fixture', periodId, timeoutSeconds: nba ? 300 : 450, nba,
    reservationId: '20000000-0000-4000-8000-000000000001', sessionId: 'session-1',
    readUsage: async () => ({ browserMinutes: 12, proxyBytes: 1000 }) }
}
function receipt(request) {
  return { allowed: true, reason: 'reserved', id: request.id,
    global: { allowed: true, reason: 'reserved', id: request.id, reservedCents: 50 + Math.ceil(request.timeoutSeconds / 360) },
    nba: request.nba ? { allowed: true, reason: 'reserved', id: request.id, reservedMinutes: 5, reservedCents: 51, day: '2026-11-02', periodStart: '2026-10-18' } : null }
}

test('NBA uses one shared request and preserves strict nested NBA reservation fields', async () => fixture(async ({ api }) => {
  let calls = 0
  const result = await api.reserveBrowserbaseAtomicAdmission({ ...base({ workflow: 'public', gameIds: [3, 1] }), reserveAtomic: async request => {
    calls++
    assert.equal(request.nba.config.dailyCents, 300); assert.equal(request.nba.config.periodCents, 5000)
    assert.deepEqual(request.nba.config.gameIds, [1, 3])
    return receipt(request)
  } })
  assert.equal(calls, 1); assert.equal(result.reservedCents, 51); assert.equal(result.nba.id, result.id)
  assert.equal(result.nba.reservedMinutes, 5); assert.equal(result.nba.day, '2026-11-02')
}))

test('NFL uses one shared reservation without invoking NBA budget policy', async () => fixture(async ({ api }) => {
  const result = await api.reserveBrowserbaseAtomicAdmission({ ...base(undefined), reserveAtomic: async request => { assert.equal(request.nba, null); return receipt(request) } })
  assert.equal(result.reservedCents, 52); assert.equal(result.nba, undefined)
}))

test('missing, malformed, mismatched or unexpected NBA/global receipts deny admission', async () => fixture(async ({ api, nbaErrors }) => {
  for (const mutate of [
    row => ({ ...row, global: null }), row => ({ ...row, id: 'wrong' }),
    row => ({ ...row, nba: { ...row.nba, day: 'bad-date' } }),
    row => ({ ...row, nba: { ...row.nba, allowanceKey: 'unexpected' } }),
    row => ({ ...row, nba: { ...row.nba, reservedCents: 0 } }),
  ]) {
    await assert.rejects(api.reserveBrowserbaseAtomicAdmission({ ...base({ workflow: 'direct' }), reserveAtomic: async request => mutate(receipt(request)) }),
      error => error instanceof nbaErrors.NbaBrowserBudgetError && error.code === 'reservation-unavailable')
  }
}))

test('pre-create shared ceiling denial preserves each sport’s typed lease behavior', async () => fixture(async ({ api, errors, nbaErrors }) => {
  const reserveAtomic = async () => ({ allowed: false, reason: 'spend-limit' })
  await assert.rejects(api.reserveBrowserbaseAtomicAdmission({ ...base({ workflow: 'direct' }), reserveAtomic }),
    error => error instanceof nbaErrors.NbaBrowserBudgetError && error.code === 'spend-limit')
  await assert.rejects(api.reserveBrowserbaseAtomicAdmission({ ...base(undefined), reserveAtomic }),
    error => error instanceof errors.BrowserbaseAdmissionError && error.code === 'spend-limit')
}))

test('serialized session contention is a typed no-debit deferral for both sports', async () => fixture(async ({ api, errors, nbaErrors }) => {
  const reserveAtomic = async () => ({ allowed: false, reason: 'session-unverified' })
  await assert.rejects(api.reserveBrowserbaseAtomicAdmission({ ...base({ workflow: 'public' }), reserveAtomic }),
    error => error instanceof nbaErrors.NbaBrowserBudgetError && error.code === 'session-busy')
  await assert.rejects(api.reserveBrowserbaseAtomicAdmission({ ...base(undefined), reserveAtomic }),
    error => error instanceof errors.BrowserbaseAdmissionError && error.code === 'session-busy')
}))

test('November 2 one-day allowance accepts only the exact day and expiry for either NBA workflow', async () => fixture(async ({ api, nbaErrors }) => {
  for (const workflow of ['public','direct']) {
    const result = await api.reserveBrowserbaseAtomicAdmission({ ...base({ workflow }), reserveAtomic: async request => {
      const row = receipt(request)
      return { ...row, nba: { ...row.nba, allowanceKey: 'nba-one-day-2026-11-02', allowanceExpiresAt: '2026-11-02T22:59:00.000Z' } }
    } })
    assert.equal(result.nba.allowanceExpiresAt, '2026-11-02T22:59:00.000Z')
  }
  for (const override of [{ day: '2026-11-03' }, { allowanceExpiresAt: '2026-11-02T23:00:00.000Z' }, { allowanceKey: 'other' }]) {
    await assert.rejects(api.reserveBrowserbaseAtomicAdmission({ ...base({ workflow: 'direct' }), reserveAtomic: async request => {
      const row = receipt(request)
      return { ...row, nba: { ...row.nba, allowanceKey: 'nba-one-day-2026-11-02', allowanceExpiresAt: '2026-11-02T22:59:00.000Z', ...override } }
    } }), error => error instanceof nbaErrors.NbaBrowserBudgetError && error.code === 'reservation-unavailable')
  }
}))

test('monitor checks both ledgers without another reservation and rejects unclear or denied results', async () => fixture(async ({ api, errors }) => {
  let calls = 0
  const input = { ...base({ workflow: 'direct' }), checkAtomic: async request => {
    calls++; assert.equal(request.timeoutSeconds, input.timeoutSeconds); assert.equal(request.id, input.reservationId)
    assert.equal(request.sessionId, input.sessionId); assert.equal(request.nba.scope.workflow, 'direct')
    return { allowed: true, reason: 'checked', global: { allowed: true, reason: 'checked' }, nba: { allowed: true, reason: 'checked' } }
  } }
  await api.checkBrowserbaseAtomicUsage(input)
  assert.equal(calls, 1)
  for (const result of [
    { allowed: false, reason: 'global-unavailable' },
    { allowed: true, reason: 'checked', global: { allowed: true, reason: 'checked' }, nba: null },
    { allowed: true, reason: 'checked', global: { allowed: false, reason: 'checked' }, nba: { allowed: true, reason: 'checked' } },
    null,
  ]) {
    await assert.rejects(api.checkBrowserbaseAtomicUsage({ ...input, checkAtomic: async () => result }),
      error => error instanceof api.BrowserbaseBudgetMonitorError && !(error instanceof errors.BrowserbaseAdmissionError))
  }
}))

test('active monitor rereads once after an explicit reorder, never after a transport error', async () => fixture(async ({ api }) => {
  let reads = 0, checks = 0
  const input = { ...base({ workflow: 'direct' }), readUsage: async () => { reads++; return { browserMinutes: 12, proxyBytes: 1000 } },
    checkAtomic: async () => { checks++; return checks === 1 ? { allowed: false, reason: 'usage-reordered' } :
      { allowed: true, reason: 'checked', global: { allowed: true, reason: 'checked' }, nba: { allowed: true, reason: 'checked' } } } }
  await api.checkBrowserbaseAtomicUsage(input)
  assert.equal(reads, 2); assert.equal(checks, 2)
  reads = 0; checks = 0
  await assert.rejects(api.checkBrowserbaseAtomicUsage({ ...input, checkAtomic: async () => { checks++; throw Error('lost response') } }), api.BrowserbaseBudgetMonitorError)
  assert.equal(reads, 1); assert.equal(checks, 1)
}))
