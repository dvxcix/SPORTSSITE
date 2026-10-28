import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { AsyncLocalStorage } from 'node:async_hooks'
import * as crypto from 'node:crypto'
import ts from 'typescript'

type Entry = { payload?: unknown; fetched_at?: string; expires_at?: string; lease_token?: string | null; lease_until?: string | null }
type Api = { getNflPregameWeekly(season: number, beforeWeek: number, phase?: string): Promise<Record<string, unknown>[]> }

async function harness() {
  let now = Date.parse('2026-10-28T12:00:00Z'), queries = 0, writes = 0, failOffset: number | null = null
  const entries = new Map<string, Entry>(), orders: string[][] = []
  const source = Array.from({ length: 2050 }, (_, i) => ({ player_id: String(i).padStart(5, '0'), season: 2026, season_type: 'REG', week: i % 7 + 1, opponent_team: 'BUF', position: 'WR', receiving_yards: i }))
  class Clock extends Date { constructor(value: string | number = now) { super(value) } static now() { return now } }
  const admin = {
    from(table: string) {
      if (table === 'nfl_player_stats') {
        let start = 0, end = 0, season = 0, phase = '', beforeWeek = 0
        const order: string[] = []
        const query = {
          select: () => query,
          eq: (name: string, value: string | number) => { if (name === 'season') season = Number(value); if (name === 'season_type') phase = String(value); return query },
          gt: (name: string, value: number) => { assert.equal(name, 'week'); assert.equal(value, 0); return query },
          lt: (name: string, value: number) => { assert.equal(name, 'week'); beforeWeek = value; return query },
          order: (name: string) => { order.push(name); return query },
          range: (from: number, to: number) => { start = from; end = to; return query },
          async abortSignal(signal: AbortSignal) {
            assert.ok(signal instanceof AbortSignal); queries++; orders.push(order)
            await Promise.resolve()
            if (start === failOffset) return { data: null, error: { code: 'fixture' } }
            const rows = source.filter(row => row.season === season && row.season_type === phase && row.week < beforeWeek).sort((a, b) => a.week - b.week || a.player_id.localeCompare(b.player_id))
            return { data: rows.slice(start, end + 1), error: null }
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
      entries.set(key, { payload: structuredClone(args.p_payload), fetched_at: new Clock().toISOString(), expires_at: new Clock(now + Number(args.p_ttl) * 1000).toISOString(), lease_token: null, lease_until: null })
      return { data: true, error: null }
    },
  }
  const cacheSource = await readFile(new URL('../src/lib/nbaSharedCache.ts', import.meta.url), 'utf8')
  const weeklySource = await readFile(new URL('../src/lib/nflPregameData.ts', import.meta.url), 'utf8')
  const compile = (source: string) => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
  async function instance(): Promise<Api> {
    const cacheExports: Record<string, unknown> = {}, weeklyExports: Record<string, unknown> = {}
    const cacheImports: Record<string, unknown> = { 'server-only': {}, 'node:crypto': crypto, './supabase/admin': { createAdminClient: () => admin } }
    new Function('require', 'exports', 'Date', 'setTimeout', compile(cacheSource))((key: string) => { assert.ok(key in cacheImports, key); return cacheImports[key] }, cacheExports, Clock, (callback: () => void) => setTimeout(callback, 1))
    const weeklyImports: Record<string, unknown> = { 'server-only': {}, '@/lib/supabase/admin': { createAdminClient: () => admin }, './nbaSharedCache': cacheExports, './nflPregameHistory': { pregameDvp: () => [] } }
    new Function('require', 'exports', 'Date', 'AbortSignal', compile(weeklySource))((key: string) => { assert.ok(key in weeklyImports, key); return weeklyImports[key] }, weeklyExports, Clock, AbortSignal)
    return weeklyExports as Api
  }
  return { instance, entries, orders, metrics: () => ({ queries, writes }), advance: (ms: number) => { now += ms }, failAt: (offset: number | null) => { failOffset = offset } }
}

test('six instances and 36 concurrent matchup callers share one complete weekly sample', async () => {
  const h = await harness(), readers = await Promise.all(Array.from({ length: 6 }, h.instance))
  const samples = await Promise.all(Array.from({ length: 36 }, (_, i) => readers[i % 6].getNflPregameWeekly(2026, 8)))
  assert.ok(samples.every(rows => rows.length === 2050 && rows.every(row => Number(row.week) < 8)))
  assert.deepEqual(h.metrics(), { queries: 3, writes: 1 })
  assert.ok(h.orders.every(order => order.join(',') === 'week,player_id'))
  h.advance(11_000)
  assert.equal((await (await h.instance()).getNflPregameWeekly(2026, 8)).length, 2050)
  assert.equal(h.metrics().queries, 3)
})

test('different matchup caches share weekly data under the installed Next nested cache', async () => {
  Object.assign(globalThis, { AsyncLocalStorage })
  const require = createRequire(import.meta.url)
  const { unstable_cache } = require('next/cache') as { unstable_cache<T extends (...args: never[]) => unknown>(fn: T, keys: string[], options: { revalidate: number }): T }
  const { workAsyncStorage } = require('next/dist/server/app-render/work-async-storage.external.js') as { workAsyncStorage: { run<T>(store: Record<string, unknown>, callback: () => Promise<T>): Promise<T> } }
  const saved = new Map<string, unknown>()
  const work = { incrementalCache: { generateSimpleCacheKey: async (key: string) => key, get: async (key: string) => saved.has(key) ? { value: saved.get(key), isStale: false } : null, set: async (key: string, value: unknown) => { saved.set(key, value) } } }
  let priorLoads = 0
  const priorInner = unstable_cache(async () => ++priorLoads, ['nfl-prior-weekly'], { revalidate: 300 })
  const priorOuter = unstable_cache(async (game: string) => { assert.ok(game); return priorInner() }, ['nfl-prior-board'], { revalidate: 30 })
  await workAsyncStorage.run(work, async () => { await priorOuter('one'); await priorOuter('two') })
  assert.equal(priorLoads, 2, 'installed Next bypasses the prior nested cache')
  const h = await harness(), reader = await h.instance()
  const outer = unstable_cache(async (game: string) => { assert.ok(game); return reader.getNflPregameWeekly(2026, 8) }, ['nfl-fixed-board'], { revalidate: 30 })
  const samples = await workAsyncStorage.run(work, () => Promise.all(['one', 'two', 'three'].map(game => outer(game))))
  assert.ok(samples.every(rows => rows.length === 2050))
  assert.deepEqual(h.metrics(), { queries: 3, writes: 1 })
})

test('week, season and phase are isolated and prior-week boundaries are retained', async () => {
  const h = await harness(), api = await h.instance()
  const week = await api.getNflPregameWeekly(2026, 3)
  assert.ok(week.length > 0 && week.every(row => Number(row.week) < 3))
  assert.equal((await api.getNflPregameWeekly(2026, 1)).length, 0)
  assert.equal((await api.getNflPregameWeekly(2026, 0)).length, 0)
  assert.equal((await api.getNflPregameWeekly(2026, 8, 'PRE')).length, 0)
  assert.equal((await api.getNflPregameWeekly(2026, 8, 'POST')).length, 0)
  assert.equal((await api.getNflPregameWeekly(2025, 8)).length, 0)
  assert.equal(h.entries.size, 6)
  await assert.rejects(() => api.getNflPregameWeekly(2026, -1))
  await assert.rejects(() => api.getNflPregameWeekly(2026, 8, 'bad'))
})

test('failed second page cannot replace a complete sample or its original timestamp', async () => {
  const h = await harness(), api = await h.instance(), key = 'nfl:pregame-weekly:v2:2026:REG:8'
  await api.getNflPregameWeekly(2026, 8)
  const saved = structuredClone(h.entries.get(key))
  h.advance(301_000); h.failAt(1000)
  assert.equal((await api.getNflPregameWeekly(2026, 8)).length, 2050)
  assert.deepEqual(h.entries.get(key)?.payload, saved?.payload)
  assert.equal(h.entries.get(key)?.fetched_at, saved?.fetched_at)
  assert.equal(h.metrics().writes, 1)
  h.advance(301_000)
  await assert.rejects(() => api.getNflPregameWeekly(2026, 8))
  assert.equal(h.metrics().writes, 1)
})
