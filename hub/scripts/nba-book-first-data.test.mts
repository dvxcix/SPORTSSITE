import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import * as mode from '../src/lib/nbaOddsMode.ts'
import { nbaValidOdds } from '../src/lib/nbaOddsHistory.ts'
import * as paint from '../src/lib/nbaPaint.ts'
import * as firstOdds from '../src/lib/nbaFirstBasketOdds.ts'
import * as bookCurrent from '../src/lib/nbaBookCurrent.ts'
import type { PaintGame, PaintProp } from '../src/lib/nbaPaint.ts'
import type { NbaBookFirstFrame, NbaFirstBook } from '../src/lib/nbaBookFirstData.ts'

const now = Date.parse('2026-10-24T11:00:00Z')
const game = { id: 123, date: '2026-10-24', datetime: '2026-10-24T23:00:00Z', status: 'Scheduled', status_state: 'scheduled', period: 0 } as PaintGame
const offer = (player = 434, book: NbaFirstBook = 'draftkings', at = now - 1000): PaintProp => ({ id: -3_000_000_000_000 - player, player_id: player, game_id: game.id, vendor: book, prop_type: book === 'draftkings' ? 'first_score' : 'first_field_goal', line_value: '0.5', market: { type: 'over_under', over_odds: 900 }, updated_at: new Date(at).toISOString() })
const frame = (book: NbaFirstBook = 'draftkings', at = now - 1000, players = [434]): NbaBookFirstFrame => ({ gameId: game.id, book, tipoff: new Date(game.datetime!).toISOString(), observedAt: new Date(at).toISOString(), props: players.map(player => offer(player, book, at)), complete: true })
type Entry = { key: string; payload: unknown; fetched_at?: string; expires_at?: string; lease_token?: null; lease_until?: null }

