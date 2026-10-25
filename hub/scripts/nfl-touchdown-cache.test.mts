import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { AsyncLocalStorage } from 'node:async_hooks'
import * as crypto from 'node:crypto'
import ts from 'typescript'
import { normalizeNflPlayerName } from '../src/lib/nflPlayerName.ts'
import type { NflTouchdownEvent } from '../src/lib/nflTouchdownFeed.ts'

type FeedApi = typeof import('../src/lib/nflTouchdownFeed.ts')
type CacheApi = typeof import('../src/lib/nbaSharedCache.ts')
type Entry = { payload?: NflTouchdownEvent[]; fetched_at?: string; expires_at?: string; lease_token?: string | null; lease_until?: string | null }
const date = '2026-10-25', key = `nfl:touchdown-feed:v5:${date}`

async function compiled<T>(file: string, imports: Record<string, unknown>, globals: Record<string, unknown>) {
  const source = await readFile(new URL(file, import.meta.url), 'utf8'), target = { exports: {} }
  const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
  new Function('require', 'module', 'exports', ...Object.keys(globals), output)((name: string) => { assert.ok(name in imports, name); return imports[name] }, target, target.exports, ...Object.values(globals))
  return target.exports as T
}

async function harness() {
  let now = Date.parse('2026-10-25T19:00:00Z'), writes = 0, failing: string | null = null, stageDuration = 0
  const entries = new Map<string, Entry>(), reads = new Map<string, number>(), overrides = new Map<string, unknown>()
  const teams = [['KC', 'SEA'], ['IND', 'MIN']]
  const schedule = teams.map(([away_team, home_team], i) => ({ game_id: `game${i + 1}`, season: 2026, week: 7, game_type: 'REG', gameday: date, away_team, home_team }))
  const feeds = schedule.map((row, i) => {
    const game = { id: i + 100, date: `${date}T17:00:00Z`, status: 'In Progress', status_state: 'in_progress', visitor_team: { abbreviation: row.away_team }, home_team: { abbreviation: row.home_team } }
    const player = { id: i + 10, first_name: `Receiver${i}`, last_name: 'Fixture' }
    return { game_id: row.game_id, fetched_at: `${date}T18:59:00Z`, reconciled: false, payload: { game, stats: [{ player }], plays: [{ id: `play${i}`, game, type_slug: 'passing-touchdown', type_text: 'Touchdown', scoring_play: true, period: 1, clock_display: '8:00', team: { abbreviation: row.away_team }, participants: [{ type: 'receiver', player_id: player.id }], short_text: `${player.first_name} Fixture 20 Yd pass from Passer Fixture`, wallclock: `${date}T17:10:00Z`, away_score: 7, home_score: 0 }] } }
  })
  const board = (i: number, vendor: string) => ({ game_id: schedule[i].game_id, captured_at: `${date}T16:58:00Z`, board: { players: [{ id: i + 10, name: `Receiver${i} Fixture`, team: schedule[i].away_team, markets: [{ propType: 'anytime_td', label: 'Anytime Touchdown', line: 0.5, offers: [{ vendor, type: 'over_under', line: 0.5, current: { over: vendor === 'fanduel' ? 220 : 200 }, opening: { over: 250 }, updatedAt: `${date}T16:57:00Z` }] }] }] } })
  class Clock extends Date { constructor(value: string | number = now) { super(value) } static now() { return now } }
  const admin = {
    from(table: string) {
      if (table === 'nba_source_cache') return {
        select: () => ({ eq: (_c: string, cacheKey: string) => ({ abortSignal: () => ({ maybeSingle: async () => ({ data: structuredClone(entries.get(cacheKey) ?? null), error: null }) }) }) }),
        update: (patch: Entry) => ({ eq: (_c: string, cacheKey: string) => ({ eq: async (_t: string, token: string) => { const entry = entries.get(cacheKey); if (entry?.lease_token === token) entries.set(cacheKey, { ...entry, ...patch }); return { error: null } } }) }),
      }
      const filters = new Map<string, unknown>()
      const query = {
        select: () => query, eq: (column: string, value: unknown) => { filters.set(column, value); return query },
        in: (column: string, value: unknown) => { filters.set(column, value); return query }, order: () => query, limit: () => query,
        async abortSignal(signal: AbortSignal) {
          assert.ok(signal instanceof AbortSignal); reads.set(table, (reads.get(table) ?? 0) + 1)
          await Promise.resolve()
          if (['nfl_schedule', 'nfl_game_feeds', 'nfl_odds_current', 'nfl_players'].includes(table)) now += stageDuration
          if (failing === table) return { data: null, error: { message: 'fixture timeout' } }
          if (overrides.has(table)) return { data: structuredClone(overrides.get(table)), error: null }
          const data = table === 'nfl_schedule' ? schedule.filter(row => row.gameday === filters.get('gameday'))
            : table === 'nfl_teams' ? teams.flat().map(team_abbr => ({ team_abbr, team_logo_espn: 'fixture-logo', team_color: '#000000' }))
            : table === 'nfl_game_feeds' ? feeds
            : table === 'nfl_odds_current' ? schedule.map((_row, i) => board(i, 'draftkings'))
            : table === 'nfl_fanduel_capture_history' ? [board(schedule.findIndex(row => row.game_id === filters.get('game_id')), 'fanduel')]
            : table === 'nfl_players' ? schedule.map((row, i) => ({ gsis_id: `player${i}`, display_name: `Receiver${i} Fixture`, position: 'WR', headshot: 'fixture-headshot', latest_team: row.away_team }))
            : assert.fail(table)
          return { data: structuredClone(data), error: null }
        },
      }
      return query
    },
    async rpc(name: string, args: Record<string, unknown>) {
      const cacheKey = String(args.p_key), entry = entries.get(cacheKey) ?? {}
      if (name === 'claim_nba_source') {
        if (Date.parse(entry.lease_until ?? '') > now) return { data: false, error: null }
        entries.set(cacheKey, { ...entry, lease_token: String(args.p_token), lease_until: new Clock(now + Number(args.p_seconds) * 1000).toISOString() })
        return { data: true, error: null }
      }
      assert.equal(name, 'finish_nba_source')
      if (entry.lease_token !== args.p_token || Date.parse(entry.lease_until ?? '') <= now) return { data: false, error: null }
      writes++; entries.set(cacheKey, { payload: structuredClone(args.p_payload as NflTouchdownEvent[]), fetched_at: new Clock().toISOString(), expires_at: new Clock(now + Number(args.p_ttl) * 1000).toISOString(), lease_token: null, lease_until: null })
      return { data: true, error: null }
    },
  }
  async function instance() {
    const cache = await compiled<CacheApi>('../src/lib/nbaSharedCache.ts', { 'server-only': {}, 'node:crypto': crypto, './supabase/admin': { createAdminClient: () => admin } }, { Date: Clock, setTimeout: (callback: () => void) => setTimeout(callback, 1) })
    return compiled<FeedApi>('../src/lib/nflTouchdownFeed.ts', { '@/lib/supabase/admin': { createAdminClient: () => admin }, '@/lib/nflPlayerName': { normalizeNflPlayerName }, './nbaSharedCache': cache }, { Date: Clock })
  }
  return { instance, entries, reads, feeds, overrides, advance: (ms: number) => { now += ms }, fail: (table: string | null) => { failing = table }, setStageDuration: (ms: number) => { stageDuration = ms }, writes: () => writes }
}

