import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import * as crypto from 'node:crypto'
import ts from 'typescript'

async function harness() {
  let now = Date.parse('2026-10-28T20:00:00Z'), reads = 0, outage = false, logThrows = false
  let failure: { operation: 'full-read' | 'metadata-read'; status: number; code: string; deadline?: boolean } | null = null
  const logs: unknown[][] = []
  class Clock extends Date { constructor(value: string | number = now) { super(value) } static now() { return now } }
  const rows = new Map<string, Record<string, unknown>>()
  const admin = {
    from: () => ({
      select: (columns: string) => ({ eq: (_name: string, key: string) => ({ abortSignal: () => ({ maybeSingle: async () => {
        reads++
        const operation = columns.includes('payload') ? 'full-read' : 'metadata-read'
        return outage || failure?.operation === operation
          ? { data: null, error: { code: failure?.code ?? 'unavailable', message: 'secret-message', details: 'secret-details', hint: 'secret-hint' }, status: failure?.status ?? 0 }
          : { data: rows.get(key) ?? null, error: null, status: 200 }
      } }) }) }),
      update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
    }),
    rpc: async () => failure?.operation === 'metadata-read' ? { data: false, error: null } : Promise.reject(Error('fixture did not expect a refresh')),
  }
  const source = await readFile(new URL('../src/lib/nbaSharedCache.ts', import.meta.url), 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const target = { exports: {} }
  new Function('require', 'module', 'exports', 'Date', 'console', 'AbortSignal', 'setTimeout', output)((name: string) => {
    if (name === 'server-only') return {}
    if (name === 'node:crypto') return crypto
    if (name === './supabase/admin') return { createAdminClient: () => admin }
    throw Error(`Unexpected module ${name}`)
  }, target, target.exports, Clock, { warn: (...args: unknown[]) => { if (logThrows) throw Error('logger failed'); logs.push(args) } },
  { timeout: () => ({ aborted: !!failure?.deadline, reason: failure?.deadline ? { name: 'TimeoutError' } : undefined }) },
  (callback: () => void) => setTimeout(callback, 1))
  return {
    api: target.exports as typeof import('../src/lib/nbaSharedCache.ts'),
    seed(key: string, ttl: number, payload: unknown = { value: 7 }) { rows.set(key, { payload, fetched_at: new Clock().toISOString(), expires_at: new Clock(now + ttl * 1000).toISOString() }) },
    advance(ms: number) { now += ms }, outage() { outage = true }, reads: () => reads,
    fail(value: NonNullable<typeof failure>) { failure = value }, failLogger() { logThrows = true }, logs,
  }
}

test('cache read diagnostics are allowlisted, private and rate limited without changing errors', async () => {
  const cases = [
    { status: 0, code: '', deadline: true, reason: 'client-deadline' },
    { status: 500, code: '57014', reason: 'database-cancelled' },
    { status: 504, code: 'PGRST003', reason: 'pool-timeout' },
    { status: 503, code: '57P01', reason: 'database-connection' },
    { status: 500, code: '53200', reason: 'database-resource' },
    { status: 429, code: '', reason: 'rate-limited' },
    { status: 403, code: '', reason: 'http-client' },
    { status: 503, code: '', reason: 'http-server' },
    { status: 0, code: '', reason: 'transport-or-client' },
    { status: 200, code: 'secret-arbitrary-code', reason: 'unknown' },
  ]
  const h = await harness(), load = async () => { throw Error('unexpected source fetch') }
  for (const [index, item] of cases.entries()) {
    h.fail({ operation: 'full-read', ...item })
    await assert.rejects(() => h.api.nbaSharedCache(`private-key-${index}`, 30, 0, load), /^Error: NBA shared cache unavailable$/)
    assert.deepEqual(h.logs.at(-1), ['[The Court] shared cache read failed', { operation: 'full-read', reason: item.reason }])
  }
  h.fail({ operation: 'full-read', status: 0, code: '' })
  await assert.rejects(() => h.api.nbaSharedCache('private-key-again', 30, 0, load), /shared cache unavailable/)
  assert.equal(h.logs.length, cases.length, 'same category is logged only once per minute')
  h.advance(60_000)
  await assert.rejects(() => h.api.nbaSharedCache('private-key-later', 30, 0, load), /shared cache unavailable/)
  assert.equal(h.logs.length, cases.length + 1)
  assert.doesNotMatch(JSON.stringify(h.logs), /secret|private-key/)
})

test('metadata polling failures use the same private diagnostics and preserve the public error', async () => {
  const h = await harness()
  h.fail({ operation: 'metadata-read', status: 0, code: '' })
  await assert.rejects(() => h.api.nbaSharedCache('secret-poll-key', 30, 0, async () => 'unexpected', 120), /^Error: NBA shared cache unavailable$/)
  assert.deepEqual(h.logs, [['[The Court] shared cache read failed', { operation: 'metadata-read', reason: 'transport-or-client' }]])
  assert.doesNotMatch(JSON.stringify(h.logs), /secret/)
})

test('a logging failure cannot replace the cache error or block a valid fallback', async () => {
  const h = await harness(), load = async () => { throw Error('unexpected source fetch') }
  h.seed('retained', 30)
  const original = await h.api.nbaSharedCache('retained', 30, 30, load)
  h.advance(31_000); h.failLogger(); h.fail({ operation: 'full-read', status: 0, code: '' })
  const stale = await h.api.nbaSharedCache('retained', 30, 30, load)
  assert.deepEqual(stale.value, original.value); assert.equal(stale.fetchedAt, original.fetchedAt); assert.equal(stale.stale, true)
  await assert.rejects(() => h.api.nbaSharedCache('new', 30, 0, load), /^Error: NBA shared cache unavailable$/)
})

test('shared database outages retain only a previously verified observation inside its freshness and stale windows', async () => {
  const h = await harness(), load = async () => { throw Error('unexpected source fetch') }
  h.seed('board', 30)
  const original = await h.api.nbaSharedCache('board', 30, 30, load)
  h.advance(11000); h.outage()
  const fresh = await h.api.nbaSharedCache('board', 30, 30, load)
  assert.deepEqual(fresh, original)
  const before = h.reads()
  await Promise.all(Array.from({ length: 50 }, () => h.api.nbaSharedCache('board', 30, 30, load)))
  assert.equal(h.reads(), before, 'failure backoff prevents one database retry per member')
  h.advance(20000)
  const stale = await h.api.nbaSharedCache('board', 30, 30, load)
  assert.deepEqual(stale.value, original.value)
  assert.equal(stale.fetchedAt, original.fetchedAt)
  assert.equal(stale.stale, true)
  h.advance(30000)
  await assert.rejects(() => h.api.nbaSharedCache('board', 30, 30, load), /shared cache unavailable/)
})

test('strict odds and separately scoped policies never borrow expired data or another caller’s fallback', async () => {
  const h = await harness(), load = async () => { throw Error('unexpected source fetch') }
  h.seed('prices', 30)
  await h.api.nbaSharedCache('prices', 30, 0, load)
  await h.api.nbaSharedCache('prices', 30, 60, load)
  h.advance(31000); h.outage()
  const [strict, tolerant, differentScope] = await Promise.allSettled([
    h.api.nbaSharedCache('prices', 30, 0, load),
    h.api.nbaSharedCache('prices', 30, 60, load),
    h.api.nbaSharedCache('other-game', 30, 60, load),
  ])
  assert.equal(strict.status, 'rejected')
  assert.equal(differentScope.status, 'rejected')
  assert.equal(tolerant.status, 'fulfilled')
  if (tolerant.status === 'fulfilled') assert.equal(tolerant.value.stale, true)
})

test('a newer result too large for L1 evicts the older snapshot rather than reviving it on outage', async () => {
  const h = await harness(), load = async () => { throw Error('unexpected source fetch') }
  h.seed('large', 30)
  await h.api.nbaSharedCache('large', 30, 30, load)
  h.advance(11000)
  h.seed('large', 30, { value: 'x'.repeat(32 * 1024 * 1024) })
  const newer = await h.api.nbaSharedCache<{ value: string }>('large', 30, 30, load)
  assert.equal(newer.value.value.length, 32 * 1024 * 1024)
  h.outage()
  await assert.rejects(() => h.api.nbaSharedCache('large', 30, 30, load), /shared cache unavailable/)
})
