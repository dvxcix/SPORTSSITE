import test from 'node:test'
import assert from 'node:assert/strict'
import { nbaGameHeaderClock, nbaGameOverviewView } from '../src/lib/nbaGameOverview.ts'
import type { PaintGame } from '../src/lib/nbaPaint.ts'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const cutoff = Date.parse('2026-11-21T00:00:00Z'), now = cutoff - 60000
const game = { id: 21718147, visitor_team: { full_name: 'Charlotte Hornets' }, home_team: { full_name: 'Atlanta Hawks' } } as PaintGame
const frame = () => ({ game_id: String(game.id), observed_at: new Date(now - 60000).toISOString(), cutoff_at: new Date(cutoff).toISOString(), snapshot: {
  away: 'Charlotte Hornets', home: 'Atlanta Hawks', totalBets: 21613, totalHandleDollars: 698522.76,
  splits: [{ market: 'moneyline', side: 'away', betShare: .15, moneyShare: .13 }, { market: 'moneyline', side: 'home', betShare: .85, moneyShare: .87 }],
  books: [{ book: 'Full', quotes: [{ decimalPrice: 3.35 }] }], source_event_id: 'private', extra: 'private',
} })

test('game overview projects actual aggregate cohorts and strips private/raw period prices', () => {
  const result = nbaGameOverviewView(frame(), game, cutoff, now)!
  assert.equal(result.totalBets, 21613)
  assert.equal(result.totalHandleDollars, 698522.76)
  assert.equal(result.splits[0].betShare, .15)
  assert.deepEqual(Object.keys(result).sort(), ['gameId', 'observedAt', 'splits', 'totalBets', 'totalHandleDollars'])
  assert.doesNotMatch(JSON.stringify(result), /books|decimalPrice|private|sideCount|estimated/)
})

test('earliest known start, stored cutoff, future observations and game identity fail closed', () => {
  for (const change of [{ game_id: '999' }, { observed_at: new Date(cutoff).toISOString() }, { observed_at: new Date(now + 1).toISOString() }, { cutoff_at: new Date(now - 60000).toISOString() }, { cutoff_at: 'invalid' }]) {
    assert.equal(nbaGameOverviewView({ ...frame(), ...change }, game, cutoff, now), null)
  }
  assert.equal(nbaGameOverviewView(frame(), game, now - 60000, now), null)
  assert.equal(nbaGameOverviewView(frame(), game, NaN, now), null)
  assert.equal(nbaGameOverviewView(frame(), { ...game, home_team: { ...game.home_team, full_name: 'Boston Celtics' } }, cutoff, now), null)
})

test('a newly resolved slate clock tightens the header immediately and never reopens a start', () => {
  const input={...game,date:'2026-11-20',datetime:new Date(cutoff).toISOString()}
  const check={date:input.date,mode:'pregame' as const,receivedAt:now,phase:{date:input.date,checkedAt:now,signature:`${input.id},${cutoff-60000},1`}}
  assert.equal(nbaGameHeaderClock(input,'pregame',check)?.datetime,new Date(cutoff-60000).toISOString())
  assert.equal(nbaGameHeaderClock(input,'pregame',{...check,phase:{...check.phase,signature:`${input.id},${cutoff+60000},0`}})?.datetime,input.datetime)
  assert.equal(nbaGameHeaderClock(input,'pregame',{...check,accessDenied:true}),null)
  assert.equal(nbaGameHeaderClock(input,'pregame',{...check,phase:{...check.phase,signature:''}}),null)
})

test('invalid and conflicting percentages stay unavailable without invented complements', () => {
  const input = frame()
  input.snapshot.splits[0].betShare = 2
  input.snapshot.splits[1].moneyShare = .2
  const result = nbaGameOverviewView(input, game, cutoff, now)!
  assert.deepEqual(result.splits, [{ market: 'moneyline', side: 'home', betShare: .85, moneyShare: null }])
  assert.equal(result.splits.some(row => row.side === 'away'), false)
})

test('zero is observed; missing counts and duplicate sides are not manufactured', () => {
  const input = frame()
  input.snapshot.totalBets = 0; input.snapshot.totalHandleDollars = 0
  input.snapshot.splits[0].betShare = 0; input.snapshot.splits[1].betShare = 1
  assert.equal(nbaGameOverviewView(input, game, cutoff, now)!.totalBets, 0)
  input.snapshot.splits.push(input.snapshot.splits[0])
  const result = nbaGameOverviewView(input, game, cutoff, now)!
  assert.equal(result.splits.some(row => row.side === 'away'), false)
  const empty = { ...input, snapshot: { ...input.snapshot, totalBets: null, totalHandleDollars: null, splits: [] } }
  assert.equal(nbaGameOverviewView(empty, game, cutoff, now), null)
})

