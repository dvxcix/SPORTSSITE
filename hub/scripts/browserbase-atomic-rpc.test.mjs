import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(new URL('../package.json', import.meta.url))
const ts = require('typescript')
const source = fs.readFileSync(new URL('../src/lib/browserbaseAtomicRpc.ts', import.meta.url), 'utf8')
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
function load(returned) {
  const calls = []
  const mocks = { 'server-only': {}, './supabase/admin': { createAdminClient: () => ({ rpc: (name, args) => {
    const entry = { name, args }; calls.push(entry)
    return { abortSignal: async signal => { assert.ok(signal instanceof AbortSignal); return typeof returned === 'function' ? returned(name) : returned } }
  } }) } }
  const compiled = { exports: {} }
  new Function('require', 'module', 'exports', code)(id => { assert.ok(id in mocks, `unexpected ${id}`); return mocks[id] }, compiled, compiled.exports)
  return { calls, api: compiled.exports }
}
const nba = { scope: { workflow: 'public', gameIds: [4, 7] }, config: { dailySessions: 4, monthlySessions: 80,
  dailyMinutes: 20, monthlyMinutes: 400, resetDay: 18, dailyCents: 300, periodCents: 5000, gameIds: [4, 7] } }
const sample = { projectId: 'project', periodId: '10000000-0000-4000-8000-000000000001', id: '20000000-0000-4000-8000-000000000001',
  sessionId: 'session-1', timeoutSeconds: 300, browserMinutes: 15, proxyBytes: 123, observedAt: '2026-11-02T10:00:00.000Z', nba }

test('NBA reservation maps every validated policy, scope and observation into one bounded RPC', async () => {
  const { api, calls } = load({ data: { allowed: true }, error: null })
  assert.deepEqual(await api.reserveBrowserbaseAtomicRpc(sample), { allowed: true })
  assert.equal(calls.length, 1); assert.equal(calls[0].name, 'reserve_browserbase_shared_budget')
  assert.deepEqual(calls[0].args, { p_project: 'project', p_period: sample.periodId, p_id: sample.id, p_timeout: 300,
    p_minutes: 15, p_bytes: 123, p_observed_at: sample.observedAt, p_nba: true, p_daily_sessions: 4,
    p_period_sessions: 80, p_daily_minutes: 20, p_period_minutes: 400, p_reset_day: 18, p_daily_cents: 300,
    p_period_cents: 5000, p_workflow: 'public', p_game_ids: [4, 7] })
})
test('NFL monitor identifies the reservation and session without fabricating NBA policy', async () => {
  const { api, calls } = load({ data: { allowed: true }, error: null })
  await api.checkBrowserbaseAtomicRpc({ ...sample, nba: null })
  assert.equal(calls[0].name, 'check_browserbase_shared_budget'); assert.equal(calls[0].args.p_nba, false)
  assert.equal(calls[0].args.p_daily_cents, null); assert.equal(calls[0].args.p_id, sample.id)
  assert.equal(calls[0].args.p_session_id, sample.sessionId)
  assert.equal(calls[0].args.p_timeout, sample.timeoutSeconds)
})
test('database failures do not retry or leak private error content', async () => {
  const { api, calls } = load({ data: null, error: { message: 'private provider token' } })
  await assert.rejects(api.reserveBrowserbaseAtomicRpc(sample), error => error.message === 'Cloud browser reservation unavailable')
  assert.equal(calls.length, 1)
})
test('closing, verified completion and proven no-create map one exact reservation without retry', async () => {
  const { api, calls } = load(name => ({ data: name === 'mark_browserbase_shared_creating' ? { marked: true, notAfter: '2026-11-17T23:59:00Z' } : true, error: null }))
  const key = { projectId: sample.projectId, periodId: sample.periodId, id: sample.id, sessionId: sample.sessionId }
  assert.equal(await api.markBrowserbaseCreating(key), '2026-11-17T23:59:00Z')
  await api.markBrowserbaseClosing(key)
  await api.resolveBrowserbaseSession(key)
  await api.abandonBrowserbaseBeforeCreate(key)
  assert.deepEqual(calls.map(call => call.name), ['mark_browserbase_shared_creating','mark_browserbase_shared_closing','resolve_browserbase_shared_session','abandon_browserbase_shared_before_create'])
  assert.equal(calls[1].args.p_session_id, sample.sessionId)
  assert.equal('p_session_id' in calls[3].args, false)
  const failed = load({ data: false, error: null })
  await assert.rejects(failed.api.resolveBrowserbaseSession(key), /state unavailable/)
  assert.equal(failed.calls.length, 1)
})

test('creation rejects a missing or malformed authoritative deadline', async () => {
  const key = { projectId: sample.projectId, periodId: sample.periodId, id: sample.id }
  for (const data of [true, { marked: false }, { marked: true }, { marked: true, notAfter: 'invalid' }]) {
    const { api, calls } = load({ data, error: null })
    await assert.rejects(api.markBrowserbaseCreating(key), /state unavailable/)
    assert.equal(calls.length, 1)
  }
})