async function harness() {
  let clock = now, reads = 0, writes = 0, readError = false, writeError = false, receipt: unknown = {cached:1,captured:1,unchanged:0}
  const entries = new Map<string, Entry>(), cached = new Map<string, unknown>(), cacheCalls: { key: string; ttl: number; stale: number; lease: number }[] = []
  class Clock extends Date { constructor(value: string | number = clock) { super(value) } static now() { return clock } }
  const admin = { from: (table: string) => {
    assert.equal(table, 'nba_source_cache')
    return {
      select: (columns: string) => { assert.equal(columns, 'key,payload'); return { in: (column: string, keys: string[]) => {
        assert.equal(column, 'key'); assert.equal(keys.length, 2); assert.equal(new Set(keys).size, 2)
        return { abortSignal: async (signal: AbortSignal) => { assert.ok(signal instanceof AbortSignal); reads++; return { data: keys.flatMap(key => entries.has(key) ? [structuredClone(entries.get(key)!)] : []), error: readError ? { message: 'private diagnostic' } : null } } }
      } } },
    }
  }, rpc:(name:string,args:{p_game_id:number;p_game_date:string;p_tipoff:string;p_feed:string;p_book:string;p_frames:NbaBookFirstFrame[]})=>{
    assert.equal(name,'record_nba_book_frames');assert.equal(args.p_game_id,game.id);assert.equal(args.p_game_date,game.date);assert.equal(args.p_tipoff,new Date(game.datetime!).toISOString());assert.equal(args.p_feed,'first');assert.equal(args.p_frames.length,1)
    const value=args.p_frames[0];assert.equal(args.p_book,value.book)
    return{abortSignal:async(signal:AbortSignal)=>{assert.ok(signal instanceof AbortSignal);writes++;
      if(!writeError){const key=`book-first:v1:${game.id}:${Date.parse(game.datetime!)}:${value.book}`;entries.set(key,{key,payload:structuredClone(value),fetched_at:value.observedAt,expires_at:new Date(Date.parse(value.observedAt)+300000).toISOString(),lease_token:null,lease_until:null})}
      return{data:receipt,error:writeError?{message:'private diagnostic'}:null}
    }}
  } }
  const imports: Record<string, unknown> = {
    'server-only': {}, './supabase/admin': { createAdminClient: () => admin }, './nbaOddsHistory': { nbaValidOdds },
    './nbaBookCurrent': bookCurrent,
    './nbaOddsMode': { ...mode, nbaPregameOpen: (value: PaintGame, at = clock) => mode.nbaPregameOpen(value, at) },
    './nbaSharedCache': { nbaSharedCache: async (key: string, ttl: number, stale: number, load: () => Promise<unknown>, lease: number) => { cacheCalls.push({ key, ttl, stale, lease }); if (!cached.has(key)) cached.set(key, await load()); return { value: cached.get(key) } } },
  }
  const source = await readFile(new URL('../src/lib/nbaBookFirstData.ts', import.meta.url), 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const target = { exports: {} }
  new Function('require', 'module', 'exports', 'Date', 'fetch', output)((name: string) => { assert.ok(name in imports, `Unexpected dependency: ${name}`); return imports[name] }, target, target.exports, Clock, () => { throw Error('Member reads must never open a browser or fetch a sportsbook') })
  return { api: target.exports as typeof import('../src/lib/nbaBookFirstData.ts'), entries, cacheCalls, Clock, now: () => clock, time: (at: number) => { clock = at }, errors: (read: boolean, write = false) => { readError = read; writeError = write },receipt:(value:unknown)=>{receipt=value}, metrics: () => ({ reads, writes }) }
}

test('verified direct frames bind exact game, book, canonical tip, market and observation time', async () => {
  const { api } = await harness()
  assert.ok(api.nbaValidBookFirstFrame(frame(), game, 'draftkings'))
  assert.ok(api.nbaValidBookFirstFrame(frame('betmgm'), game, 'betmgm'))
  assert.ok(api.nbaValidBookFirstFrame(frame('draftkings', now - 1000, []), game, 'draftkings'), 'verified empty is distinct from malformed')
  for (const invalid of [null, [], {}, { ...frame(), complete: false }, { ...frame(), gameId: 999 }, { ...frame(), book: 'betmgm' }, { ...frame(), tipoff: '2026-10-25T23:00:00Z' }, { ...frame(), observedAt: 'invalid' }, frame('draftkings', Date.parse(game.datetime!)), frame('draftkings', now - 1000, Array.from({ length: 51 }, (_, index) => index + 1))]) {
    assert.equal(api.nbaValidBookFirstFrame(invalid, game, 'draftkings'), false)
  }
  assert.equal(api.nbaValidBookFirstFrame(frame(), { ...game, datetime: null }, 'draftkings'), false)
})

test('invalid prices, duplicate identities and different line, side, game or observation cannot certify a direct frame', async () => {
  const { api } = await harness(), original = offer()
  const invalid: PaintProp[] = [
    { ...original, player_id: 0 }, { ...original, player_id: 10_000_000_000_000 }, { ...original, id: NaN }, { ...original, id: 123 }, { ...original, game_id: 999 }, { ...original, vendor: 'fanduel' },
    { ...original, prop_type: 'team_first_score' }, { ...original, line_value: '1.5' }, { ...original, updated_at: new Date(now - 2000).toISOString() },
    { ...original, market: { type: 'over_under', over_odds: 0 } }, { ...original, market: { type: 'over_under', under_odds: 900 } },
    { ...original, market: { type: 'over_under', over_odds: 900, under_odds: -1100 } }, { ...original, market: { type: 'milestone', odds: 900 } },
  ]
  for (const prop of invalid) assert.equal(api.nbaValidBookFirstFrame({ ...frame(), props: [prop] }, game, 'draftkings'), false)
  assert.equal(api.nbaValidBookFirstFrame({ ...frame(), props: [original, { ...original, id: -999 }] }, game, 'draftkings'), false)
})

test('equal-time primary prices stay intact and different contracts remain independent', async () => {
  const { api } = await harness()
  const entries = ['draftkings', 'betmgm'].map(book => ({ key: api.nbaBookFirstKey(game, book as NbaFirstBook), payload: frame(book as NbaFirstBook) }))
  const primary = { ...offer(), market: { type: 'over_under' as const, over_odds: 1100 } }
  const supplemented = api.nbaBookFirstSupplement(game, [primary], entries, now)
  assert.equal(supplemented.complete, true)
  assert.deepEqual(supplemented.props, [offer(434, 'betmgm')])
  assert.equal(primary.market.over_odds, 1100, 'equal observation times preserve the primary selection')
  for (const different of [{ ...primary, player_id: 435 }, { ...primary, game_id: 999 }, { ...primary, vendor: 'fanduel' }, { ...primary, prop_type: 'team_first_score' }, { ...primary, line_value: '1.5' }, { ...primary, market: { type: 'over_under' as const, under_odds: 1100 } }]) {
    assert.equal(api.nbaBookFirstSupplement(game, [different], entries.slice(0, 1), now).props.length, 1, 'a different or missing side cannot suppress the exact direct outcome')
  }
})

test('stale direct-only prices hold capture completeness, while matching fresh primary coverage needs no stale direct quote', async () => {
  const { api } = await harness()
  const entry = (payload: unknown) => [{ key: api.nbaBookFirstKey(game, 'draftkings'), payload }]
  assert.deepEqual(api.nbaBookFirstSupplement(game, [], entry(frame('draftkings', now - 300000)), now), { props: [offer(434, 'draftkings', now - 300000)], complete: true })
  assert.deepEqual(api.nbaBookFirstSupplement(game, [], entry(frame('draftkings', now - 300001)), now), { props: [], complete: false })
  assert.deepEqual(api.nbaBookFirstSupplement(game, [], entry(frame('draftkings', now + 1)), now), { props: [], complete: false })
  assert.deepEqual(api.nbaBookFirstSupplement(game, [offer()], entry(frame('draftkings', now - 300001)), now), { props: [], complete: true })
  assert.deepEqual(api.nbaBookFirstSupplement(game, [], entry({ ...frame(), complete: false }), now), { props: [], complete: false })
  assert.deepEqual(api.nbaBookFirstSupplement(game, [], [], now), { props: [], complete: true })
})

test('verified empty frames permit withdrawal, and closed phases never return direct pregame quotes', async () => {
  const { api } = await harness()
  const entries = [{ key: api.nbaBookFirstKey(game, 'draftkings'), payload: frame('draftkings', now - 1000, []) }]
  assert.deepEqual(api.nbaBookFirstSupplement(game, [], entries, now), { props: [], complete: true })
  const nonempty = [{ ...entries[0], payload: frame() }]
  assert.deepEqual(api.nbaBookFirstSupplement(game, [], nonempty, Date.parse(game.datetime!)), { props: [], complete: true })
  assert.deepEqual(api.nbaBookFirstSupplement({ ...game, period: 1 }, [], nonempty, now), { props: [], complete: true })
})

test('saving one current verified frame persists its real observation time, expiry and canonical key', async () => {
  const h = await harness(), value = frame()
  await h.api.saveNbaBookFirstFrame(game, value)
  assert.deepEqual(h.metrics(), { reads: 0, writes: 1 })
  assert.deepEqual(h.entries.get(h.api.nbaBookFirstKey(game, 'draftkings')), {
    key: `book-first:v1:123:${Date.parse(game.datetime!)}:draftkings`, payload: value, fetched_at: value.observedAt,
    expires_at: new Date(Date.parse(value.observedAt) + 300000).toISOString(), lease_token: null, lease_until: null,
  })
})

test('invalid, future, stale and post-tip saves never reach storage; DB failures remain sanitized failures', async () => {
  const h = await harness()
  for (const value of [{ ...frame(), complete: false } as unknown as NbaBookFirstFrame, frame('draftkings', now + 1), frame('draftkings', now - 300001)]) await assert.rejects(h.api.saveNbaBookFirstFrame(game, value), /^Error: NBA book observation unavailable$/)
  h.time(Date.parse(game.datetime!))
  await assert.rejects(h.api.saveNbaBookFirstFrame(game, frame()), /^Error: NBA book observation unavailable$/)
  assert.equal(h.metrics().writes, 0)
  h.time(now); h.errors(false, true)
  await assert.rejects(h.api.saveNbaBookFirstFrame(game, frame()), /^Error: NBA book observation could not be saved$/)
  assert.equal(h.entries.size, 0)
})

test('atomic First save requires a confirmed tape/cache receipt; unchanged retry is valid without restamping',async()=>{
  const h=await harness()
  for(const invalid of [null,{}, {cached:1,captured:0,unchanged:0},{cached:0,captured:1,unchanged:0},{cached:1,captured:-1,unchanged:2}]){h.receipt(invalid);await assert.rejects(h.api.saveNbaBookFirstFrame(game,frame()),/could not be saved/)}
  h.receipt({cached:1,captured:0,unchanged:1});await h.api.saveNbaBookFirstFrame(game,frame())
  assert.equal(h.entries.get(h.api.nbaBookFirstKey(game,'draftkings'))!.fetched_at,frame().observedAt)
})

test('member reads use two exact DB keys, shared bounded cache and no browser calls; freshness is rechecked on cache hits', async () => {
  const h = await harness(), value = frame('draftkings', now - 299000), key = h.api.nbaBookFirstKey(game, 'draftkings')
  h.entries.set(key, { key, payload: value })
  assert.equal((await h.api.getNbaBookFirstSupplement(game, [])).props.length, 1)
  assert.deepEqual(h.cacheCalls[0], { key: `book-first-read:v1:123:${Date.parse(game.datetime!)}`, ttl: 10, stale: 0, lease: 25 })
  h.time(now + 2000)
  assert.deepEqual(await h.api.getNbaBookFirstSupplement(game, []), { props: [], complete: false })
  assert.equal(h.metrics().reads, 1, 'aged prices are rejected even when the shared entry is reused')
  h.entries.set(key, { key, payload: frame('draftkings', now + 1000) })
  assert.equal((await h.api.getNbaBookFirstSupplement(game, [], true)).props.length, 1)
  assert.equal(h.metrics().reads, 2, 'only an explicit collector fresh read bypasses the read cache')
  h.time(Date.parse(game.datetime!))
  assert.deepEqual(await h.api.getNbaBookFirstSupplement(game, [], true), { props: [], complete: true })
  assert.equal(h.metrics().reads, 2, 'tipoff is checked before any database access')
})

test('source-cache read failures never become verified empty availability', async () => {
  const h = await harness(); h.errors(true)
  await assert.rejects(h.api.getNbaBookFirstSupplement(game, [], true), /^Error: NBA book observations unavailable$/)
  assert.equal(h.metrics().writes, 0)
})

test('aggregate First Basket deduplicates newer direct prices, applies exact withdrawals and rechecks expiry', async () => {
  for (const phaseWrapper of [false, true]) for (const scenario of ['missing','older-api','withdrawn']) {
    const hasOlderApi=scenario!=='missing',withdrawn=scenario==='withdrawn'
    const h = await harness(), key = h.api.nbaBookFirstKey(game, 'draftkings')
    h.entries.set(key, { key, payload: frame('draftkings', now - 299000,withdrawn?[]:[434]) })
    const home = { id: 2, abbreviation: 'BOS', full_name: 'Boston Celtics', name: 'Celtics' }, away = { id: 9, abbreviation: 'DET', full_name: 'Detroit Pistons', name: 'Pistons' }
    const match = { ...game, home_team: home, visitor_team: away }
    const event = { id: 'verified-event', commence_time: game.datetime!, home_team: home.full_name, away_team: away.full_name, bookmakers: hasOlderApi?[{key:'draftkings',markets:[{key:'player_first_basket',last_update:new Date(now-300000).toISOString(),outcomes:[{name:'Real Player',price:1100}]}]}]:[] }
    const cached = new Map<string, unknown>()
    let providerReads = 0
    const imports: Record<string, unknown> = {
      'server-only': {}, './nbaPaint': paint, './nbaFirstBasketOdds': {...firstOdds,nbaNormalizeFirstOdds:(event:firstOdds.FirstOddsEvent,game:PaintGame,players:paint.PaintPlayer[])=>firstOdds.nbaNormalizeFirstOdds(event,game,players,h.now())}, './nbaBookFirstData': h.api,
      './nbaOddsClockData': { getNbaOddsGame: async (value: PaintGame) => value },
      './nbaOddsMode': { ...mode, nbaPregameOpen: (value: PaintGame) => mode.nbaPregameOpen(value, h.now()), nbaLiveOpen: (value: PaintGame) => mode.nbaLiveOpen(value, h.now()) },
      './nbaOddsPhaseData': { getNbaPhaseSnapshot: async () => { throw Error('No archived result is needed before tip') } }, './supabase/admin': {},
      './nbaPaintData': { getPaintRoster: async () => [{ id: 434, first_name: 'Real', last_name: 'Player', team: home, position: 'G' }], artwork: async () => ({ headshots: new Map() }) },
      './nbaSharedCache': { nbaSharedCache: async (cacheKey: string, _ttl: number, _stale: number, load: () => Promise<unknown>) => { if (!cached.has(cacheKey)) cached.set(cacheKey, await load()); return { value: cached.get(cacheKey) } } },
    }
    const source = await readFile(new URL('../src/lib/nbaFirstBasketOddsData.ts', import.meta.url), 'utf8')
    const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
    const target = { exports: {} }
    new Function('require', 'module', 'exports', 'Date', 'fetch', 'process', output)((name: string) => { assert.ok(name in imports, name); return imports[name] }, target, target.exports, h.Clock,
      async (url: URL) => { providerReads++; return Response.json(url.pathname.endsWith('/events') ? [event] : event) }, { env: { ODDS_API_KEY: 'fixture-only' } })
    const api = target.exports as typeof import('../src/lib/nbaFirstBasketOddsData.ts')
    const load = () => phaseWrapper ? api.getNbaFirstOddsForMode(match) : api.getNbaFirstOdds(match)
    const initial=await load()
    assert.equal(initial.rows.length, withdrawn?0:1,'an older API quote cannot survive its replacement or verified withdrawal')
    if(!withdrawn){assert.equal(initial.rows[0].offer.market.over_odds,900);assert.equal(initial.rows[0].offer.updated_at,new Date(now-299000).toISOString())}
    h.time(now + 2000)
    const expired = await load()
    assert.deepEqual(expired.rows, [], 'each aggregate cache return must recheck the direct observation age')
    assert.equal('captureComplete' in expired ? expired.captureComplete : undefined, withdrawn, 'expiration of a formerly present price is not a verified sportsbook withdrawal')
    assert.equal(providerReads, 2, 'expiry must not create an extra member-triggered sportsbook request')
  }
})
