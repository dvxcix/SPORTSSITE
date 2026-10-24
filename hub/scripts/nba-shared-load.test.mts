import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import * as crypto from 'node:crypto'
import ts from 'typescript'
import * as paint from '../src/lib/nbaPaint.ts'
import * as primaryProps from '../src/lib/nbaPrimaryProps.ts'
import * as firstMarkets from '../src/lib/nbaFirstBasketMarkets.ts'
import { nbaAttachOpenings } from '../src/lib/nbaOddsHistory.ts'
import * as oddsMode from '../src/lib/nbaOddsMode.ts'

async function compiled<T>(file: string, imports: Record<string, unknown>, globals: Record<string, unknown> = {}): Promise<T> {
  const source = await readFile(new URL(file, import.meta.url), 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const target = { exports: {} }
  new Function('require', 'module', 'exports', ...Object.keys(globals), output)((name: string) => { assert.ok(name in imports, name); return imports[name] }, target, target.exports, ...Object.values(globals))
  return target.exports as T
}
type Entry = { payload?: unknown; fetched_at?: string; expires_at?: string; lease_token?: string | null; lease_until?: string | null }
async function cacheHarness() {
  let now = Date.parse('2026-10-20T12:00:00Z'), reads = 0, claims = 0, writes = 0
  let beforeClaim: (() => Promise<void>) | undefined
  const entries = new Map<string, Entry>()
  class Clock extends Date { constructor(value: string | number = now) { super(value) } static now() { return now } }
  const admin = {
    from: () => ({
      select: () => ({ eq: (_column: string, key: string) => ({ abortSignal: () => ({ maybeSingle: async () => { reads++; return { data: entries.get(key) ?? null, error: null } } }) }) }),
      update: (patch: Entry) => ({ eq: (_column: string, key: string) => ({ eq: async (_token: string, token: string) => { const entry = entries.get(key); if (entry?.lease_token === token) entries.set(key, { ...entry, ...patch }); return { error: null } } }) }),
    }),
    rpc: async (name: string, args: Record<string, unknown>) => {
      const key = String(args.p_key)
      if (name === 'claim_nba_source') {
        await beforeClaim?.()
        const entry = entries.get(key) ?? {}
        claims++
        if (Date.parse(entry.lease_until ?? '') > now) return { data: false, error: null }
        entries.set(key, { ...entry, lease_token: String(args.p_token), lease_until: new Clock(now + Number(args.p_seconds) * 1000).toISOString() })
        return { data: true, error: null }
      }
      assert.equal(name, 'finish_nba_source')
      const entry = entries.get(key) ?? {}
      if (entry.lease_token !== args.p_token) return { data: false, error: null }
      writes++
      entries.set(key, { payload: args.p_payload, fetched_at: new Clock().toISOString(), expires_at: new Clock(now + Number(args.p_ttl) * 1000).toISOString(), lease_token: null, lease_until: null })
      return { data: true, error: null }
    },
  }
  const instance = () => compiled<typeof import('../src/lib/nbaSharedCache.ts')>('../src/lib/nbaSharedCache.ts', { 'server-only': {}, 'node:crypto': crypto, './supabase/admin': { createAdminClient: () => admin } }, { Date: Clock, setTimeout: (callback: () => void) => setTimeout(callback, 1) })
  return { instance, entries, Clock, onClaim: (hook: () => Promise<void>) => { beforeClaim = hook }, advance: (milliseconds: number) => { now += milliseconds }, metrics: () => ({ reads, claims, writes }) }
}

async function defenseHarness(gamesPerTeam: Record<number, number> = { 2026: 1, 2025: 5 }, failureTable?: string) {
  const cache = await cacheHarness(), gameReads = new Map<number, number>()
  const admin = { from(table: string) {
    const filters = new Map<string, unknown>()
    const result = (data: unknown) => ({ data, error: table === failureTable ? { message: 'fixture database outage' } : null })
    const query = {
      select() { return query },
      eq(key: string, value: unknown) { filters.set(key, value); return query },
      lt() { return query }, order() { return query }, in() { return query },
      async maybeSingle() { return result({ complete: true, rows_seen: 0, updated_at: '2026-10-20T11:00:00Z' }) },
      async limit() {
        assert.equal(table, 'nba_games')
        const season = Number(filters.get('season'))
        gameReads.set(season, (gameReads.get(season) ?? 0) + 1)
        return result(Array.from({ length: (gamesPerTeam[season] ?? 0) * 15 }, (_, index) => ({ payload: {
          id: season * 1000 + index, status: 'Final', season,
          home_team: { id: index % 15 * 2 + 1 }, visitor_team: { id: index % 15 * 2 + 2 },
        } })))
      },
      async range() { assert.ok(['nba_player_game_stats', 'nba_player_period_stats'].includes(table)); return result([]) },
    }
    return query
  } }
  const instance = async () => compiled<typeof import('../src/lib/nbaIntelligenceData.ts')>('../src/lib/nbaIntelligenceData.ts', {
    'server-only': {}, './supabase/admin': { createAdminClient: () => admin }, './nbaSharedCache': await cache.instance(),
    './nbaIntelligence': { nbaDefenseProfiles: () => [] }, './nbaPaint': paint,
  })
  return { ...cache, gameReads, instance }
}

test('early-season defense coverage falls back across independent cache instances and serialized cache hits', async () => {
  const h = await defenseHarness(), instances = await Promise.all(Array.from({ length: 12 }, h.instance))
  const before = '2026-10-20'
  h.entries.set(`dvp:v5:2026:${before}:true`, { lease_token: null, lease_until: new h.Clock(h.Clock.now() + 15000).toISOString() })
  const results = await Promise.all(Array.from({ length: 120 }, (_, index) => instances[index % 12].getNbaDefenseContext(2026, before)))
  assert.ok(results.every(result => result.ready && result.season === 2025 && result.before === before && !result.stale))
  assert.equal(h.gameReads.get(2026), 1); assert.equal(h.gameReads.get(2025), 1)
  assert.equal(h.metrics().writes, 2)
  const entry = h.entries.get(`dvp:v6:2026:${before}:true`)!
  assert.equal((entry.payload as { ready: boolean }).ready, false)
  assert.equal(entry.lease_until, null, 'inadequate coverage is not a source failure cooldown')
  // A new server sees only the serialized payload, with no Error subclass or local memory.
  for (const [key, value] of h.entries) h.entries.set(key, JSON.parse(JSON.stringify(value)))
  const fresh = await h.instance(), result = await fresh.getNbaDefenseContext(2026, before)
  assert.deepEqual(result, results[0])
  assert.equal(h.gameReads.get(2026), 1); assert.equal(h.gameReads.get(2025), 1)
})

test('complete current-season defense coverage is retained without loading a previous season', async () => {
  const h = await defenseHarness({ 2026: 5 }), owner = await h.instance()
  const result = await owner.getNbaDefenseContext(2026, '2026-10-20')
  assert.equal(result.ready, true); assert.equal(result.season, 2026); assert.equal(result.games, 75)
  assert.equal(h.gameReads.get(2025), undefined)
  const follower = await h.instance()
  assert.deepEqual(await follower.getNbaDefenseContext(2026, '2026-10-20'), result)
  assert.equal(h.gameReads.get(2026), 1)
})

test('unavailable prior-season defense remains unavailable and never recurses into another season', async () => {
  const h = await defenseHarness({ 2026: 1, 2025: 4 }), owner = await h.instance()
  const result = await owner.getNbaDefenseContext(2026, '2026-10-20')
  assert.equal(result.ready, false); assert.equal(result.season, 2025); assert.deepEqual(result.profiles, [])
  assert.deepEqual([...h.gameReads.keys()], [2026, 2025])
  const follower = await h.instance()
  assert.deepEqual(await follower.getNbaDefenseContext(2026, '2026-10-20'), result)
  const direct = await follower.getNbaDefenseContext(2026, '2026-10-20', false)
  assert.equal(direct.ready, false); assert.equal(direct.season, 2026)
  assert.equal(h.metrics().writes, 2)
})

test('actual defense database failures still reject instead of becoming expected coverage or a prior-season fallback', async () => {
  for (const table of ['nba_ingestion_state', 'nba_games', 'nba_player_game_stats', 'nba_player_period_stats']) {
    const h = await defenseHarness({ 2026: 5, 2025: 5 }, table), owner = await h.instance()
    await assert.rejects(() => owner.getNbaDefenseContext(2026, '2026-10-20'), /unavailable/)
    const follower = await h.instance()
    await assert.rejects(() => follower.getNbaDefenseContext(2026, '2026-10-20'), /unavailable/)
    assert.equal(h.gameReads.get(2025), undefined, table)
    assert.equal(h.metrics().writes, 0, table)
  }
})

test('6,000 simultaneous NBA readers across twelve instances use one upstream refresh and bounded database reads', async () => {
  const h = await cacheHarness(), instances = await Promise.all(Array.from({ length: 12 }, h.instance))
  let loads = 0
  const load = async () => { loads++; await Promise.resolve(); return { gameId: 123, odds: 550 } }
  const result = await Promise.all(Array.from({ length: 6000 }, (_, index) => instances[index % instances.length].nbaSharedCache('first-quotes', 60, 0, load)))
  assert.equal(loads, 1)
  assert.ok(result.every(row => row.value.gameId === 123 && row.value.odds === 550 && !row.stale))
  assert.equal(h.metrics().writes, 1)
  assert.ok(h.metrics().reads <= 36, JSON.stringify(h.metrics()))
  const before = h.metrics().reads
  await Promise.all(Array.from({ length: 6000 }, (_, index) => instances[index % instances.length].nbaSharedCache('first-quotes', 60, 0, load)))
  assert.equal(h.metrics().reads, before, 'warm instance memory avoids a database read per member')
  assert.equal(loads, 1)
})

test('shared failure cooldown prevents cross-instance retry storms without serving expired odds', async () => {
  const h = await cacheHarness(), owner = await h.instance()
  let loads = 0
  const load = async () => { loads++; throw Error('fixture outage') }
  await assert.rejects(() => owner.nbaSharedCache('failed-quotes', 30, 0, load), /fixture outage/)
  const followers = await Promise.all(Array.from({ length: 12 }, h.instance))
  const result = await Promise.allSettled(Array.from({ length: 6000 }, (_, index) => followers[index % followers.length].nbaSharedCache('failed-quotes', 30, 0, load)))
  assert.ok(result.every(row => row.status === 'rejected'))
  assert.equal(loads, 1)
  assert.equal(h.metrics().claims, 1)
  h.advance(15001)
  const recovered = await followers[0].nbaSharedCache('failed-quotes', 30, 0, async () => { loads++; return { odds: 600 } })
  assert.equal(recovered.value.odds, 600)
  assert.equal(loads, 2)
})

test('shorter TTL callers cannot inherit longer freshness from database or memory; strict callers cannot inherit stale fallback', async () => {
  const h = await cacheHarness(), cache = await h.instance()
  let loads = 0
  await cache.nbaSharedCache('shared', 3600, 0, async () => { loads++; return 1 })
  h.advance(16000)
  assert.equal((await cache.nbaSharedCache('shared', 15, 0, async () => { loads++; return 2 })).value, 2)
  assert.equal(loads, 2)
  h.advance(16000)
  const stale = await cache.nbaSharedCache('shared', 15, 300, async () => { throw Error('fixture') })
  assert.equal(stale.stale, true); assert.equal(stale.value, 2)
  await assert.rejects(() => cache.nbaSharedCache('shared', 15, 0, async () => 999), /temporarily unavailable/)
  h.entries.set('short-database-expiry', { payload: 3, fetched_at: new h.Clock().toISOString(), expires_at: new h.Clock(h.Clock.now() + 5000).toISOString() })
  assert.equal((await cache.nbaSharedCache('short-database-expiry', 3600, 0, async () => 4)).value, 3)
  h.advance(5001)
  assert.equal((await cache.nbaSharedCache('short-database-expiry', 3600, 0, async () => 4)).value, 4, 'memory cannot extend the database expiration')
})

test('simultaneous strict and stale-tolerant callers never share a stale fallback', async () => {
  const h = await cacheHarness(), cache = await h.instance()
  await cache.nbaSharedCache('mixed-policy', 15, 0, async () => 1)
  h.advance(16000)
  const result = await Promise.allSettled([
    cache.nbaSharedCache('mixed-policy', 15, 300, async () => { await Promise.resolve(); throw Error('fixture outage') }),
    cache.nbaSharedCache('mixed-policy', 15, 0, async () => 999),
  ])
  assert.equal(result[0].status, 'fulfilled')
  if (result[0].status === 'fulfilled') { assert.equal(result[0].value.value, 1); assert.equal(result[0].value.stale, true) }
  assert.equal(result[1].status, 'rejected')
})

test('a delayed claim reuses another owner’s completed observation without fetching or restamping it', async () => {
  const h = await cacheHarness(), [delayed, fast] = await Promise.all([h.instance(), h.instance()])
  let resume!: () => void, entered!: () => void, first = true, loads = 0
  const waiting = new Promise<void>(resolve => { resume = resolve }), claimed = new Promise<void>(resolve => { entered = resolve })
  h.onClaim(async () => { if (first) { first = false; entered(); await waiting } })
  const load = async () => { loads++; return { odds: 600 } }
  const slow = delayed.nbaSharedCache('late-claim', 30, 0, load)
  await claimed
  const current = await fast.nbaSharedCache('late-claim', 30, 0, load)
  h.advance(3000); resume()
  const result = await slow
  assert.equal(loads, 1); assert.equal(h.metrics().writes, 1)
  assert.equal(result.fetchedAt, current.fetchedAt)
  assert.equal(h.entries.get('late-claim')?.lease_token, null)
})

test('the extended research lease protects a slow owner beyond the prior fifty-five second lease', async () => {
  const h = await cacheHarness(), [owner, follower] = await Promise.all([h.instance(), h.instance()])
  let resume!: () => void, entered!: () => void, loads = 0
  const waiting = new Promise<void>(resolve => { resume = resolve }), started = new Promise<void>(resolve => { entered = resolve })
  const load = async () => { loads++; entered(); await waiting; return { ready: true } }
  const first = owner.nbaSharedCache('slow-research', 60, 300, load, 120)
  await started; h.advance(60000)
  const second = follower.nbaSharedCache('slow-research', 60, 300, load, 120)
  await Promise.resolve(); resume()
  const result = await Promise.all([first, second])
  assert.equal(loads, 1); assert.equal(h.metrics().writes, 1)
  assert.ok(result.every(row => row.value.ready && !row.stale))
})

test('memory cache supports the complete popular slate while enforcing a byte budget', async () => {
  const h = await cacheHarness(), cache = await h.instance()
  for (let index = 0; index < 140; index++) await cache.nbaSharedCache(`slate:${index}`, 60, 0, async () => ({ index }))
  const before = h.metrics().reads
  for (let index = 0; index < 140; index++) assert.equal((await cache.nbaSharedCache(`slate:${index}`, 60, 0, async () => ({ index: -1 }))).value.index, index)
  assert.equal(h.metrics().reads, before)
  const large = 'x'.repeat(5 * 1024 * 1024)
  for (let index = 0; index < 8; index++) await cache.nbaSharedCache(`large:${index}`, 60, 0, async () => large)
  const after = h.metrics().reads
  assert.equal((await cache.nbaSharedCache('large:0', 60, 0, async () => 'wrong')).value, large)
  assert.equal(h.metrics().reads, after + 1, '32 MiB budget evicts an old large entry and retrieves its shared value without an upstream refresh')
})

test('a stale research board cannot carry stale player or game prices into a new response', async () => {
  const game = { id: 123, date: '2026-10-20', datetime: '2026-10-20T23:00:00Z', status: 'Scheduled', status_state: 'scheduled', period: 0 } as paint.PaintGame
  const old = { game_id: 123, player_id: 434, prop_type: 'points', vendor: 'fanduel', line_value: '15', market: { type: 'milestone', odds: -200 } } as paint.PaintProp
  const provider = await compiled<typeof import('../src/lib/nbaPaintData.ts')>('../src/lib/nbaPaintData.ts', {
    'server-only': {}, 'node:crypto': crypto, '@/lib/balldontlie': { bdlHeaders: {} }, './nbaPaint': { ...paint, nbaToday: () => game.date }, './nbaOddsHistory': { nbaAttachOpenings },
    './nbaPrimaryProps': primaryProps, './nbaSupplementalProps': { nbaSupplementalQuote: (quote: { id: number }) => quote.id <= -1_000_000_000_000, getNbaSupplementalProps: async () => ({ props: [], complete: true, accepted: 0, unmatched: 0, stale: 0, eventMatched: true, applicable: true, observedAt: new Date().toISOString(), quota: null }), nbaMergePropSources: (primary: paint.PaintProp[], supplemental: paint.PaintProp[]) => [...primary, ...supplemental] },
    './nbaOddsHistoryData': { getNbaQuoteOpenings: async () => [] }, './nbaFirstBasketOddsData': { getNbaFirstOddsForMode: async () => { throw Error('fixture') } },
    './nbaOddsMode': { ...oddsMode, nbaPregameOpen: () => true }, './nbaOddsPhaseData': {}, './nbaOddsClockData': { getNbaOddsGame: async (game: paint.PaintGame) => game },
    './nbaSharedCache': { nbaSharedCache: async (key: string) => {
      if (key.startsWith('board:')) return { value: { players: [{ id: 434, props: [old] }], gameOdds: [{ stale: true }], issues: [] }, fetchedAt: '2026-10-20T11:00:00Z', stale: true }
      throw Error('quotes unavailable')
    } },
  }, { Date: class extends Date { static now() { return Date.parse('2026-10-20T12:00:00Z') } } })
  const board = await provider.getPaintBoard(game)
  assert.deepEqual(board.players[0].props, [])
  assert.deepEqual(board.gameOdds, [])
  assert.ok(board.issues.includes('Sportsbook prices unavailable'))
})

test('cold board research finishes before current quote reads begin', async () => {
  let now = Date.parse('2026-10-20T12:00:00Z'), researchFinished = false, priceReads = 0
  class Clock extends Date { static now() { return now } }
  const game = { id: 123, date: '2026-10-20', datetime: '2026-10-20T23:00:00Z', status: 'Scheduled', status_state: 'scheduled', period: 0 } as paint.PaintGame
  const offer = { game_id: 123, player_id: 434, prop_type: 'points', vendor: 'fanduel', line_value: '15', market: { type: 'milestone', odds: -110 }, updated_at: new Date(now).toISOString() } as paint.PaintProp
  const provider = await compiled<typeof import('../src/lib/nbaPaintData.ts')>('../src/lib/nbaPaintData.ts', {
    'server-only': {}, 'node:crypto': crypto, '@/lib/balldontlie': { bdlHeaders: {} }, './nbaPaint': { ...paint, nbaToday: () => game.date }, './nbaOddsHistory': { nbaAttachOpenings },
    './nbaPrimaryProps': primaryProps, './nbaSupplementalProps': { nbaSupplementalQuote: (quote: { id: number }) => quote.id <= -1_000_000_000_000, getNbaSupplementalProps: async () => ({ props: [], complete: true, accepted: 0, unmatched: 0, stale: 0, eventMatched: true, applicable: true, observedAt: new Date().toISOString(), quota: null }), nbaMergePropSources: (primary: paint.PaintProp[], supplemental: paint.PaintProp[]) => [...primary, ...supplemental] },
    './nbaOddsHistoryData': { getNbaQuoteOpenings: async () => [] }, './nbaFirstBasketOddsData': { getNbaFirstOddsForMode: async () => ({ rows: [] }) },
    './nbaOddsMode': { ...oddsMode, nbaPregameOpen: () => true }, './nbaOddsPhaseData': {}, './nbaOddsClockData': { getNbaOddsGame: async (game: paint.PaintGame) => game },
    './nbaSharedCache': { nbaSharedCache: async (key: string, _ttl: number, _stale: number, load: () => Promise<unknown>, lease: number) => {
      if (key.startsWith('board:')) {
        assert.equal(lease, 120)
        await Promise.resolve(); now += 60000; researchFinished = true
        return { value: { players: [{ id: 434, props: [] }], issues: [] }, fetchedAt: new Date(now).toISOString(), stale: false }
      }
      assert.ok(researchFinished, 'a cold research wait must not age current prices')
      return { value: await load(), fetchedAt: new Date(now).toISOString(), stale: false }
    } },
  }, { Date: Clock, fetch: async (url: string) => { priceReads++; return Response.json({ data: url.includes('player_props') ? [offer] : [] }) } })
  const board = await provider.getPaintBoard(game)
  assert.equal(priceReads, 2)
  assert.equal(board.players[0].props[0].market.odds, -110)
})

test('concurrent member pick submissions share public validation inputs but still reject a different exact saved price', async () => {
  const h = await cacheHarness(), caches = await Promise.all(Array.from({ length: 6 }, h.instance))
  let games = 0, quotes = 0
  const game = { id: 123, date: '2026-10-20', datetime: '2026-10-20T23:00:00Z', status: 'Scheduled', status_state: 'scheduled', home_team: { id: 2 }, visitor_team: { id: 9 } }
  const offer = { game_id: 123, player_id: 434, prop_type: 'points', vendor: 'fanduel', line_value: '15', market: { type: 'milestone', odds: -110 } }
  const instances = await Promise.all(caches.map(cache => compiled<typeof import('../src/lib/nbaPickValidation.ts')>('../src/lib/nbaPickValidation.ts', {
    'server-only': {}, './nbaPaint': paint, './nbaFirstBasketMarkets': firstMarkets, './nbaFirstBasketOddsData': {}, './nbaSharedCache': cache,
    './nbaSupplementalProps': { nbaSupplementalQuote: (quote: { id: number }) => quote.id <= -1_000_000_000_000 },
    './nbaPaintData': { getPaintGame: async () => { games++; return game }, getPaintProps: async () => { quotes++; return [offer] }, getPaintIdentity: async () => ({ first_name: 'Real', last_name: 'Player', team: { id: 2, abbreviation: 'BOS' } }) },
  }, { Date: h.Clock })))
  const leg = { game_pk: '123', player_id: 'bdl:434', player_name: 'Real Player', team: 'BOS', game_date: game.date, prop_key: 'points', prop_label: '15+ points', numeric_line: 15, market_side: 'milestone' as const, book: 'fanduel', odds: -110 }
  const result = await Promise.all(Array.from({ length: 600 }, (_, index) => instances[index % 6].validatePaintPickLegs([{ ...leg, odds: index % 2 ? -110 : 100 }])))
  assert.equal(games, 1); assert.equal(quotes, 1)
  assert.equal(result.filter(value => value == null).length, 300)
  assert.ok(result.filter(value => value != null).every(value => value!.includes('price changed')))
})

test('NBA focus events obey the normal polling cadence, wait for in-flight work and stop after cleanup', async () => {
  let now = 100000, calls = 0, timer: (() => void) | undefined, timerDelay = 0, pending: (() => void) | undefined
  const listeners = new Map<string, () => void>()
  const browser = { addEventListener: (name: string, fn: () => void) => listeners.set(name, fn), removeEventListener: (name: string) => listeners.delete(name) }
  const refresh = await compiled<typeof import('../src/lib/nbaRefresh.ts')>('../src/lib/nbaRefresh.ts', {}, {
    Date: { now: () => now }, Math: { ...Math, max: Math.max, floor: Math.floor, random: () => .5 },
    document: { ...browser, visibilityState: 'visible' }, window: browser,
    setTimeout: (callback: () => void, ms: number) => { timer = callback; timerDelay = ms; return 1 }, clearTimeout: () => { timer = undefined },
  })
  const stop = refresh.watchNbaRefresh(() => { calls++; return new Promise<void>(resolve => { pending = resolve }) })
  for (let i = 0; i < 100; i++) listeners.get('focus')!()
  assert.equal(calls, 0); assert.equal(timerDelay, 63000)
  now += 60000; listeners.get('focus')!(); assert.equal(calls, 1)
  now += 60000; timer!(); listeners.get('visibilitychange')!(); assert.equal(calls, 1)
  pending!(); await Promise.resolve(); listeners.get('focus')!(); assert.equal(calls, 2)
  stop(); assert.equal(timer, undefined); assert.equal(listeners.size, 0)
})
