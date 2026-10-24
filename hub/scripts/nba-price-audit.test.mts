import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import * as paint from '../src/lib/nbaPaint.ts'
import * as modes from '../src/lib/nbaOddsMode.ts'
import * as first from '../src/lib/nbaFirstBasketOdds.ts'
import * as identity from '../src/lib/nbaPlayerIdentity.ts'
import * as history from '../src/lib/nbaOddsHistory.ts'

const now = Date.parse('2026-10-24T12:00:00Z')
const team = { id: 2, abbreviation: 'BOS', full_name: 'Boston Celtics', name: 'Celtics' }
const game: paint.PaintGame = { id: 123, date: '2026-10-24', season: 2026, datetime: '2026-10-24T23:00:00Z', status: 'Scheduled', status_state: 'scheduled', period: 0, home_team: team, visitor_team: { ...team, id: 9, full_name: 'Detroit Pistons' }, home_team_score: 0, visitor_team_score: 0 }
const player: paint.PaintRoster = { id: 1028028405, first_name: 'Alexandre', last_name: 'Sarr', position: 'C', team }
const event = { id: 'verified-event', sport_key: 'basketball_nba', home_team: team.full_name, away_team: game.visitor_team.full_name, commence_time: game.datetime! }
const outcome = { name: 'Over', description: 'Alex Sarr', point: 14.5, price: -110 }
const payload = () => ({ ...event, bookmakers: [{ key: 'betmgm', markets: [{ key: 'player_points_alternate', last_update: new Date(now - 1000).toISOString(), outcomes: [outcome, { ...outcome, name: 'Under', price: 100 }] }] }] })
type Exports = Record<string, (...args: never[]) => unknown>
type AuditResult = Awaited<ReturnType<typeof import('../src/lib/nbaPriceAudit.ts').getNbaPriceAudit>>
const errorCode = (error: unknown) => error instanceof Error && 'code' in error ? error.code : undefined
async function compile(path: string, imports: Record<string, unknown>, globals: Record<string, unknown> = {}) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const target = { exports: {} as Exports }
  new Function('require', 'module', 'exports', ...Object.keys(globals), output)((name: string) => { assert.ok(name in imports, name); return imports[name] }, target, target.exports, ...Object.values(globals))
  return target.exports
}
async function fixture(options: { value?: unknown; response?: () => Response | Promise<Response>; events?: first.FirstOddsEvent[]; roster?: paint.PaintRoster[]; key?: string; abortAfterMs?: number } = {}) {
  let clock = now, eventReads = 0, rosterReads = 0, requests = 0
  const cache = new Map<string, Promise<unknown>>(), cacheCalls: { key: string; ttl: number; stale: number }[] = []
  class Clock extends Date { constructor(value: string | number = clock) { super(value) } static now() { return clock } }
  const helper = await compile('../src/lib/nbaPriceAudit.ts', {
    'server-only': {}, './nbaPaint': paint, './nbaOddsMode': modes, './nbaFirstBasketOdds': first, './nbaPlayerIdentity': identity, './nbaOddsHistory': history,
    './nbaPaintData': { getPaintRoster: async () => { rosterReads++; return options.roster ?? [player] } },
    './nbaFirstBasketOddsData': { getNbaFirstEvents: async (...args: unknown[]) => { assert.deepEqual(args, []); eventReads++; return options.events ?? [event] } },
    './nbaSharedCache': { nbaSharedCache: async (key: string, ttl: number, stale: number, load: () => Promise<unknown>) => { cacheCalls.push({ key, ttl, stale }); if (!cache.has(key)) cache.set(key, load()); return { value: await cache.get(key), fetchedAt: new Date(clock).toISOString() } } },
  }, {
    Date: Clock,
    process: { env: { ODDS_API_KEY: options.key ?? 'fixture-secret-never-return' } },
    AbortSignal: options.abortAfterMs == null ? AbortSignal : { timeout: () => { const controller = new AbortController(); setTimeout(() => controller.abort(), options.abortAfterMs); return controller.signal } },
    fetch: async (input: URL, init: RequestInit) => {
      requests++
      assert.equal(input.origin, 'https://api.the-odds-api.com')
      assert.equal(input.pathname, '/v4/sports/basketball_nba/events/verified-event/odds')
      assert.equal(input.searchParams.get('bookmakers'), 'betmgm,draftkings')
      assert.equal(input.searchParams.get('markets'), 'player_points_alternate,player_rebounds_alternate,player_assists_alternate,player_threes_alternate')
      assert.equal(input.searchParams.get('oddsFormat'), 'american')
      assert.equal(init.cache, 'no-store'); assert.equal(init.redirect, 'error'); assert.ok(init.signal)
      return options.response ? options.response() : Response.json(options.value ?? payload(), { headers: { 'x-requests-used': '100', 'x-requests-remaining': '4900', 'x-requests-last': '4' } })
    },
  })
  return {
    helper, audit: helper.getNbaPriceAudit as (game: paint.PaintGame) => Promise<AuditResult>,
    allowed: helper.nbaPriceAuditGameAllowed as (game: paint.PaintGame) => boolean,
    counts: () => ({ eventReads, rosterReads, requests }), cacheCalls, setTime: (value: number) => { clock = value },
  }
}

