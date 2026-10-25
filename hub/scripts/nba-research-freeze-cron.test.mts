import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import * as crypto from 'node:crypto'
import ts from 'typescript'
import * as paint from '../src/lib/nbaPaint.ts'
import * as mode from '../src/lib/nbaOddsMode.ts'

async function fixture(incomplete=false) {
  let now=Date.parse('2026-10-25T22:30:00Z'), scoreCache=false,priceHook:(()=>void)|undefined
  const date='2026-10-25',cache=new Map<string,{value:unknown;fetched_at:string}>(),archive=new Map<string,{value:any}>()
  const games=[1,2].map(id=>({id,date,datetime:new Date(now+id*3600000).toISOString(),status:'Scheduled',status_state:'scheduled',home_team:{id:1},visitor_team:{id:2}}))
  const reads:number[]=[],poolCalls:any[]=[],warms:any[]=[],rpcCalls:string[]=[],dates:string[]=[]
  const query:any={select:()=>query,in:async(_key:string,keys:string[])=>({data:[...cache].filter(([key])=>keys.includes(key)).map(([key,value])=>({key,fetched_at:value.fetched_at})),error:null}),update:()=>query,eq:()=>query,then:(resolve:(value:unknown)=>unknown)=>Promise.resolve(resolve({error:null}))}
  const admin={from:()=>query,rpc:async(name:string)=>{rpcCalls.push(name);return {data:name==='claim_nba_source'?true:0,error:null}}}
  const board=(game:any)=>({game,players:[],statsComplete:!incomplete||game.id!==2,periodStatsComplete:true,sampleSeason:2026,issues:[],fetchedAt:new Date(now).toISOString(),marker:'old'})
  class Clock extends Date {constructor(value:string|number=now){super(value)}static now(){return now}}
  const imports:Record<string,unknown>={
    'node:crypto':crypto,'next/server':{NextResponse:{json:(value:unknown,init?:{status?:number})=>({status:init?.status??200,value})}},
    '@/lib/cron-auth':{requireCronAuth:()=>null},'@/lib/pipelineHealth':{withPipelineHealth:(_name:string,run:unknown)=>run},'@/lib/supabase/admin':{createAdminClient:()=>admin},
    '@/lib/nbaPaintData':{getPaintSchedule:async(day:string)=>{dates.push(day);return{date:day,games:day===date?games:[],complete:true}},getPaintBoard:async(game:any)=>{reads.push(game.id);const value=board(game);archive.set(game.id+':board:v1',{value:structuredClone(value)});return value},refreshPaintBoardPrices:async(board:unknown,phase:string)=>{assert.equal(phase,'pregame');priceHook?.();return board}},
    '@/lib/nbaResearchResources':{getNbaResearchDefense:async()=>({profiles:[]}),getNbaResearchModels:async(board:any)=>{archive.set(board.game.id+':models:v1',{value:[]});return[]},getNbaResearchMarketContext:async()=>({}),warmNbaResearchResources:async(board:any,options:any)=>{warms.push({game:board.game.id,...options});return[{resource:'models',status:'captured'}]}},
    '@/lib/nbaMarketSignal':{nbaMarketSupportIdentity:()=>({})},'@/lib/nbaIntelligence':{},'@/lib/nbaModel':{},'@/lib/nbaMovement':{},
    '@/lib/nbaSharedCache':{nbaSharedCache:async(key:string,_ttl:number,_stale:number,load:()=>Promise<unknown>)=>{if(scoreCache&&key.startsWith('snapshot-attempt:')&&cache.has(key))return cache.get(key);const value={value:await load(),fetched_at:new Date(now).toISOString()};cache.set(key,value);return value}},
    '@/lib/nbaResearchIdentity':{ensureNbaResearchPlayers:async()=>{}},'@/lib/nbaPaint':{...paint,nbaToday:()=>date},
    '@/lib/nbaOddsClockData':{getNbaOddsGame:async(game:unknown)=>game},'@/lib/nbaOddsMode':{...mode,nbaPregameOpen:(game:any)=>mode.nbaPregameOpen(game,now)},
    '@/lib/nbaPregameResearchData':{readNbaPregameResearch:async(game:any,key:string)=>structuredClone(archive.get(game.id+':'+key)??null)},
    '@/lib/nbaSlateFreezeData':{captureNbaSlatePools:async(games:any[],boards:any[],complete:boolean,_at:unknown,models:any[])=>{poolCalls.push({games,boards,complete,models});return{full:complete&&boards.every(board=>board.statsComplete)?games.length:0,quarter:0}}},
  }
  const output=ts.transpileModule(await readFile(new URL('../src/app/api/cron/nba-research-snapshot/route.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
  const target={exports:{}}
  new Function('require','module','exports','Date',output)((key:string)=>{assert.ok(key in imports,key);return imports[key]},target,target.exports,Clock)
  return {api:target.exports as {GET:(request:Request)=>Promise<{status:number;value:any}>},reads,poolCalls,warms,rpcCalls,dates,now,games,archive,board,advance:(ms:number)=>{now+=ms},setTime:(value:number)=>{now=value},cacheScores:()=>{scoreCache=true},onPrice:(hook:()=>void)=>{priceHook=hook}}
}

test('existing research pass reuses its boards for the whole-slate capture and warms only one rotating matchup',async()=>{
  const h=await fixture(),response=await h.api.GET(new Request('https://example.test/api/cron/nba-research-snapshot'))
  assert.equal(response.status,200);assert.deepEqual(h.reads,[1,2]);assert.equal(h.poolCalls.length,1)
  assert.equal(h.poolCalls[0].complete,true);assert.equal(h.poolCalls[0].boards.length,2);assert.equal(h.poolCalls[0].games.length,2)
  assert.equal(h.warms.length,1);assert.equal(h.warms[0].deadline,h.now+160_000)
  assert.deepEqual(h.dates,['2026-10-25','2026-10-26','2026-10-27'])
  assert.equal(h.rpcCalls.filter(name=>name==='claim_nba_source').length,1);assert.equal(h.rpcCalls.filter(name=>name==='prune_nba_source_cache').length,1)
  assert.equal(response.value.slatePools[0].full,2);assert.equal(response.value.resources[0].status,'captured')
})

test('incomplete research coverage is explicit and cannot be reported as a saved slate pool',async()=>{
  const h=await fixture(true),response=await h.api.GET(new Request('https://example.test/api/cron/nba-research-snapshot'))
  assert.equal(response.status,503);assert.equal(response.value.results.find((row:any)=>row.game===2).reason,'Game-log coverage incomplete; score archive deferred')
  assert.equal(response.value.slatePools[0].full,0);assert.deepEqual(h.reads,[1,2]);assert.equal(h.warms.length,1)
})

test('resource warming rotates independently across successful full score passes and cached score attempts',async()=>{
  const h=await fixture(),request=new Request('https://example.test/api/cron/nba-research-snapshot')
  const first=await h.api.GET(request);h.advance(5*60_000);const second=await h.api.GET(request)
  assert.equal(first.status,200);assert.equal(second.status,200);assert.deepEqual(h.warms.map(row=>row.game),[1,2])
  assert.deepEqual(h.reads,[1,2,1,2],'normal complete score order did not control warm rotation')
  h.cacheScores();h.advance(5*60_000);const third=await h.api.GET(request)
  assert.equal(third.status,200);assert.deepEqual(h.warms.map(row=>row.game),[1,2,1]);assert.deepEqual(h.reads,[1,2,1,2],'cached score attempt still warms its independently selected archived board')
})

test('pool assembly crossing tip replaces loaded board and models with the final archive winners',async()=>{
  const h=await fixture();let crossed=false
  h.onPrice(()=>{if(crossed)return;crossed=true;const game=h.games[0];h.setTime(Date.parse(game.datetime)+1);h.archive.set('1:board:v1',{value:{...h.board(game),marker:'final'}});h.archive.set('1:models:v1',{value:[{marker:'final-model'}]})})
  const response=await h.api.GET(new Request('https://example.test/api/cron/nba-research-snapshot'))
  assert.equal(response.status,200);const pool=h.poolCalls[0]
  assert.equal(pool.boards.find((board:any)=>board.game.id===1).marker,'final');assert.deepEqual(pool.models.find((model:any)=>model.gameId===1).reports,[{marker:'final-model'}]);assert.deepEqual(h.reads,[1,2],'closure performs archive reads, not another stats load')
})
