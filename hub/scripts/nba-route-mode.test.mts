import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import * as oddsMode from '../src/lib/nbaOddsMode.ts'

async function route(file: string, imports: Record<string, unknown>) {
  imports = { '@/lib/nbaResearchBundle': { resolveNbaResearchBundle: async (board: unknown, _mode: unknown, load: (board: unknown) => Promise<unknown>) => ({ board, value: await load(board) }) }, ...imports }
  const source = await readFile(new URL(file, import.meta.url), 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const target = { exports: {} as Record<string, (...args: any[]) => Promise<any>> }
  const deps = { '@/lib/nbaOddsClockData': {getNbaOddsGame:async(game:unknown)=>game}, './nbaOddsClockData': {getNbaOddsGame:async(game:unknown)=>game}, '@/lib/nbaOddsMode': oddsMode, './nbaOddsMode': oddsMode, 'server-only': {}, 'next/server': { NextResponse: { json: Response.json } }, '@/lib/paintAccess': { requirePaintAccess: async () => ({ userId: 'member' }) }, ...imports }
  new Function('require','module','exports',output)((name: string) => { assert.ok(name in deps,name); return deps[name as keyof typeof deps] },target,target.exports)
  return target.exports
}
const request = (search: string) => ({ nextUrl: new URL(`https://test/the-paint?${search}`), headers: new Headers() })

const failedResource = (delay: number) => async () => {
  await new Promise(resolve => setTimeout(resolve, delay))
  throw new Error('Saved resource unavailable')
}

test('Intelligence missing-resource metadata is stable when failures finish in opposite orders', async () => {
  const offer = { id: 7, player_id: 1, game_id: 123, prop_type: 'threes', vendor: 'fanduel', line_value: '5', market: { type: 'milestone', odds: 410 } }
  const board = { game: { id: 123, date: '2026-10-24', datetime: '2026-10-25T00:00:00Z', home_team: { id: 1 }, visitor_team: { id: 2 } }, sampleSeason: 2026, teams: [], fetchedAt: '2026-10-24T20:00:00Z', statsComplete: true, players: [{ id: 1, team: { id: 1 }, position: 'F', props: [offer] }] }
  const read = async (reverse: boolean) => {
    const api = await route('../src/app/the-paint/intelligence/route.ts', {
      '@/lib/nbaPaintData': { getPaintGame: async () => board.game, getPaintBoard: async () => board },
      '@/lib/nbaResearchResources': { getNbaResearchDefense: failedResource(reverse ? 15 : 0), getNbaResearchMarketContext: failedResource(reverse ? 0 : 15) },
      '@/lib/nbaMarketSelection': { nbaReadSelection: () => null, nbaSelectedPlayers: (players: unknown) => players },
      '@/lib/nbaMarketSignal': { nbaEmptyMarketContext: () => ({ available: false }), nbaMarketSupportView: (value: unknown) => value, nbaPlayerMarketSignals: () => ({ status: 'unavailable', signal: null }) },
      '@/lib/nbaIntelligence': { nbaGamePace: () => null, nbaPosition: () => 'F', nbaSlipSurgeScore: () => ({ score: 71, minutes: 30, production: 2.5, newTeam: false, marketSupport: { status: 'unavailable', signal: null } }) },
      '@/lib/nbaPaint': { PAINT_MARKETS: [{ key: 'threes' }], nbaPeriod: () => 0, nbaReference: () => offer },
      '@/lib/nbaMarketMetrics': { nbaMarketRanks: () => new Map([[1, { mm: -7 }]]) },
    })
    const response = await api.GET(request('game=123&market=threes&book=fanduel&mode=pregame'))
    assert.equal(response.status, 200)
    return response.json()
  }
  const first = await read(false), second = await read(true)
  assert.deepEqual(second, first)
  assert.deepEqual(first.unavailable, ['Defense context', 'Market context'])
  assert.equal(first.scores[0].score, null)
  assert.equal(first.scores[0].mm, -7)
  assert.deepEqual(first.scores[0].offer, offer)
  assert.equal(first.scores[0].production, 2.5)
})

test('Matrix missing-resource metadata is stable across asynchronous completion order', async () => {
  const factors = [{ id: 'mm', category: 'score', field: 'mm' }, { id: 'score', category: 'score', field: 'score' }, { id: 'tracking', category: 'tracking', field: 'touches' }, { id: 'picks', category: 'picks', field: 'picks' }]
  const matrix = { id: 'private-member-matrix', name: 'Frozen inputs', color: '#fff', definition: { factors } }
  const board = { game: { id: 123 }, fetchedAt: '2026-10-24T20:00:00Z', players: [{ id: 1, first_name: 'Test', last_name: 'Player', team: { abbreviation: 'MIN' } }] }
  const read = async (reverse: boolean) => {
    const query = { select: () => query, eq: () => query, order: () => query, then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ data: [matrix], error: null })) }
    const delay = (index: number) => (reverse ? 3 - index : index) * 10
    const api = await route('../src/app/api/nba-matrices/evaluate/route.ts', {
      '@/lib/supabase/admin': { createAdminClient: () => ({ from: () => query }) },
      '@/lib/nbaPaintData': { getPaintGame: async () => board.game, getPaintBoard: async () => board },
      '@/lib/nbaResearchResources': { getNbaResearchDefense: failedResource(delay(0)), getNbaResearchMarketContext: failedResource(delay(1)), getNbaResearchTracking: failedResource(delay(2)) },
      '@/lib/nbaPublicData': { getNbaPublicCaptures: failedResource(delay(3)) },
      '@/lib/nbaMatrix': { nbaMatrixCandidates: () => [{ id: '1', values: (factor: { field: string }) => factor.field === 'mm' ? -7 : null }], evaluateNbaMatrix: () => new Set(['1']) },
    })
    const response = await api.GET(request('game=123&mode=pregame'))
    assert.equal(response.status, 200)
    return response.json()
  }
  const first = await read(false), second = await read(true)
  assert.deepEqual(second, first)
  assert.deepEqual(first.unavailable, ['Defense context', 'Market signals', 'Public picks', 'Tracking'])
  assert.deepEqual(first.matches[0].readings[0].values, [{ id: 'mm', value: -7 }, { id: 'score', value: null }, { id: 'tracking', value: null }, { id: 'picks', value: null }])
})

