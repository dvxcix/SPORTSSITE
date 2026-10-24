import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import * as crypto from 'node:crypto'
import ts from 'typescript'
import type { PaintFrame } from '../src/lib/nbaMovement.ts'
import * as modes from '../src/lib/nbaOddsMode.ts'
import { nbaFirstMarket } from '../src/lib/nbaFirstBasketMarkets.ts'
import * as bookHistory from '../src/lib/nbaBookHistory.ts'

async function compiled<T>(file: string, imports: Record<string, unknown>, clock: { new(value?: string | number): Date; now(): number }): Promise<T> {
  const source = await readFile(new URL(file, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
  const target = { exports: {} }
  new Function('require', 'exports', 'module', 'Date', 'setTimeout', outputText)(
    (name: string) => { if(name==='./nbaOddsClockData'&&!(name in imports))return{getNbaOddsGame:async(game:unknown)=>game};if(name==='./nbaBookHistory'&&!(name in imports))return bookHistory;assert.ok(name in imports, name); return imports[name] }, target.exports, target, clock,
    (callback: () => void) => setTimeout(callback, 1),
  )
  return target.exports as T
}

type Args = Record<string, unknown>
type CacheEntry = { payload: unknown; fetched_at: string; expires_at: string }
async function harness() {
  let now = Date.parse('2026-10-19T14:30:00Z'), failed = false, result: unknown = undefined
  const entries = new Map<string, CacheEntry>(), leases = new Map<string, string>(), reads: Args[] = []
  class Clock extends Date { constructor(value: string | number = now) { super(value) } static now() { return now } }
  const admin = {
    from: (table: string) => {
      assert.equal(table, 'nba_source_cache')
      return {
        select: () => ({ eq: (_column: string, key: string) => ({ abortSignal: (signal: AbortSignal) => {
          assert.ok(signal instanceof AbortSignal)
          return { maybeSingle: async () => ({ data: entries.get(key) ?? null, error: null }) }
        } }) }),
        update: () => ({ eq: (_column: string, key: string) => ({ eq: async (_tokenColumn: string, token: string) => {
          if (leases.get(key) === token) leases.delete(key)
          return { error: null }
        } }) }),
      }
    },
    rpc: (name: string, args: Args) => {
      if (name === 'read_nba_book_frames') return { abortSignal: async (signal: AbortSignal) => {
        assert.ok(signal instanceof AbortSignal); reads.push(args)
        await new Promise(resolve => setTimeout(resolve, 5))
        return { data: result ?? [{ captured_at: new Clock().toISOString(), quotes: [],fingerprint:'fixture' }], error: failed ? { message: 'fixture outage' } : null }
      } }
      const key = String(args.p_key), token = String(args.p_token)
      if (name === 'claim_nba_source') {
        assert.equal(args.p_seconds, 25)
        if (leases.has(key)) return Promise.resolve({ data: false, error: null })
        leases.set(key, token); return Promise.resolve({ data: true, error: null })
      }
      assert.equal(name, 'finish_nba_source'); assert.equal(leases.get(key), token)
      assert.equal(args.p_ttl, 60)
      entries.set(key, { payload: args.p_payload, fetched_at: new Clock().toISOString(), expires_at: new Clock(now + 60_000).toISOString() })
      leases.delete(key); return Promise.resolve({ data: true, error: null })
    },
  }
  const instance = async () => {
    const cache = await compiled<typeof import('../src/lib/nbaSharedCache.ts')>('../src/lib/nbaSharedCache.ts', { 'server-only': {}, 'node:crypto': crypto, './supabase/admin': { createAdminClient: () => admin } }, Clock)
    const phase=await compiled<typeof import('../src/lib/nbaOddsPhaseData.ts')>('../src/lib/nbaOddsPhaseData.ts',{'server-only':{},'./supabase/admin':{createAdminClient:()=>admin},'./nbaSharedCache':cache,'./nbaOddsMode':modes},Clock)
    return compiled<typeof import('../src/lib/nbaOddsHistoryData.ts')>('../src/lib/nbaOddsHistoryData.ts', { 'server-only': {}, './supabase/admin': { createAdminClient: () => admin }, './nbaSharedCache': cache, './nbaFirstBasketMarkets': { nbaFirstMarket },'./nbaOddsMode':modes,'./nbaOddsPhaseData':phase,'./nbaPaintData':{getPaintGame:async(id:number)=>({id,datetime:'2026-10-19T23:00:00Z',status:'Scheduled'})} }, Clock)
  }
  return { instance, reads, entries, advance: (ms: number) => { now += ms }, fail: (value: boolean) => { failed = value }, setResult: (value: unknown) => { result = value } }
}

test('NBA history coalesces the same scoped market across instances without loading unrelated quotes', async () => {
  const h = await harness(), instances = await Promise.all(Array.from({ length: 3 }, () => h.instance()))
  const results = await Promise.all(Array.from({ length: 12 }, (_, index) => instances[index % 3].getNbaMarketFrames(123, 'points', 434)))
  assert.equal(h.reads.length, 1); assert.ok(results.every(result => result.length === 1))
  await instances[0].getNbaMarketFrames(123, 'points', 434)
  assert.equal(h.reads.length, 1)
  for (const args of [[124, 'points', 434], [123, 'points_1q', 434], [123, 'points', 435], [123, 'points', null]] as const) {
    await instances[0].getNbaMarketFrames(args[0], args[1], args[2])
  }
  assert.deepEqual(h.reads,[[123,'points',434],[124,'points',434],[123,'points_1q',434],[123,'points',435],[123,'points',null]].map(([id,market,player])=>({p_game_id:id,p_mode:'pregame',p_feed:'props',p_tipoff:'2026-10-19T23:00:00.000Z',p_selection:'history',p_market:market,p_player_id:player,p_as_of:null})))
  assert.equal(h.entries.size,5)
})

test('NBA history expires at sixty seconds, rejects failed refreshes instead of stale prices, and recovers', async () => {
  const h = await harness(), { getNbaMarketFrames } = await h.instance()
  const first = await getNbaMarketFrames(123, 'points')
  h.advance(59_999)
  assert.deepEqual(await getNbaMarketFrames(123, 'points'), first); assert.equal(h.reads.length, 1)
  h.advance(2); h.fail(true)
  await assert.rejects(() => getNbaMarketFrames(123, 'points'), /phase history unavailable/)
  assert.equal(h.reads.length, 2)
  h.fail(false)
  await assert.rejects(() => getNbaMarketFrames(123, 'points'), /phase history unavailable/, 'failure cooldown prevents immediate retry storms')
  h.advance(15001)
  const fresh = await getNbaMarketFrames(123, 'points')
  assert.notEqual(fresh[0].captured_at, first[0].captured_at); assert.equal(h.reads.length, 3)
})

test('NBA history preserves empty latest frames and caches a genuinely empty archive', async () => {
  const h = await harness(), { getNbaMarketFrames } = await h.instance()
  const frames: PaintFrame[] = [{ captured_at: '2026-10-19T14:20:00Z', props: [] }, { captured_at: '2026-10-19T14:25:00Z', props: [] }]
  h.setResult(frames.map(frame=>({captured_at:frame.captured_at,quotes:frame.props,fingerprint:'fixture'})))
  assert.deepEqual(await getNbaMarketFrames(123, 'points'), frames)
  h.setResult([])
  assert.deepEqual(await getNbaMarketFrames(124, 'points'), [])
  assert.deepEqual(await getNbaMarketFrames(124, 'points'), []); assert.equal(h.reads.length, 2)
})

test('NBA history rejects malformed or unexpectedly unbounded archive responses', async () => {
  const h = await harness(), { getNbaMarketFrames } = await h.instance()
  h.setResult({ frames: [] })
  await assert.rejects(() => getNbaMarketFrames(123, 'points'), /phase history unavailable/)
  h.setResult(Array.from({ length: 97 }, () => ({ captured_at: '2026-10-19T14:25:00Z', props: [] })))
  await assert.rejects(() => getNbaMarketFrames(123, 'points'), /phase history unavailable/)
  assert.equal(h.entries.size, 0)
})