test('private audit keeps exact alternate sides and thresholds, roster identity and numeric quota; no provider URLs or credentials', async () => {
  const source = { ...payload(), apiKey: 'fixture-secret-never-return', url: 'https://provider.test/?apiKey=fixture-secret-never-return' }
  const h = await fixture({ value: source }), result = await h.audit(game)
  assert.equal(result.eventMatched, true); assert.equal(result.provider, 'The Odds API')
  assert.deepEqual(result.quota, { used: 100, remaining: 4900, last: 4 })
  assert.deepEqual(result.bookmakers[0].markets[0].outcomes, [
    { ...outcome, playerId: player.id }, { ...outcome, name: 'Under', price: 100, playerId: player.id },
  ])
  assert.equal(result.bookmakers[0].markets[0].fresh, true)
  assert.equal(JSON.stringify(result).includes('fixture-secret'), false)
  assert.equal(JSON.stringify(result).includes('https://'), false)
  assert.deepEqual(h.counts(), { eventReads: 1, rosterReads: 1, requests: 1 })
})

test('concurrent owner reads share the fixed 60 second audit policy without fresh bypass', async () => {
  const h = await fixture()
  const results = await Promise.all(Array.from({ length: 200 }, () => h.audit(game)))
  assert.equal(results.length, 200)
  assert.deepEqual(h.counts(), { eventReads: 1, rosterReads: 1, requests: 1 })
  assert.ok(h.cacheCalls.every(call => call.key === `admin-price-audit:v1:123:${Date.parse(game.datetime!)}` && call.ttl === 60 && call.stale === 0))
})

test('unmatched or ambiguous events spend no event request, and unknown roster names stay unmatched', async () => {
  for (const events of [[], [{ ...event, away_team: 'Wrong Team' }], [event, { ...event, id: 'ambiguous' }]]) {
    const h = await fixture({ events }), result = await h.audit(game)
    assert.equal(result.eventMatched, false); assert.equal(h.counts().requests, 0); assert.deepEqual(result.bookmakers, [])
  }
  const h = await fixture({ roster: [player, { ...player, id: 999, first_name: 'Alex', last_name: 'Sarr' }] })
  assert.equal((await h.audit(game)).bookmakers[0].markets[0].outcomes[0].playerId, null)
})

test('today and tomorrow pregame are accepted; past, live, final and later games fail before cache/provider work', async () => {
  const h = await fixture()
  assert.equal(h.allowed({ ...game, date: '2026-10-25', datetime: '2026-10-26T02:00:00Z' }), true)
  for (const change of [{ date: '2026-10-23' }, { date: '2026-10-26', datetime: '2026-10-26T23:00:00Z' }, { datetime: new Date(now - 1).toISOString() }, { datetime: null, status: 'Scheduled' }, { period: 1 }, { status_state: 'in_progress' }, { status_state: 'final' }]) {
    await assert.rejects(h.audit({ ...game, ...change }), (error: unknown) => errorCode(error) === 'game')
  }
  assert.deepEqual(h.counts(), { eventReads: 0, rosterReads: 0, requests: 0 }); assert.equal(h.cacheCalls.length, 0)
})

test('crossing tipoff rejects even a cached successful diagnostic', async () => {
  const h = await fixture()
  await h.audit(game)
  h.setTime(Date.parse(game.datetime!) + 1)
  await assert.rejects(h.audit(game), (error: unknown) => errorCode(error) === 'game')
  assert.equal(h.counts().requests, 1)
})

test('provider response identity, unknown books/markets and malformed price contracts fail closed', async () => {
  const variants = [
    { ...payload(), id: 'different' }, { ...payload(), sport_key: 'basketball_wnba' },
    { ...payload(), commence_time: '2026-10-24T23:05:00Z' },
    { ...payload(), bookmakers: [{ ...payload().bookmakers[0], key: 'unexpected' }] },
    { ...payload(), bookmakers: [{ key: 'betmgm', markets: [{ ...payload().bookmakers[0].markets[0], key: 'player_points' }] }] },
    ...[{ price: 0 }, { point: '14.5' }, { name: 'Yes' }, { description: '' }].map(change => ({ ...payload(), bookmakers: [{ key: 'betmgm', markets: [{ ...payload().bookmakers[0].markets[0], outcomes: [{ ...outcome, ...change }] }] }] })),
  ]
  for (const value of variants) {
    const h = await fixture({ value })
    await assert.rejects(h.audit(game), (error: unknown) => errorCode(error) === 'payload')
    assert.equal(h.counts().requests, 1)
  }
})

test('oversized declared/streaming payloads and excessive outcome counts respect hard budgets', async () => {
  const cases = [
    { response: () => new Response('{}', { headers: { 'content-length': '1048577' } }) },
    { response: () => new Response(' '.repeat(1048577)) },
    { value: { ...payload(), bookmakers: [{ key: 'betmgm', markets: [{ ...payload().bookmakers[0].markets[0], outcomes: Array.from({ length: 4097 }, () => outcome) }] }] } },
  ]
  for (const options of cases) {
    const h = await fixture(options)
    await assert.rejects(h.audit(game), (error: unknown) => errorCode(error) === 'budget')
    assert.equal(h.counts().requests, 1)
  }
})