test('Board defaults to Pregame and forwards Live explicitly while returning separate economic ETags', async () => {
  const modes: string[] = []
  const api = await route('../src/app/the-paint/board/route.ts', {
    'node:crypto': await import('node:crypto'),
    '@/lib/nbaPaintData': { getPaintGame: async () => ({id:123}), getPaintBoard: async (_game: unknown, mode: string) => { modes.push(mode); return { game:{id:123},oddsMode:mode,players:[{id:1,props:[{odds:mode==='live'?250:100}]}],fetchedAt:'2026-10-20T12:00:00Z' } } },
  })
  const pre = await api.GET(request('game=123')), live = await api.GET(request('game=123&mode=live')), unknown = await api.GET(request('game=123&mode=anything'))
  assert.deepEqual(modes,['pregame','live','pregame'])
  assert.equal((await pre.json()).players[0].props[0].odds,100)
  assert.equal((await live.json()).players[0].props[0].odds,250)
  assert.notEqual(pre.headers.get('etag'),live.headers.get('etag'))
  assert.equal(unknown.headers.get('etag'),pre.headers.get('etag'))
})

test('First Basket slate uses selected-phase prices and the same phase for every movement baseline', async () => {
  const quotes: string[] = [], histories: string[] = []
  const api = await route('../src/app/the-paint/first-basket/odds/route.ts', {
    '@/lib/nbaPaint': { nbaDate: (value: string) => value },
    '@/lib/nbaPaintData': { getPaintSchedule: async () => ({date:'2026-10-20',games:[{id:123},{id:456}]}) },
    '@/lib/nbaFirstBasketOddsData': { getNbaFirstOddsForMode: async (game: {id:number}, mode: string) => { quotes.push(`${game.id}:${mode}`); return {rows:[{game,offer:{odds:mode==='live'?800:500}}],unmatched:0,observedAt:'2026-10-20T13:00:00Z'} }, NbaFirstOddsUnavailable: class extends Error {} },
    '@/lib/nbaFirstBasketHistoryData': { attachNbaFirstBasketHistory: async (id: number, rows: unknown[], _at: string, mode: string) => { histories.push(`${id}:${mode}`); return rows } },
  })
  for (const mode of ['pregame','live']) {
    const response = await api.GET(request(`date=2026-10-20&mode=${mode}`)), body = await response.json()
    assert.equal(body.mode,mode); assert.equal(body.rows.length,2)
    assert.ok(body.rows.every((row: {offer:{odds:number}}) => row.offer.odds === (mode==='live'?800:500)))
  }
  assert.deepEqual(quotes,['123:pregame','456:pregame','123:live','456:live'])
  assert.deepEqual(histories,quotes)
})