test('installed Next nested result caches share one complete date feed across matchups', async () => {
  Object.assign(globalThis, { AsyncLocalStorage })
  const require = createRequire(import.meta.url)
  const { unstable_cache } = require('next/cache') as { unstable_cache<T extends (...args: never[]) => unknown>(fn: T, keys: string[], options: { revalidate: number }): T }
  const { workAsyncStorage } = require('next/dist/server/app-render/work-async-storage.external.js') as { workAsyncStorage: { run<T>(store: Record<string, unknown>, callback: () => Promise<T>): Promise<T> } }
  const saved = new Map<string, unknown>(), work = { incrementalCache: { generateSimpleCacheKey: async (value: string) => value, get: async (value: string) => saved.has(value) ? { value: saved.get(value), isStale: false } : null, set: async (value: string, result: unknown) => { saved.set(value, result) } } }
  const h = await harness(), reader = await h.instance()
  const outer = unstable_cache(async (gameId: string) => (await reader.getNflTouchdownFeed(date)).filter(event => event.gameId === gameId), ['fixture-public-results'], { revalidate: 30 })
  const results = await workAsyncStorage.run(work, () => Promise.all(['game1', 'game2'].map(id => outer(id))))
  assert.ok(results.every(rows => rows.length === 1)); assert.equal(h.reads.get('nfl_game_feeds'), 1); assert.equal(h.writes(), 1)
  assert.equal(results[0][0].marketQuotes.length, 2); assert.equal(results[0][0].occurredAt, `${date}T17:10:00Z`)
  assert.ok(results[0][0].marketQuotes.every(quote => quote.openingOdds === 250))
})

test('six independent server instances and36 callers use one refresh without changing event timestamps', async () => {
  const h = await harness(), readers = await Promise.all(Array.from({ length: 6 }, h.instance))
  const results = await Promise.all(Array.from({ length: 36 }, (_, i) => readers[i % readers.length].getNflTouchdownFeed(date)))
  assert.ok(results.every(rows => rows.length === 2 && rows[0].occurredAt === `${date}T17:10:00Z`))
  assert.equal(h.reads.get('nfl_game_feeds'), 1); assert.equal(h.reads.get('nfl_fanduel_capture_history'), 2); assert.equal(h.writes(), 1)
  const entry = h.entries.get(key)!
  assert.equal(Date.parse(entry.expires_at!) - Date.parse(entry.fetched_at!), 30_000)
  assert.equal(entry.lease_token, null)
})

