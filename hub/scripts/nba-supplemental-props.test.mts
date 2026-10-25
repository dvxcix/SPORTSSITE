import assert from 'node:assert/strict'
import test from 'node:test'
import {nbaCurrentBookQuotes,type NbaCurrentBookFrame} from '../src/lib/nbaBookCurrent.ts'
import { readFile } from 'node:fs/promises'
import * as crypto from 'node:crypto'
import ts from 'typescript'
import * as paint from '../src/lib/nbaPaint.ts'
import * as modes from '../src/lib/nbaOddsMode.ts'
import * as first from '../src/lib/nbaFirstBasketOdds.ts'
import * as identity from '../src/lib/nbaPlayerIdentity.ts'
import * as history from '../src/lib/nbaOddsHistory.ts'
import * as primary from '../src/lib/nbaPrimaryProps.ts'
import { nbaEconomicSnapshot, nbaMovement } from '../src/lib/nbaMovement.ts'
import { nbaMarketRanks } from '../src/lib/nbaMarketMetrics.ts'

const now = Date.parse('2026-10-24T12:00:00Z')
const team = { id: 2, abbreviation: 'BOS', full_name: 'Boston Celtics', name: 'Celtics' }
const game: paint.PaintGame = { id: 123, date: '2026-10-24', season: 2026, datetime: '2026-10-24T23:00:00Z', status: 'Scheduled', status_state: 'scheduled', period: 0, home_team: team, visitor_team: { ...team, id: 9, full_name: 'Detroit Pistons' }, home_team_score: 0, visitor_team_score: 0 }
const player: paint.PaintRoster = { id: 1028028405, first_name: 'Alexandre', last_name: 'Sarr', position: 'C', team }
const event = { id: 'verified-event', sport_key: 'basketball_nba', home_team: team.full_name, away_team: game.visitor_team.full_name, commence_time: game.datetime! }
const outcome = { name: 'Over', description: 'Alex Sarr', point: 14.5, price: -550 }
const market = (key = 'player_points_alternate', outcomes: unknown[] = [outcome], at = now - 1000) => ({ key, last_update: new Date(at).toISOString(), outcomes })
const payload = (markets = [market()]) => ({ ...event, bookmakers: [{ key: 'betmgm', markets }] })
type Module = typeof import('../src/lib/nbaSupplementalProps.ts')
async function compile<T>(path: string, imports: Record<string, unknown>, globals: Record<string, unknown> = {}) {
  imports = { './nbaPregameResearchData': {}, ...imports }
  const source = await readFile(new URL(path, import.meta.url), 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const target = { exports: {} }
  new Function('require', 'module', 'exports', ...Object.keys(globals), output)((name: string) => { assert.ok(name in imports, name); return imports[name] }, target, target.exports, ...Object.values(globals))
  return target.exports as T
}
async function fixture(options: { value?: unknown; response?: () => Response | Promise<Response>; events?: first.FirstOddsEvent[]; roster?: paint.PaintRoster[]; key?: string; abortAfterMs?: number } = {}) {
  let clock = now, requests = 0, eventReads = 0
  class Clock extends Date { constructor(value: string | number = clock) { super(value) } static now() { return clock } }
  const cache = new Map<string, { until: number; value: Promise<unknown> }>(), calls: { key: string; ttl: number; stale: number }[] = []
  const helper = await compile<Module>('../src/lib/nbaSupplementalProps.ts', {
    'server-only': {}, 'node:crypto': crypto, './nbaPaint': paint, './nbaOddsMode': modes, './nbaFirstBasketOdds': first, './nbaPlayerIdentity': identity, './nbaOddsHistory': history,
    './nbaPaintData': { getPaintRoster: async () => options.roster ?? [player] },
    './nbaFirstBasketOddsData': { getNbaFirstEvents: async (...args: unknown[]) => { assert.deepEqual(args, []); eventReads++; return options.events ?? [event] } },
    './nbaSharedCache': { nbaSharedCache: async (key: string, ttl: number, stale: number, load: () => Promise<unknown>) => { calls.push({ key, ttl, stale }); if (!cache.has(key) || cache.get(key)!.until <= clock) cache.set(key, { until: clock + ttl * 1000, value: load() }); return { value: await cache.get(key)!.value } } },
  }, {
    Date: Clock, process: { env: { ODDS_API_KEY: options.key ?? 'fixture-secret' } },
    AbortSignal: options.abortAfterMs == null ? AbortSignal : { timeout: () => { const controller = new AbortController(); setTimeout(() => controller.abort(), options.abortAfterMs); return controller.signal } },
    fetch: async (input: URL, init: RequestInit) => {
      requests++; assert.equal(input.origin, 'https://api.the-odds-api.com'); assert.equal(input.pathname, '/v4/sports/basketball_nba/events/verified-event/odds')
      assert.equal(input.searchParams.get('bookmakers'), 'betmgm,draftkings'); assert.equal(input.searchParams.get('markets')!.split(',').length, 27)
      assert.equal(input.searchParams.get('oddsFormat'), 'american'); assert.equal(init.cache, 'no-store'); assert.equal(init.redirect, 'error'); assert.ok(init.signal)
      return options.response ? options.response() : Response.json(options.value ?? payload(), { headers: { 'x-requests-used': '1013619', 'x-requests-remaining': '3986381', 'x-requests-last': '4' } })
    },
  })
  return { ...helper, calls, counts: () => ({ requests, eventReads }), setTime: (value: number) => { clock = value } }
}

test('explicit alternate half-point Over becomes exact N+, with Under and integer push contracts preserved', async () => {
  const h = await fixture({ value: payload([market('player_points_alternate', [outcome, { ...outcome, name: 'Under', price: 380 }, { ...outcome, point: 15, price: 125 }]), market('player_points', [{ ...outcome, price: -500 }])]) })
  const result = await h.getNbaSupplementalProps(game, 'pregame')
  assert.equal(result.complete, true); assert.equal(result.accepted, 4)
  assert.ok(result.props.some(p => p.market.type === 'milestone' && p.line_value === '15' && p.market.odds === -550))
  assert.ok(result.props.some(p => p.market.type === 'over_under' && p.line_value === '14.5' && p.market.under_odds === 380 && p.market.over_odds === -500))
  assert.ok(result.props.some(p => p.market.type === 'over_under' && p.line_value === '15' && p.market.over_odds === 125))
  assert.ok(result.props.every(p => p.player_id === player.id && p.updated_at === new Date(now - 1000).toISOString()))
  assert.deepEqual(result.quota, { used: 1013619, remaining: 3986381, last: 4 })
  assert.equal(JSON.stringify(result).includes('fixture-secret'), false)
})

test('all supported stat combinations, Q1 and exact DD/TD Yes/No use existing Paint contracts', async () => {
  const h = await fixture(), markets = h.NBA_SUPPLEMENTAL_MARKETS.map(key => market(key, key.endsWith('double') ? [{ name: 'Yes', description: 'Alex Sarr', price: 250 }, { name: 'No', description: 'Alex Sarr', price: -350 }] : [outcome]))
  const result = h.nbaNormalizeSupplemental(payload(markets), event, game, [player], 'pregame', now)
  assert.equal(result.complete, true)
  assert.ok(result.props.every(p => paint.PAINT_MARKETS.some(m => m.key === p.prop_type)))
  for (const prop of ['double_double', 'triple_double']) assert.deepEqual(result.props.find(p => p.prop_type === prop)!.market, { type: 'over_under', over_odds: 250, under_odds: -350 })
  assert.ok(result.props.some(p => p.prop_type === 'points_1q' && p.line_value === '14.5' && p.market.type === 'over_under'))
  assert.equal(h.NBA_SUPPLEMENTAL_MARKETS.some(key => key.includes('first3min') || key.includes('first_basket')), false)
})

test('6000 concurrent member reads share one paid request;120s expiry is shared and has no fresh bypass', async () => {
  const h = await fixture()
  const results = await Promise.all(Array.from({ length: 6000 }, () => h.getNbaSupplementalProps(game, 'pregame')))
  assert.equal(results.length, 6000); assert.ok(results.every(r => r.props[0].market.odds === -550))
  assert.deepEqual(h.counts(), { requests: 1, eventReads: 1 }); assert.ok(h.calls.every(c => c.ttl === 120 && c.stale === 0))
  h.setTime(now + 119_999); await h.getNbaSupplementalProps(game, 'pregame'); assert.equal(h.counts().requests, 1)
  h.setTime(now + 120_001); await h.getNbaSupplementalProps(game, 'pregame'); assert.equal(h.counts().requests, 2)
})

test('historical/final/out-of-slate games never spend paid requests, including invalid live phases', async () => {
  const h = await fixture()
  for (const change of [{ date: '2026-10-23' }, { date: '2026-10-26', datetime: '2026-10-26T23:00:00Z' }, { datetime: null }, { status_state: 'final' }, { period: 1 }]) assert.equal((await h.getNbaSupplementalProps({ ...game, ...change }, 'pregame')).applicable, false)
  assert.equal((await h.getNbaSupplementalProps(game, 'live')).applicable, false)
  assert.deepEqual(h.counts(), { requests: 0, eventReads: 0 })
  assert.equal(h.nbaSupplementalAllowed({ ...game, date: '2026-10-25', datetime: '2026-10-26T02:00:00Z' }, 'pregame', now), true)
})

test('freshness is checked on every cache read, and live never imports pregame timestamps', async () => {
  const h = await fixture({ value: payload([market('player_points_alternate', [outcome], now - 290_000)]) })
  assert.equal((await h.getNbaSupplementalProps(game, 'pregame')).complete, true)
  h.setTime(now + 20_000)
  const expired = await h.getNbaSupplementalProps(game, 'pregame')
  assert.equal(expired.props.length, 0); assert.equal(expired.complete, false); assert.equal(h.counts().requests, 1)
  const live = { ...game, datetime: new Date(now - 60_000).toISOString(), status_state: 'in_progress', period: 1 }, liveEvent = { ...event, commence_time: live.datetime }
  const stale = h.nbaNormalizeSupplemental({ ...payload([market('player_points_alternate', [outcome], now - 61_000)]), commence_time: live.datetime }, liveEvent, live, [player], 'live', now)
  assert.equal(stale.complete, false); assert.equal(stale.props.length, 0)
  const valid = h.nbaNormalizeSupplemental({ ...payload(), commence_time: live.datetime }, liveEvent, live, [player], 'live', now)
  assert.equal(valid.props.length, 1); assert.equal(valid.complete, true)
})

test('rejected supplemental timestamps retain bounded private age and phase evidence without changing eligibility', async () => {
  const h = await fixture()
  const live = { ...game, datetime: new Date(now - 60_000).toISOString(), status_state: 'in_progress', period: 1 }, liveEvent = { ...event, commence_time: live.datetime }
  for (const [at, reason] of [[now + 1, 'future'], [now - 300_001, 'expired'], [NaN, 'invalid-clock']] as const) {
    const rejected = { ...market(), last_update: Number.isFinite(at) ? new Date(at).toISOString() : 'https://private.invalid/?token=must-not-leak' }
    const result = h.nbaNormalizeSupplemental(payload([rejected]), event, game, [player], 'pregame', now)
    assert.deepEqual(result.props, []); assert.equal(result.complete, false); assert.equal(result.stale, 1)
    assert.deepEqual(result.diagnostics!.reasons, { [reason]: 1 })
    assert.equal(result.diagnostics!.samples[0].reason, reason)
    assert.equal(result.diagnostics!.samples[0].quoteAt, Number.isFinite(at) ? new Date(at).toISOString() : null)
    assert.equal(result.diagnostics!.samples[0].checkedAt, new Date(now).toISOString())
    assert.equal(result.diagnostics!.samples[0].tipoff, new Date(game.datetime!).toISOString())
    assert.equal(result.diagnostics!.samples[0].source, 'feed')
    assert.equal(JSON.stringify(result.diagnostics).includes('must-not-leak'), false)
    assert.equal(JSON.stringify(result.diagnostics).includes('Alex'), false)
  }
  const wrongPhase = h.nbaNormalizeSupplemental({ ...payload([market('player_points', [outcome], now - 61_000)]), commence_time: live.datetime }, liveEvent, live, [player], 'live', now)
  assert.deepEqual(wrongPhase.diagnostics!.reasons, { 'wrong-phase': 1 }); assert.equal(wrongPhase.complete, false); assert.deepEqual(wrongPhase.props, [])
  const many = h.nbaNormalizeSupplemental(payload(h.NBA_SUPPLEMENTAL_MARKETS.map(key => market(key, [outcome], now - 300_001))), event, game, [player], 'pregame', now)
  assert.equal(many.diagnostics!.samples.length, 12); assert.equal(many.diagnostics!.reasons.expired, 27)
})

test('cache expiry counts each priced side and does not mutate or accumulate the shared rejection evidence', async () => {
  const h = await fixture({ value: payload([market('player_points', [outcome, { ...outcome, name: 'Under', price: 400 }], now - 290_000)]) })
  const initial = await h.getNbaSupplementalProps(game, 'pregame')
  assert.equal(initial.props.length, 1); assert.equal(initial.accepted, 2); assert.deepEqual(initial.diagnostics!.reasons, {})
  h.setTime(now + 20_000)
  for (let i = 0; i < 2; i++) {
    const expired = await h.getNbaSupplementalProps(game, 'pregame')
    assert.equal(expired.stale, 2); assert.equal(expired.accepted, 0); assert.equal(expired.complete, false)
    assert.deepEqual(expired.diagnostics!.reasons, { expired: 2 }); assert.equal(expired.diagnostics!.samples.length, 1)
    assert.equal(expired.diagnostics!.samples[0].ageMs, 310_000); assert.equal(expired.diagnostics!.samples[0].source, 'cache')
  }
  assert.deepEqual(initial.diagnostics!.reasons, {}); assert.equal(h.counts().requests, 1)
})

test('tipoff crossing discards a cached pregame result without querying live or archive implicitly', async () => {
  const h = await fixture(); await h.getNbaSupplementalProps(game, 'pregame'); h.setTime(Date.parse(game.datetime!) + 1)
  assert.equal((await h.getNbaSupplementalProps(game, 'pregame')).props.length, 0); assert.equal(h.counts().requests, 1)
})

test('verified empty event is a withdrawal; unlisted events defer while ambiguous identity fails closed', async () => {
  for (const events of [[], [{ ...event, home_team: 'Wrong' }]]) {
    const h = await fixture({ events }), result = await h.getNbaSupplementalProps(game, 'pregame')
    assert.equal(result.complete, false); assert.equal(result.deferred, true); assert.equal(result.eventMatched, false); assert.equal(h.counts().requests, 0)
  }
  const ambiguous=await fixture({events:[event,{...event,id:'other'}]});await assert.rejects(ambiguous.getNbaSupplementalProps(game,'pregame'));assert.equal(ambiguous.counts().requests,0)
  const h = await fixture({ value: { ...event, bookmakers: [] } }), result = await h.getNbaSupplementalProps(game, 'pregame')
  assert.equal(result.complete, true); assert.equal(result.eventMatched, true); assert.deepEqual(result.props, [])
})

test('unknown/malformed/conflicting outcomes preserve valid siblings but cannot certify complete coverage', async () => {
  for (const broken of [{ ...outcome, description: 'Unknown Player' }, { ...outcome, price: 0 }, { ...outcome, point: '14.5' }, { ...outcome, name: 'Any' }]) {
    const h = await fixture({ value: payload([market('player_points_alternate', [outcome, broken])]) }), result = await h.getNbaSupplementalProps(game, 'pregame')
    assert.equal(result.complete, false); assert.equal(result.unmatched, 1); assert.equal(result.props.length, 1)
  }
  const h = await fixture({ value: payload([market('player_points_alternate', [outcome, { ...outcome, price: -450 }])]) }), result = await h.getNbaSupplementalProps(game, 'pregame')
  assert.equal(result.complete, false); assert.equal(result.props.length, 0)
})

test('wrong event, catalog, duplicate books, unbounded responses and upstream errors fail closed without raw URLs', async () => {
  const variants = [{ ...payload(), id: 'wrong' }, { ...payload(), sport_key: 'basketball_wnba' }, { ...payload(), bookmakers: [...payload().bookmakers, ...payload().bookmakers] }, payload([market('player_unknown')]), payload([market('player_points', Array.from({ length: 20_001 }, () => outcome))])]
  for (const value of variants) await assert.rejects((await fixture({ value })).getNbaSupplementalProps(game, 'pregame'), { message: 'Additional sportsbook prices unavailable' })
  for (const response of [() => new Response('bad'), () => new Response('{}', { status: 429 }), () => new Response('{}', { headers: { 'content-length': '4194305' } }), () => Promise.reject(new Error('https://secret.example/?apiKey=fixture-secret'))]) await assert.rejects((await fixture({ response })).getNbaSupplementalProps(game, 'pregame'), { message: 'Additional sportsbook prices unavailable' })
  await assert.rejects((await fixture({ key: '' })).getNbaSupplementalProps(game, 'pregame'), { message: 'Additional sportsbook prices unavailable' })
  await assert.rejects((await fixture({ abortAfterMs: 5, response: () => new Response(new ReadableStream({ start() {} })) })).getNbaSupplementalProps(game, 'pregame'), { message: 'Additional sportsbook prices unavailable' })
})

test('source merge chooses newest exact side and never mixes game/book/line or timestamps', async () => {
  const h = await fixture(), quote = (await h.getNbaSupplementalProps(game, 'pregame')).props[0]
  const old = { ...quote, updated_at: new Date(now - 2000).toISOString(), market: { type: 'milestone' as const, odds: -700 } }
  const merged = h.nbaMergePropSources([old, { ...old, vendor: 'fanduel' }, { ...old, line_value: '20' }], [quote])
  assert.equal(merged.length, 3); assert.equal(merged.find(p => p.vendor === 'betmgm' && p.line_value === '15')!.market.odds, -550)
  const side = { ...quote, line_value: '14.5', market: { type: 'over_under' as const, over_odds: -500 }, updated_at: new Date(now - 2000).toISOString() }
  const split = h.nbaMergePropSources([side], [{ ...side, updated_at: quote.updated_at, market: { type: 'over_under', under_odds: 380 } }])
  assert.equal(split.length, 2); assert.ok(split.every(p => !(p.market.over_odds && p.market.under_odds)))
  assert.deepEqual(nbaEconomicSnapshot(split),nbaEconomicSnapshot([{...side,market:{type:'over_under',over_odds:-500,under_odds:380}}]),'timestamp grouping cannot manufacture an economic change')
  assert.equal(paint.nbaReference(split,'points','betmgm','over')?.market.over_odds,-500)
  assert.equal(paint.nbaReference(split,'points','betmgm','under')?.market.under_odds,380)
  const previous=split.map(p=>p.market.under_odds?{...p,market:{...p.market,under_odds:400}}:p)
  const movement=nbaMovement([{captured_at:new Date(now-5000).toISOString(),props:previous},{captured_at:new Date(now).toISOString(),props:split}],player.id,'points','betmgm','under')
  assert.equal(movement.priceFirstOdds,400);assert.equal(movement.priceLatestOdds,380)
  assert.notDeepEqual(nbaEconomicSnapshot([old]), nbaEconomicSnapshot([quote]))
})

test('common snapshot normalizes primary on cached and fresh ingress; incomplete source retains healthy sibling prices', async () => {
  const h = await fixture(), secondary = await h.getNbaSupplementalProps(game, 'pregame')
  const raw = { id: 1, game_id: game.id, player_id: player.id, vendor: 'betmgm', prop_type: 'points', line_value: '14.5', market: { type: 'milestone', odds: -500 }, updated_at: new Date(now - 1000).toISOString() }
  let fails = false, deferred = false, primaryFails = false, previous: paint.PaintProp[] = [], bookFrames:NbaCurrentBookFrame[]=[]
  const helper = await compile<typeof import('../src/lib/nbaPaintData.ts')>('../src/lib/nbaPaintData.ts', {
    'server-only': {}, 'node:crypto': crypto, '@/lib/balldontlie': { bdlHeaders: {} }, './nbaPaint': paint, './nbaOddsHistory': history, './nbaOddsHistoryData': {}, './nbaFirstBasketOddsData': {}, './nbaOddsMode': modes, './nbaOddsPhaseData': {getNbaPhaseSnapshot:async()=>({props:previous})}, './nbaOddsClockData': { getNbaOddsGame: async (g: paint.PaintGame) => g }, './nbaPrimaryProps': primary,
    './nbaSupplementalProps': { ...h, getNbaSupplementalProps: async () => { if (fails) throw new Error('source'); return deferred?{...secondary,props:[],complete:false,eventMatched:false,deferred:true}:secondary } },
    './nbaBookPropsData':{getNbaBookPropEntries:async()=>[],nbaBookPropsSupplement:(game:paint.PaintGame,props:paint.PaintProp[])=>nbaCurrentBookQuotes(game,props,bookFrames,now)},
    './nbaSharedCache': { nbaSharedCache: async (_key: string, _ttl: number, _stale: number, load: () => Promise<unknown>) => ({ value: await load() }) },
  }, { fetch: async () => primaryFails ? Response.json({}, { status: 503 }) : Response.json({ data: [raw] }) })
  for (const fresh of [false, true]) { const snapshot = await helper.getPaintPropSnapshot(game, 'pregame', fresh); assert.equal(snapshot.complete, true); assert.ok(snapshot.props.some(p => p.line_value === '14.5' && p.market.type === 'over_under' && p.market.over_odds === -500)); assert.ok(snapshot.props.some(p => p.line_value === '15' && p.market.odds === -550)) }
  const direct={...raw,id:-5_000_000_000_001,market:{type:'over_under' as const,over_odds:-600},updated_at:new Date(now).toISOString()}
  bookFrames=[{book:'betmgm',contract:{market:'points',type:'over_under',line:14.5},observedAt:direct.updated_at,complete:true,props:[direct]}]
  const newer=await helper.getPaintPropSnapshot(game,'pregame',true)
  assert.equal(newer.props.filter(p=>p.line_value==='14.5'&&p.market.over_odds!=null).length,1)
  assert.equal(newer.props.find(p=>p.line_value==='14.5'&&p.market.over_odds!=null)!.market.over_odds,-600)
  bookFrames=[{...bookFrames[0],props:[]}]
  const withdrawn=await helper.getPaintPropSnapshot(game,'pregame',true)
  assert.ok(!withdrawn.props.some(p=>p.line_value==='14.5'&&p.market.over_odds!=null),'a verified fresh exact panel withdrawal cannot be reintroduced by the API merge')
  assert.ok(withdrawn.props.some(p=>p.line_value==='15'),'a different milestone survives exact O/U withdrawal')
  bookFrames=[]
  fails = true
  const partial = await helper.getPaintPropSnapshot(game, 'pregame', true)
  assert.equal(partial.complete, false); assert.equal(partial.props.length, 1); assert.deepEqual(partial.issues, ['Some sportsbook prices unavailable'])
  assert.equal(JSON.stringify(partial).includes('The Odds API'), false)
  assert.equal(partial.props[0].id,1,'primary identity remains unchanged')
  fails=false;deferred=true
  assert.equal((await helper.getPaintPropSnapshot(game)).complete,true,'not-yet-listed event allows primary baseline before any supplement exists')
  previous=secondary.props
  assert.equal((await helper.getPaintPropSnapshot(game)).complete,false,'unlisted event cannot erase a captured supplemental book')
  primaryFails=true
  const noPrimary=await helper.getPaintPropSnapshot(game)
  assert.equal(noPrimary.primaryComplete,false);assert.equal(noPrimary.complete,false);assert.deepEqual(noPrimary.issues,['Some sportsbook prices unavailable'],'normal supplemental absence must not mask a primary outage')
})

test('separately observed O/U sides still produce MM without double weighting a sportsbook',async()=>{
  const h=await fixture(),base=(await h.getNbaSupplementalProps(game,'pregame')).props[0]
  const logs=Array.from({length:6},(_,i)=>({id:i,player:{id:player.id},game:{id:i,date:'2026-10-20',status:'Final',home_team_id:2,visitor_team_id:9,postseason:false},team:{id:2},min:'30',pts:20,reb:8,ast:5,fg3m:2,stl:1,blk:1,turnover:2,fga:14,fgm:7,fg3a:5,fta:5,ftm:4}))
  const props=h.nbaMergePropSources([{...base,line_value:'19.5',market:{type:'over_under',over_odds:-110},updated_at:new Date(now-2000).toISOString()}],[{...base,line_value:'19.5',market:{type:'over_under',under_odds:-110},updated_at:new Date(now-1000).toISOString()}])
  const p:paint.PaintPlayer={...player,props,headshot:null,injury:null,logs,average:{pts:20}}
  const other={...p,id:999,props:props.map(q=>({...q,player_id:999,line_value:'14.5'})),logs:logs.map(l=>({...l,player:{id:999},pts:15})),average:{pts:15}}
  assert.equal(nbaMarketRanks([p,other],'points','betmgm').size,2)
})

test('saved-pick verification accepts each exact split side and milestone, rejects changed or expired source prices',async()=>{
  const h=await fixture(),supp=(await h.getNbaSupplementalProps(game,'pregame')).props[0]
  let props=h.nbaMergePropSources([{...supp,line_value:'14.5',market:{type:'over_under',over_odds:-500},updated_at:new Date(now-2000).toISOString()}],[{...supp,line_value:'14.5',market:{type:'over_under',under_odds:380}},supp])
  const helper=await compile<typeof import('../src/lib/nbaPickValidation.ts')>('../src/lib/nbaPickValidation.ts',{
    'server-only':{},'./nbaPaintData':{getPaintGame:async()=>game,getPaintProps:async()=>props,getPaintIdentity:async()=>player},'./nbaPaint':paint,
    './nbaFirstBasketMarkets':{nbaFirstMarket:()=>false,nbaFirstLabel:()=>null},'./nbaFirstBasketOddsData':{},'./nbaSupplementalProps':h,
    './nbaSharedCache':{nbaSharedCache:async(_key:string,_ttl:number,_stale:number,load:()=>Promise<unknown>)=>({value:await load()})},
  },{Date:class extends Date{static now(){return now}}})
  const leg=(side:'over'|'under'|'milestone',line:number,odds:number)=>({game_pk:String(game.id),player_id:`bdl:${player.id}`,player_name:'Alex Sarr',team:null,game_date:game.date,prop_key:'points',prop_label:'Points',numeric_line:line,market_side:side,book:'betmgm',odds})
  for(const selection of [leg('over',14.5,-500),leg('under',14.5,380),leg('milestone',15,-550)])assert.equal(await helper.validatePaintPickLegs([selection]),null)
  assert.match((await helper.validatePaintPickLegs([leg('over',15,-550)]))!,/price changed/)
  props=props.map(p=>({...p,updated_at:new Date(now-300_001).toISOString()}))
  assert.match((await helper.validatePaintPickLegs([leg('milestone',15,-550)]))!,/price changed/)
})