test('Public snapshots retain the recorded tipoff when a provider later reschedules the game', async () => {
  const tip = Date.parse('2020-10-20T13:00:00Z'), cache = new Map<string, unknown>(), keys: string[] = []
  const snapshots = [
    {captured_at:new Date(tip-1000).toISOString(),snapshot:{gameId:123,capturedAt:new Date(tip-1000).toISOString(),rows:[{playerId:1,market:'points',picks:20}],markets:['points'],sourceUrl:'private'}},
    {captured_at:new Date(tip+1000).toISOString(),snapshot:{gameId:123,capturedAt:new Date(tip+1000).toISOString(),rows:[{playerId:1,market:'points',picks:50}],markets:['points'],sourceUrl:'private'}},
  ]
  const admin = {from:()=>{
    let lower = -Infinity, upper = Infinity
    const query = {select:()=>query,eq:()=>query,lte:(_key:string,value:string)=>{upper=Date.parse(value);return query},gte:(_key:string,value:string)=>{lower=Date.parse(value);return query},order:()=>query,limit:()=>query,abortSignal:async()=>({data:snapshots.filter(row=>Date.parse(row.captured_at)>=lower&&Date.parse(row.captured_at)<=upper).reverse(),error:null})}
    return query
  }}
  const movedGame = {id:123,datetime:new Date(Date.now()+3600000).toISOString(),status:'Scheduled'}
  const data = await route('../src/lib/nbaPublicData.ts', {
    './nbaPublicHistory': await import('../src/lib/nbaPublicHistory.ts'),
    './nbaOddsClockData': {getNbaOddsGame:async(game:unknown)=>({...game as object,datetime:new Date(tip).toISOString()})},
    './supabase/admin': {createAdminClient:()=>admin},
    './nbaPaintData': {getPaintGame:async()=>({id:123,datetime:new Date(tip).toISOString(),status:'Final'})},
    './nbaSharedCache': {nbaSharedCache:async(key:string,_ttl:number,_stale:number,load:()=>Promise<unknown>)=>{keys.push(key);if(!cache.has(key))cache.set(key,await load());return {value:cache.get(key)}}},
  })
  const pre = await data.getNbaPublicCaptures(123,'pregame',movedGame), live = await data.getNbaPublicCaptures(123,'live',movedGame)
  assert.equal(pre.length,1);assert.equal(pre[0].snapshot.rows[0].picks,20)
  assert.equal(live.length,1);assert.equal(live[0].snapshot.rows[0].picks,50)
  assert.notEqual(keys[0],keys[1]);assert.doesNotMatch(JSON.stringify([pre,live]),/sourceUrl|private/)
})

test('Matrix evaluation uses selected-phase exact prices and public picks while retaining owner scope', async () => {
  const reads: string[] = [], ownership: string[] = []
  const matrix = {id:'m',name:'Phase test',color:'#fff',priority:0,enabled:true,matrix_type:'classic',match_mode:'all',match_any_count:null,pipeline_scope:'game',element_code:'NBA-X',definition:{factors:[
    {id:'price',category:'market',field:'market',operator:'gte',value:200,window:'l10',vendor:'fanduel',propType:'points',marketValue:'current',marketLine:15,marketKind:'milestone',marketSide:'over'},
    {id:'picks',category:'picks',field:'picks',operator:'gte',value:40,window:'l10',vendor:null,propType:'points',marketValue:null},
  ]}}
  const query = {select:()=>query,eq:(key:string,value:unknown)=>{if(key==='user_id')ownership.push(String(value));return query},order:()=>query,then:(resolve:(value:unknown)=>unknown)=>Promise.resolve(resolve({data:[matrix],error:null}))}
  const game={id:123,date:'2026-10-20',status:'Scheduled',home_team:{id:1},visitor_team:{id:2}}
  const api = await route('../src/app/api/nba-matrices/evaluate/route.ts', {
    '@/lib/supabase/admin': {createAdminClient:()=>({from:()=>query})},
    '@/lib/nbaPaintData': {getPaintGame:async()=>game,getPaintBoard:async(_game:unknown,mode:string)=>{reads.push('board:'+mode);return {game,players:[{id:1,first_name:'Test',last_name:'Player',team:{id:1,abbreviation:'BOS'},logs:[],average:{},props:[{id:1,game_id:123,player_id:1,prop_type:'points',vendor:'fanduel',line_value:'15',updated_at:'2026-10-20T12:00:00Z',market:{type:'milestone',odds:mode==='live'?250:100}}]}],fetchedAt:'2026-10-20T12:00:00Z'}}},
    '@/lib/nbaMatrix': await import('../src/lib/nbaMatrix.ts'),
    '@/lib/nbaIntelligenceData': {}, '@/lib/nbaMarketSignalData': {}, '@/lib/nbaTrackingData': {},
    '@/lib/nbaResearchResources': {},
    '@/lib/nbaPublicData': {getNbaPublicCaptures:async(_id:number,mode:string)=>{reads.push('picks:'+mode);return [{snapshot:{rows:[{playerId:1,market:'points',picks:mode==='live'?50:20}]}}]}},
  })
  const pre = await (await api.GET(request('game=123'))).json(), live = await (await api.GET(request('game=123&mode=live'))).json()
  assert.deepEqual(pre.matches[0].playerIds,[])
  assert.deepEqual(live.matches[0].playerIds,[1])
  assert.deepEqual(live.matches[0].readings[0].values.map((row:{value:number})=>row.value),[250,50])
  assert.deepEqual(reads,['board:pregame','picks:pregame','board:live','picks:live'])
  assert.deepEqual(ownership,['member','member'])
})