for (const table of ['nfl_schedule', 'nfl_teams', 'nfl_game_feeds', 'nfl_odds_current', 'nfl_fanduel_capture_history', 'nfl_players']) {
  test(`${table} failure retains complete prior comparisons and original observation; cold failure rejects`, async () => {
    const h = await harness(), reader = await h.instance(), original = await reader.getNflTouchdownFeed(date), timestamp = h.entries.get(key)!.fetched_at
    h.advance(31_000); h.fail(table)
    assert.deepEqual(await reader.getNflTouchdownFeed(date), original)
    assert.equal(h.entries.get(key)!.fetched_at, timestamp); assert.equal(h.writes(), 1)
    h.advance(30_000)
    await assert.rejects(() => reader.getNflTouchdownFeed(date), /unavailable/)
    assert.equal(h.writes(), 1, 'expired fallback is never restamped')
    const cold = await harness(); cold.fail(table)
    await assert.rejects(() => cold.instance().then(api => api.getNflTouchdownFeed(date)), /unavailable/)
    assert.equal(cold.writes(), 0)
  })
}

test('a recovered refresh publishes new live plays while preserving quote openings and original event time', async () => {
  const h = await harness(), reader = await h.instance(); await reader.getNflTouchdownFeed(date)
  h.advance(31_000); h.fail('nfl_odds_current')
  h.feeds[0].payload.plays.push({ ...h.feeds[0].payload.plays[0], id: 'new-play', wallclock: `${date}T18:50:00Z`, period: 2 })
  assert.equal((await reader.getNflTouchdownFeed(date)).length, 2)
  h.advance(16_000); h.fail(null)
  const fresh = await reader.getNflTouchdownFeed(date)
  assert.equal(fresh.length, 3); assert.equal(fresh.find(event => event.id === 'new-play')?.occurredAt, `${date}T18:50:00Z`)
  assert.equal(fresh.find(event => event.id === 'new-play')?.playerTdNumber, 2)
  assert.ok(fresh.every(event => event.marketQuotes.every(quote => quote.openingOdds === 250)))
  assert.equal(h.writes(), 2)
})

test('verified absent quotes/identity or no touchdown remain valid, and dates never share a cache entry', async () => {
  const h = await harness(), reader = await h.instance()
  for (const table of ['nfl_odds_current', 'nfl_fanduel_capture_history', 'nfl_players']) h.overrides.set(table, [])
  const rows = await reader.getNflTouchdownFeed(date)
  assert.equal(rows.length, 2); assert.ok(rows.every(event => event.marketQuotes.length === 0 && event.playerId === null && event.bdlPlayerId != null))
  assert.deepEqual(await reader.getNflTouchdownFeed('2026-10-26'), [])
  assert.ok(h.entries.has('nfl:touchdown-feed:v5:2026-10-26')); assert.equal(h.entries.get(key)?.payload?.length, 2)
  const none = await harness(), noTd = await none.instance()
  for (const feed of none.feeds) for (const play of feed.payload.plays) play.scoring_play = false
  assert.deepEqual(await noTd.getNflTouchdownFeed(date), []); assert.equal(none.writes(), 1)
})

test('malformed known feed and non-array query responses never become a complete empty cache', async () => {
  for (const malformed of [null, [{ game_id: 'game1', payload: { game: { id: 100 } } }], [{ game_id: 'game1', payload: { game: { id: 100 }, plays: [null] } }]]) {
    const h = await harness(), reader = await h.instance(); h.overrides.set('nfl_game_feeds', malformed)
    await assert.rejects(() => reader.getNflTouchdownFeed(date), /unavailable|malformed/); assert.equal(h.writes(), 0)
  }
  for (const defect of ['missing-status', 'unknown-status', 'empty-plays', 'duplicate-play', 'mismatched-game'] as const) {
    const h = await harness(), reader = await h.instance(), known = structuredClone(h.feeds[0])
    if (defect === 'missing-status') Reflect.deleteProperty(known.payload.game, 'status_state')
    if (defect === 'unknown-status') known.payload.game.status_state = 'unknown'
    if (defect === 'empty-plays') known.payload.plays = []
    if (defect === 'duplicate-play') known.payload.plays.push({ ...known.payload.plays[0] })
    if (defect === 'mismatched-game') known.payload.plays[0].game = { ...known.payload.game, id: 999 }
    h.overrides.set('nfl_game_feeds', [known])
    await assert.rejects(() => reader.getNflTouchdownFeed(date), /malformed/, defect)
    assert.equal(h.writes(), 0, defect)
  }
  const absent = await harness(), reader = await absent.instance()
  absent.overrides.set('nfl_game_feeds', [])
  assert.deepEqual(await reader.getNflTouchdownFeed(date), [], 'genuinely absent saved feeds remain empty')
  assert.equal(absent.writes(), 1)
})

test('the complete read pipeline is bounded before the shared lease and never commits after its deadline', async () => {
  const h = await harness(), reader = await h.instance(); h.setStageDuration(10_001)
  await assert.rejects(() => reader.getNflTouchdownFeed(date), /timed out/)
  assert.equal(h.writes(), 0)
})
