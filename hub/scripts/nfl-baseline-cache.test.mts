import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { AsyncLocalStorage } from 'node:async_hooks'
import * as crypto from 'node:crypto'
import ts from 'typescript'

type Baseline = { player_id: number; average_odds: number; through_date: string }
type Entry = { payload?: Baseline[]; fetched_at?: string; expires_at?: string; lease_token?: string | null; lease_until?: string | null }
type SharedCache = typeof import('../src/lib/nbaSharedCache.ts').nbaSharedCache
type BaselineApi = { recent(date: string): Promise<Baseline[]>; historical(date: string): Promise<Baseline[]>; raw(date: string): Promise<Baseline[]> }

async function harness() {
  let now = Date.parse('2026-10-25T12:00:00Z'), price = 300, count = 4044
  let failureOffset: number | null = null, failureCode = '57014', pageDuration = 0
  let queries = 0, writes = 0
  const entries = new Map<string, Entry>(), pageOrders: string[][] = []
  class Clock extends Date { constructor(value: string | number = now) { super(value) } static now() { return now } }
  const admin = {
    from(table: string) {
      if (table === 'nfl_td_baseline_daily') {
        let offset = 0
        const order: string[] = []
        const query = {
          select: () => query,
          eq: (column: string, date: string) => { assert.equal(column, 'slate_date'); assert.match(date, /^\d{4}-\d{2}-\d{2}$/); return query },
          order: (column: string) => { order.push(column); return query },
          range: (first: number, last: number) => { offset = first; assert.equal(last, first + 499); return query },
          async abortSignal(signal: AbortSignal) {
            assert.ok(signal instanceof AbortSignal); queries++; pageOrders.push(order)
            await Promise.resolve(); now += pageDuration
            return offset === failureOffset
              ? { data: null, error: { code: failureCode, message: 'fixture source unavailable' } }
              : { data: Array.from({ length: Math.max(0, Math.min(500, count - offset)) }, (_, i) => ({ player_id: offset + i, average_odds: price, through_date: '2026-10-24' })), error: null }
          },
        }
        return query
      }
      assert.equal(table, 'nba_source_cache')
      return {
        select: () => ({ eq: (_column: string, key: string) => ({ abortSignal: () => ({ maybeSingle: async () => ({ data: structuredClone(entries.get(key) ?? null), error: null }) }) }) }),
        update: (patch: Entry) => ({ eq: (_column: string, key: string) => ({ eq: async (_token: string, token: string) => {
          const entry = entries.get(key)
          if (entry?.lease_token === token) entries.set(key, { ...entry, ...patch })
          return { error: null }
        } }) }),
      }
    },
    async rpc(name: string, args: Record<string, unknown>) {
      const key = String(args.p_key), entry = entries.get(key) ?? {}
      if (name === 'claim_nba_source') {
        if (Date.parse(entry.lease_until ?? '') > now) return { data: false, error: null }
        entries.set(key, { ...entry, lease_token: String(args.p_token), lease_until: new Clock(now + Number(args.p_seconds) * 1000).toISOString() })
        return { data: true, error: null }
      }
      assert.equal(name, 'finish_nba_source')
      if (entry.lease_token !== args.p_token || Date.parse(entry.lease_until ?? '') <= now) return { data: false, error: null }
      writes++
      entries.set(key, { payload: structuredClone(args.p_payload as Baseline[]), fetched_at: new Clock().toISOString(), expires_at: new Clock(now + Number(args.p_ttl) * 1000).toISOString(), lease_token: null, lease_until: null })
      return { data: true, error: null }
    },
  }
  const cacheSource = await readFile(new URL('../src/lib/nbaSharedCache.ts', import.meta.url), 'utf8')
  const dataSource = await readFile(new URL('../src/app/the-sideline/data.ts', import.meta.url), 'utf8')
  const baselineSource = dataSource.slice(dataSource.indexOf('async function loadTdBaselinesRaw'), dataSource.indexOf('async function loadPikkitCurrentRaw'))
  async function instance() {
    const cacheExports: { nbaSharedCache?: SharedCache } = {}
    const imports: Record<string, unknown> = { 'server-only': {}, 'node:crypto': crypto, './supabase/admin': { createAdminClient: () => admin } }
    const output = ts.transpileModule(cacheSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
    new Function('require', 'exports', 'Date', 'setTimeout', output)((key: string) => { assert.ok(key in imports, key); return imports[key] }, cacheExports, Clock, (callback: () => void) => setTimeout(callback, 1))
    const api: Partial<BaselineApi> = {}
    const baselineJs = ts.transpileModule(baselineSource + '\nexports.recent=loadTdBaselinesRecent; exports.historical=loadTdBaselinesHistorical; exports.raw=loadTdBaselinesRaw;', { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
    new Function('createAdminClient', 'nbaSharedCache', 'Date', 'AbortSignal', 'WEEK_SECONDS', 'exports', baselineJs)(() => admin, cacheExports.nbaSharedCache, Clock, AbortSignal, 604800, api)
    return api as BaselineApi
  }
  return { instance, entries, pageOrders, advance: (milliseconds: number) => { now += milliseconds }, metrics: () => ({ queries, writes }),
    setPrice: (value: number) => { price = value }, setCount: (value: number) => { count = value },
    failAt: (offset: number | null, code = '57014') => { failureOffset = offset; failureCode = code },
    setPageDuration: (value: number) => { pageDuration = value },
  }
}

test('different matchups nested in the installed Next cache share one complete baseline date', async () => {
  // Run the installed cache implementation, including its nested-cache bypass.
  Object.assign(globalThis, { AsyncLocalStorage })
  const require = createRequire(import.meta.url)
  const { unstable_cache } = require('next/cache') as { unstable_cache<T extends (...args: never[]) => unknown>(fn: T, keys: string[], options: { revalidate: number }): T }
  const { workAsyncStorage } = require('next/dist/server/app-render/work-async-storage.external.js') as { workAsyncStorage: { run<T>(store: Record<string, unknown>, callback: () => Promise<T>): Promise<T> } }
  const saved = new Map<string, unknown>()
  const work = { incrementalCache: {
    generateSimpleCacheKey: async (key: string) => key,
    get: async (key: string) => saved.has(key) ? { value: saved.get(key), isStale: false } : null,
    set: async (key: string, value: unknown) => { saved.set(key, value) },
  } }
  let legacyLoads = 0
  const legacyInner = unstable_cache(async () => ++legacyLoads, ['prior-date-cache'], { revalidate: 300 })
  const legacyOuter = unstable_cache(async (game: string) => { assert.ok(game); return legacyInner() }, ['prior-enriched'], { revalidate: 30 })
  await workAsyncStorage.run(work, async () => { await legacyOuter('MIA_NYJ'); await legacyOuter('IND_MIN') })
  assert.equal(legacyLoads, 2, 'this reproduces the actual prior nested-cache bypass')
  const h = await harness(), reader = await h.instance()
  const outer = unstable_cache(async (game: string) => { assert.ok(game); return reader.recent('2026-10-25') }, ['fixed-enriched'], { revalidate: 30 })
  const result = await workAsyncStorage.run(work, () => Promise.all(['MIA_NYJ', 'IND_MIN', 'SF_ATL'].map(id => outer(id))))
  assert.ok(result.every(rows => rows.length === 4044 && rows.at(-1)?.player_id === 4043))
  assert.equal(h.metrics().queries, 9); assert.equal(h.metrics().writes, 1)
})

test('concurrent games across six server instances coalesce the complete nine-page load', async () => {
  const h = await harness(), readers = await Promise.all(Array.from({ length: 6 }, h.instance))
  const results = await Promise.all(Array.from({ length: 36 }, (_, i) => readers[i % readers.length].recent('2026-10-25')))
  assert.ok(results.every(rows => rows.length === 4044)); assert.equal(h.metrics().queries, 9); assert.equal(h.metrics().writes, 1)
  assert.ok(h.pageOrders.every(order => order.join(',') === 'player_id,vendor,prop_type'))
  h.advance(11_000)
  await (await h.instance()).recent('2026-10-25')
  assert.equal(h.metrics().queries, 9, 'a cold instance reads the shared payload, not the source pages')
})

test('date keys and recent/historical policies retain their exact TTLs', async () => {
  const h = await harness(), reader = await h.instance()
  await reader.recent('2026-10-25'); await reader.historical('2026-10-24')
  const recent = h.entries.get('nfl:td-baselines:v1:2026-10-25')!, historical = h.entries.get('nfl:td-baselines:v1:2026-10-24')!
  assert.equal(Date.parse(recent.expires_at!) - Date.parse(recent.fetched_at!), 300_000)
  assert.equal(Date.parse(historical.expires_at!) - Date.parse(historical.fetched_at!), 604_800_000)
  h.advance(301_000); h.setPrice(550)
  assert.equal((await reader.recent('2026-10-25'))[0].average_odds, 550)
  assert.equal((await reader.historical('2026-10-24'))[0].average_odds, 300)
  assert.equal(h.metrics().queries, 27)
})

test('a failed second page preserves the complete prior payload and original observation time', async () => {
  const h = await harness(), reader = await h.instance(), key = 'nfl:td-baselines:v1:2026-10-25'
  await reader.recent('2026-10-25')
  const original = structuredClone(h.entries.get(key)!)
  h.advance(301_000); h.setPrice(900); h.failAt(500)
  const rows = await reader.recent('2026-10-25')
  assert.equal(rows.length, 4044); assert.ok(rows.every(row => row.average_odds === 300 && row.through_date === '2026-10-24'))
  assert.deepEqual(h.entries.get(key)?.payload, original.payload)
  assert.equal(h.entries.get(key)?.fetched_at, original.fetched_at); assert.equal(h.metrics().writes, 1)
  h.advance(300_000)
  await assert.rejects(() => (reader.recent('2026-10-25')), /unavailable/)
  assert.equal(h.metrics().writes, 1, 'expired fallback cannot be restamped as a new observation')
})

test('missing tables and partial cold loads fail closed while a verified empty date is cacheable', async () => {
  for (const [offset, code] of [[0, '42P01'], [500, '57014']] as const) {
    const h = await harness(), reader = await h.instance(); h.failAt(offset, code)
    await assert.rejects(() => reader.recent('2026-10-25'), /unavailable/)
    assert.equal(h.metrics().writes, 0); assert.equal(h.entries.get('nfl:td-baselines:v1:2026-10-25')?.payload, undefined)
  }
  const h = await harness(), reader = await h.instance(); h.setCount(0)
  assert.deepEqual(await reader.recent('2026-10-25'), [])
  assert.deepEqual(await (await h.instance()).recent('2026-10-25'), [])
  assert.equal(h.metrics().queries, 1); assert.equal(h.metrics().writes, 1)
})

test('the full load stops at forty seconds and never commits partial pages', async () => {
  const h = await harness(), reader = await h.instance(); h.setPageDuration(10_001)
  await assert.rejects(() => reader.recent('2026-10-25'), /paging timed out/)
  assert.equal(h.metrics().queries, 4); assert.equal(h.metrics().writes, 0)
  const bounded = await harness(), raw = await bounded.instance(); bounded.setCount(50_000)
  await assert.rejects(() => raw.raw('2026-10-25'), /paging bound exceeded/)
  assert.equal(bounded.metrics().queries, 100)
})