test('invalid JSON, stalled body, missing key and upstream failures are bounded and never expose raw errors', async () => {
  for (const status of [401, 403, 429, 500]) {
    const h = await fixture({ response: () => new Response('fixture-secret-never-return', { status }) })
    await assert.rejects(h.audit(game), (error: unknown) => ['authorization', 'quota', 'upstream'].includes(String(errorCode(error))) && !String(error).includes('fixture-secret'))
  }
  const malformed = await fixture({ response: () => new Response('{fixture-secret-never-return') })
  await assert.rejects(malformed.audit(game), (error: unknown) => errorCode(error) === 'payload' && !String(error).includes('fixture-secret'))
  const stalled = await fixture({ abortAfterMs: 5, response: () => new Response(new ReadableStream({ start() {} })) })
  await assert.rejects(stalled.audit(game), (error: unknown) => errorCode(error) === 'upstream')
  const absent = await fixture({ key: '' })
  await assert.rejects(absent.audit(game), (error: unknown) => errorCode(error) === 'configuration')
  assert.deepEqual(absent.counts(), { eventReads: 0, rosterReads: 0, requests: 0 })
})

async function routeFixture(role: string | null = 'admin', userId: string | null = 'owner', profileError = false) {
  let gameReads = 0, audits = 0, authReads = 0
  const h = await fixture()
  const access = await compile('../src/lib/paintAccess.ts', {
    'server-only': {}, 'next/server': { NextResponse: { json: Response.json } },
    '@/lib/nbaAccessPolicy': { NBA_ACCESS_COLUMNS: 'account_type,tier', hasNbaAccess: (profile: { account_type: string; tier: string }) => profile.account_type === 'admin' || profile.tier === 'ultimate' },
    '@/lib/requireTier': { resolveAuthedClient: async () => { authReads++; return { userId, supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: role == null ? null : { account_type: role, tier: 'ultimate' }, error: profileError ? {} : null }) }) }) }) } } } },
  })
  const route = await compile('../src/app/api/admin/nba-price-audit/route.ts', {
    'next/server': { NextResponse: { json: Response.json } }, '@/lib/paintAccess': access,
    '@/lib/nbaPaintData': { getPaintGame: async () => { gameReads++; return game } },
    '@/lib/nbaPriceAudit': { ...h.helper, getNbaPriceAudit: async () => { audits++; return { outcomes: 2 } } },
  })
  const get = route.GET as (request: Request) => Promise<Response>
  return { get, counts: () => ({ gameReads, audits, authReads }) }
}
const request = (query = '?game=123', headers: Record<string, string> = { 'sec-fetch-site': 'same-origin' }) => new Request(`https://www.slipsurge.com/api/admin/nba-price-audit${query}`, { headers })

test('guest, Ultimate member, missing profile and profile failure cannot read or query odds', async () => {
  for (const [role, user, error, status] of [['admin', null, false, 401], ['member', 'member', false, 403], [null, 'owner', false, 503], ['admin', 'owner', true, 503]] as const) {
    const h = await routeFixture(role, user, error), response = await h.get(request())
    assert.equal(response.status, status); assert.equal(response.headers.get('cache-control'), 'private, no-store')
    assert.deepEqual(h.counts(), { gameReads: 0, audits: 0, authReads: 1 })
  }
})

test('admin route accepts one fixed-scope game and rejects duplicate IDs, arbitrary sources and refresh bypass', async () => {
  const h = await routeFixture()
  for (const query of ['', '?game=0', '?game=1.2', '?game=123&game=124', '?game=123&force=1', '?game=123&book=betmgm', '?game=123&url=https://evil.test', '?game=10000000000']) assert.equal((await h.get(request(query))).status, 400)
  assert.equal(h.counts().gameReads, 0); assert.equal(h.counts().audits, 0)
  const response = await h.get(request())
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'private, no-store')
  assert.deepEqual(await response.json(), { outcomes: 2 })
  assert.equal(h.counts().gameReads, 1); assert.equal(h.counts().audits, 1)
})

test('cross-site, embedded and forged-origin requests cannot trigger the diagnostic; owner navigation works', async () => {
  const h = await routeFixture()
  const rejectedHeaders: Record<string, string>[] = [{}, { 'sec-fetch-site': 'cross-site' }, { 'sec-fetch-site': 'same-site' }, { 'sec-fetch-site': 'none', 'sec-fetch-dest': 'iframe', 'sec-fetch-mode': 'navigate' }, { 'sec-fetch-site': 'same-origin', origin: 'https://evil.test' }]
  for (const headers of rejectedHeaders) assert.equal((await h.get(request('?game=123', headers))).status, 403)
  assert.deepEqual(h.counts(), { gameReads: 0, audits: 0, authReads: 0 })
  assert.equal((await h.get(request('?game=123', { 'sec-fetch-site': 'none', 'sec-fetch-dest': 'document', 'sec-fetch-mode': 'navigate' }))).status, 200)
})