test('a cached pregame Slate rebuilds immediately at tipoff instead of carrying its last live provider response', async () => {
  const tip = Date.parse('2020-10-20T13:00:00Z'); let now = tip - 1000, builds = 0
  const game = {id:123,date:'2020-10-20',datetime:new Date(tip).toISOString(),status:'Scheduled',status_state:'scheduled',period:0}
  const cached = new Map<string, unknown>()
  const api = await route('../src/app/the-paint/slate/route.ts', {
    '@/lib/nbaOddsClockData': {getNbaOddsGame:async(value:any)=>({...value,datetime:new Date(tip).toISOString()})},
    '@/lib/nbaOddsMode': {...oddsMode,nbaPregameOpen:(value:any)=>oddsMode.nbaPregameOpen(value,now),nbaLiveOpen:(value:any)=>oddsMode.nbaLiveOpen(value,now)},
    '@/lib/nbaMarketSelection': {nbaReadSelection:()=>null,nbaSelectedPlayers:(players:unknown)=>players},
    '@/lib/nbaPaint': {nbaDate:(value:string)=>value,PAINT_MARKETS:[{key:'points'}],nbaPeriod:()=>0},
    '@/lib/nbaPaintData': {getPaintSchedule:async()=>({date:game.date,games:[game],complete:true}),getPaintBoard:async(_game:any,mode:string)=>{assert.equal(_game.datetime,new Date(tip).toISOString());assert.equal(mode,'pregame');builds++;return {game,players:[],statsComplete:true,price:now<tip?110:130}},refreshPaintBoardPrices:async(board:unknown,mode:string)=>{assert.equal(mode,'pregame');return board}},
    '@/lib/nbaSharedCache': {nbaSharedCache:async(key:string,_ttl:number,_stale:number,load:()=>Promise<unknown>)=>{if(!cached.has(key))cached.set(key,await load());return {value:cached.get(key),fetchedAt:new Date(now).toISOString(),stale:false}}},
    '@/lib/nbaResearchResources': {getNbaResearchModels:async()=>[],getNbaResearchDefense:async()=>({ready:false,profiles:[]}),getNbaResearchMarketContext:async()=>({gameId:123})},
    '@/lib/nbaSlateFreezeData': {captureNbaSlatePools:async()=>({full:1,quarter:0}),getNbaSlateRanks:async()=>({ranks:new Map(),unavailable:[],observedAt:{},heatDomains:{}}),getNbaLegacySlateRows:async()=>null},
    '@/lib/nbaSlateHeat': await import('../src/lib/nbaSlateHeat.ts'),
    '@/lib/nbaSlate': {nbaSlateRows:(boards:any[])=>boards.map(board=>({game:board.game,player:{id:1},market:'points',offer:{odds:board.price},signalOffers:[],baseScore:50,issues:[]}))},
    '@/lib/nbaMarketSignal': {nbaMarketSupportView:(value:unknown)=>value,nbaPlayerMarketSignals:()=>null},
    '@/lib/nbaIntelligence': {nbaContextualScore:()=>({score:50,marketSupport:null})},
  })
  const search='date=2020-10-20&market=points&book=all&side=over'
  assert.equal((await (await api.GET(request(search))).json()).rows[0].offer.odds,110)
  await api.GET(request(search));assert.equal(builds,1)
  now=tip+1
  game.datetime=new Date(tip+3600000).toISOString()
  assert.equal((await (await api.GET(request(search))).json()).rows[0].offer.odds,130)
  assert.equal(builds,3,'closed response re-resolves the final research archive after the cache loader')
})
