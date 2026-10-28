import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import * as crypto from 'node:crypto'
import ts from 'typescript'

async function harness() {
  let now = Date.parse('2026-10-28T20:00:00Z'), reads = 0, outage = false
  class Clock extends Date { constructor(value: string | number = now) { super(value) } static now() { return now } }
  const rows = new Map<string, Record<string, unknown>>()
  const admin = {
    from: () => ({
      select: () => ({ eq: (_name: string, key: string) => ({ abortSignal: () => ({ maybeSingle: async () => {
        reads++
        return outage ? { data: null, error: { code: 'unavailable' } } : { data: rows.get(key) ?? null, error: null }
      } }) }) }),
      update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
    }),
    rpc: async () => { throw Error('fixture did not expect a refresh') },
  }
  const source = await readFile(new URL('../src/lib/nbaSharedCache.ts', import.meta.url), 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const target = { exports: {} }
  new Function('require', 'module', 'exports', 'Date', output)((name: string) => {
    if (name === 'server-only') return {}
    if (name === 'node:crypto') return crypto
    if (name === './supabase/admin') return { createAdminClient: () => admin }
    throw Error(`Unexpected module ${name}`)
  }, target, target.exports, Clock)
  return {
    api: target.exports as typeof import('../src/lib/nbaSharedCache.ts'),
    seed(key: string, ttl: number, payload: unknown = { value: 7 }) { rows.set(key, { payload, fetched_at: new Clock().toISOString(), expires_at: new Clock(now + ttl * 1000).toISOString() }) },
    advance(ms: number) { now += ms }, outage() { outage = true }, reads: () => reads,
  }
}

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