async function moduleWith(file: string, mocks: Record<string, unknown>) {
  const source = await readFile(new URL(file, import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const module = { exports: {} as Record<string, (...args: any[]) => Promise<any>> }
  new Function('require', 'module', 'exports', compiled)((name: string) => { assert.ok(name in mocks, `Unexpected dependency ${name}`); return mocks[name] }, module, module.exports)
  return module.exports
}

test('overview loader reads only the game archive with canonical cutoff and current-time bounds', async () => {
  const operations: unknown[][] = [], input = frame()
  const query: Record<string, (...args: any[]) => any> = {}
  for (const method of ['select', 'eq', 'lt', 'lte', 'order', 'limit', 'abortSignal']) query[method] = (...args) => { operations.push([method, ...args]); return query }
  query.maybeSingle = async () => ({ data: input, error: null })
  const module = await moduleWith('../src/lib/nbaGameOverviewData.ts', {
    'server-only': {}, './supabase/admin': { createAdminClient: () => ({ from: (table: string) => { assert.equal(table, 'pikkit_pregame_overviews'); return query } }) },
    './nbaPaintData': { getPaintGame: async () => ({ ...game, datetime: new Date(cutoff).toISOString() }) },
    './nbaOddsMode': { nbaGameStart: () => cutoff }, './nbaSharedCache': { nbaSharedCache: async (_key: string, _ttl: number, _stale: number, read: () => unknown) => ({ value: await read() }) },
    './nbaGameOverview': { nbaGameOverviewView }, './nbaOddsPhaseData': { getNbaPhaseFrames: async () => { throw Error('Public-only reads must not load price history') } },
  })
  const clock = Date.now
  try {
    Date.now = () => now
    const result = await module.getNbaGameOverview(game.id)
    assert.equal(result.totalBets, 21613)
    assert.ok(operations.some(args => args[0] === 'eq' && args[1] === 'sport' && args[2] === 'nba'))
    assert.ok(operations.some(args => args[0] === 'eq' && args[1] === 'game_id' && args[2] === String(game.id)))
    assert.ok(operations.some(args => args[0] === 'lt' && args[1] === 'observed_at' && args[2] === new Date(cutoff).toISOString()))
    assert.ok(operations.some(args => args[0] === 'lte' && args[1] === 'observed_at' && args[2] === new Date(now).toISOString()))
  } finally { Date.now = clock }
})

test('header price-only loader requests the selected game feed through the existing phase reader', async () => {
  const quote = { id: 4, vendor: 'draftkings', moneyline_home_odds: -175 }
  const module = await moduleWith('../src/lib/nbaGameOverviewData.ts', {
    'server-only': {}, './supabase/admin': {}, './nbaOddsMode': {}, './nbaSharedCache': {}, './nbaGameOverview': {},
    './nbaPaintData': { getPaintGame: async () => game },
    './nbaOddsPhaseData': { getNbaPhaseFrames: async (selected: PaintGame, mode: string, feed: string, scope: unknown) => {
      assert.equal(selected.id, game.id); assert.equal(mode, 'pregame'); assert.equal(feed, 'game'); assert.deepEqual(scope, { selection: 'latest' })
      return [{ quotes: [quote] }]
    } },
  })
  assert.deepEqual(await module.getNbaHeaderPrices(game.id, 'pregame'), [quote])
})

test('game summary route enforces membership before any data read and rejects invalid IDs', async () => {
  let denied = true, reads = 0
  const module = await moduleWith('../src/app/the-paint/game-overview/route.ts', {
    'next/server': { NextResponse: { json: (body: unknown, options: ResponseInit) => Response.json(body, options) } },
    '@/lib/paintAccess': { requirePaintAccess: async () => denied ? { error: Response.json({ error: 'Ultimate required' }, { status: 403 }) } : {} },
    '@/lib/nbaOddsMode': { nbaOddsMode: (value: string) => value === 'live' ? 'live' : 'pregame' },
    '@/lib/nbaGameOverviewData': { getNbaGameOverview: async () => { reads++; return null }, getNbaHeaderPrices: async () => { reads++; return [] } },
  })
  const request = (query: string) => ({ nextUrl: new URL('https://www.slipsurge.com/the-paint/game-overview?' + query) })
  assert.equal((await module.GET(request('game=21718147&prices=1'))).status, 403); assert.equal(reads, 0)
  denied = false
  assert.equal((await module.GET(request('game=0'))).status, 400); assert.equal(reads, 0)
  const live = await module.GET(request('game=21718147&mode=live&prices=1'))
  assert.equal(live.headers.get('Cache-Control'), 'private, no-store'); assert.equal(reads, 1, 'Live must not borrow pregame public data')
  assert.deepEqual(await live.json(), { overview: null, publicUnavailable: false, gameOdds: [], pricesUnavailable: false })
})

test('public failure does not discard phase-safe prices or masquerade as an empty capture', async () => {
  const module = await moduleWith('../src/app/the-paint/game-overview/route.ts', {
    'next/server': { NextResponse: { json: (body: unknown, options: ResponseInit) => Response.json(body, options) } },
    '@/lib/paintAccess': { requirePaintAccess: async () => ({}) }, '@/lib/nbaOddsMode': { nbaOddsMode: () => 'pregame' },
    '@/lib/nbaGameOverviewData': { getNbaGameOverview: async () => { throw Error('archive unavailable') }, getNbaHeaderPrices: async () => [{ id: 4 }] },
  })
  const response = await module.GET({ nextUrl: new URL('https://www.slipsurge.com/the-paint/game-overview?game=21718147&prices=1') })
  assert.deepEqual(await response.json(), { overview: null, publicUnavailable: true, gameOdds: [{ id: 4 }], pricesUnavailable: false })
})
