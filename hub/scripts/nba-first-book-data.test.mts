import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import * as modes from '../src/lib/nbaOddsMode.ts'
import * as first from '../src/lib/nbaFirstBasketOdds.ts'
import * as panels from '../src/lib/nbaFirstBookMarkets.ts'
import * as portraits from '../src/lib/nbaPlayerPortraits.ts'
import * as diagnostics from '../src/lib/nbaFirstEventDiagnostics.ts'
import type { PaintGame, PaintPlayer } from '../src/lib/nbaPaint.ts'

const now=Date.parse('2026-11-21T12:00:00Z'),at=new Date(now-1000).toISOString()
const team={id:1,abbreviation:'BOS',name:'Celtics',full_name:'Boston Celtics'},away={...team,id:2,abbreviation:'DET',full_name:'Detroit Pistons'}
const game={id:123,date:'2026-11-21',datetime:new Date(now+3600000).toISOString(),status:'Scheduled',status_state:'scheduled',period:0,home_team:team,visitor_team:away} as PaintGame
const player={id:434,first_name:'Real',last_name:'Player',position:'G',team,headshot:null} as PaintPlayer
const source:first.FirstOddsEvent={id:'verified',home_team:team.full_name,away_team:away.full_name,commence_time:game.datetime!,bookmakers:[{key:'fanduel',markets:[{key:'player_first_basket',last_update:at,outcomes:[{name:'Real Player',price:700}]}]},{key:'fanatics',markets:[{key:'player_first_basket',last_update:new Date(now-600000).toISOString(),outcomes:[{name:'Real Player',price:800}]}]}]}
async function compiled<T>(file:string,imports:Record<string,unknown>,Clock:unknown,fetcher:unknown=()=>{throw Error('Unexpected network')}):Promise<T>{
  const text=await readFile(new URL(file,import.meta.url),'utf8'),output=ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,target={exports:{}}
  new Function('require','module','exports','Date','fetch','process',output)((name:string)=>{assert.ok(name in imports,name);return imports[name]},target,target.exports,Clock,fetcher,{env:{ODDS_API_KEY:'fixture-only'}})
  return target.exports as T
}

test('member and cloud reads coalesce one 60-second all-book request, and every cached API price expires without restamping',async()=>{
  let clock=now,network=0
  class Clock extends Date{constructor(value:string|number=clock){super(value)}static now(){return clock}}
  const cache=new Map<string,unknown>(),calls:{key:string;ttl:number;stale:number}[]=[]
  const api=await compiled<typeof import('../src/lib/nbaFirstBasketOddsData.ts')>('../src/lib/nbaFirstBasketOddsData.ts',{
    'server-only':{},'./nbaPlayerPortraits':portraits,'./nbaFirstEventDiagnostics':diagnostics,
    './nbaOddsMode':{...modes,nbaPregameOpen:(game:PaintGame)=>modes.nbaPregameOpen(game,clock)},
    './nbaFirstBasketOdds':{...first,nbaNormalizeFirstOdds:(...args:Parameters<typeof first.nbaNormalizeFirstOdds>)=>first.nbaNormalizeFirstOdds(args[0],args[1],args[2],clock)},
    './nbaFirstBookMarkets':{...panels,nbaFirstBookMarkets:(...args:Parameters<typeof panels.nbaFirstBookMarkets>)=>panels.nbaFirstBookMarkets(args[0],args[1],args[2],args[3],clock)},
    './nbaPaintData':{getPaintRoster:async()=>[player],artwork:async()=>({headshots:new Map()})},
    './nbaOddsPhaseData':{},'./nbaOddsClockData':{},'./supabase/admin':{},'./nbaBookFirstData':{getNbaBookFirstSupplement:async()=>({props:[],complete:true})},
    './nbaSharedCache':{nbaSharedCache:async(key:string,ttl:number,stale:number,load:()=>Promise<unknown>)=>{calls.push({key,ttl,stale});if(!cache.has(key))cache.set(key,await load());return{value:cache.get(key)}}},
  },Clock,async()=>{network++;return Response.json(source)})
  const firstRead=await api.getNbaFirstOdds(game,true,[source]),second=await api.getNbaFirstOdds(game,true,[source])
  assert.equal(network,1,'the capture retry cannot multiply requests by book or member')
  assert.equal(firstRead.apiFrames.length,1);assert.equal(second.rows.length,1);assert.equal(firstRead.rows[0].offer.updated_at,at)
  assert.equal(firstRead.bookCoverage.find(row=>row.book==='fanatics'&&row.market==='player_first_basket')?.status,'expired')
  const cached=await api.getNbaFirstOdds(game,false,[source]);assert.equal(cached.rows.length,1)
  clock=now+300001
  const expired=await api.getNbaFirstOdds(game,false,[source]);assert.equal(expired.rows.length,0);assert.equal(expired.captureComplete,false)
  assert.ok(calls.filter(row=>row.key.startsWith('first-api:')).every(row=>row.ttl===60&&row.stale===0))
  assert.equal(network,1,'expiry is checked on the aggregate result even before a successful refresh')
})

test('a verified exact source panel reaches the service writer; invalid phase/time and failed receipts cannot claim success',async()=>{
  class Clock extends Date{constructor(value:string|number=now){super(value)}static now(){return now}}
  let writes=0,failed=false
  const api=await compiled<typeof import('../src/lib/nbaFirstBookMarketData.ts')>('../src/lib/nbaFirstBookMarketData.ts',{
    'server-only':{},'./nbaOddsMode':{...modes,nbaPregameOpen:(game:PaintGame)=>modes.nbaPregameOpen(game,now)},
    './supabase/admin':{createAdminClient:()=>({rpc:(name:string,args:{p_frames:panels.NbaFirstApiFrame[];p_mode:string})=>({abortSignal:async()=>{writes++;assert.equal(name,'record_nba_first_api_frames');assert.equal(args.p_mode,'pregame');assert.equal(args.p_frames[0].observedAt,at);return {data:failed?{captured:0,unchanged:0,skipped:0}:{captured:1,unchanged:0,skipped:0},error:null}}})})},
  },Clock)
  const frames=panels.nbaFirstBookMarkets(source,game,[player],'pregame',now).frames
  assert.deepEqual(await api.saveNbaFirstApiFrames(game,'pregame',frames),{captured:1,unchanged:0,skipped:0})
  assert.equal(writes,1)
  for(const frame of [{...frames[0],observedAt:new Date(now+1).toISOString()},{...frames[0],observedAt:new Date(now-300001).toISOString()},{...frames[0],book:'another-book'}])await assert.rejects(api.saveNbaFirstApiFrames(game,'pregame',[frame]))
  assert.equal(writes,1)
  failed=true;await assert.rejects(api.saveNbaFirstApiFrames(game,'pregame',frames),/could not be saved/)
})
