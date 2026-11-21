import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import * as modes from '../src/lib/nbaOddsMode.ts'
import * as first from '../src/lib/nbaFirstBasketOdds.ts'
import * as panels from '../src/lib/nbaFirstBookMarkets.ts'
import * as portraits from '../src/lib/nbaPlayerPortraits.ts'
import * as diagnostics from '../src/lib/nbaFirstEventDiagnostics.ts'
import * as freshness from '../src/lib/nbaFirstQuoteFreshness.ts'
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

test('member and cloud reads share separate bounded source requests, and cached API prices expire without restamping',async()=>{
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
  },Clock,async(url:URL)=>{network++;return Response.json({...source,bookmakers:source.bookmakers?.filter(book=>(url.searchParams.get('bookmakers')??'').split(',').includes(book.key))})})
  const firstRead=await api.getNbaFirstOdds(game,true,[source]),second=await api.getNbaFirstOdds(game,true,[source])
  assert.equal(network,2,'the capture retry cannot multiply requests by book or member')
  assert.equal(firstRead.apiFrames.length,1);assert.equal(second.rows.length,1);assert.equal(firstRead.rows[0].offer.updated_at,at)
  assert.equal(firstRead.bookCoverage.find(row=>row.book==='fanatics'&&row.market==='player_first_basket')?.status,'expired')
  const cached=await api.getNbaFirstOdds(game,false,[source]);assert.equal(cached.rows.length,1)
  clock=now+300001
  const expired=await api.getNbaFirstOdds(game,false,[source]);assert.equal(expired.rows.length,0);assert.equal(expired.captureComplete,false)
  assert.ok(calls.filter(row=>row.key.startsWith('first-api:')).every(row=>row.ttl===60&&row.stale===0))
  assert.ok(calls.filter(row=>row.key.startsWith('fanatics-first:')).every(row=>row.ttl===30&&row.stale===0))
  assert.equal(network,2,'expiry is checked on the aggregate result even before a successful refresh')
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

async function delayedResponse({frozen=false,crossTip=false}={}){
  let clock=frozen?now+2000:now
  class Clock extends Date{constructor(value:string|number=clock){super(value)}static now(){return clock}}
  const scheduled=crossTip?{...game,datetime:new Date(now+500).toISOString()}:game
  const row=(vendor:string,age:number)=>({game:scheduled,player,offer:{id:-434,game_id:game.id,player_id:player.id,vendor,prop_type:'first_score',line_value:'0.5',market:{type:'over_under',over_odds:700},updated_at:new Date(now-age).toISOString()}})
  const rows=[row('fanduel',299500),row('draftkings',1000)]
  const api=await compiled<{GET:(request:unknown)=>Promise<Response>}>('../src/app/the-paint/first-basket/odds/route.ts',{
    'next/server':{NextResponse:{json:Response.json}},'@/lib/nbaOddsMode':modes,'@/lib/nbaFirstQuoteFreshness':freshness,
    '@/lib/paintAccess':{requirePaintAccess:async()=>({isAdmin:false})},'@/lib/nbaPaint':{nbaDate:(date:string)=>date},
    '@/lib/nbaPaintData':{getPaintSchedule:async()=>({date:game.date,games:[scheduled]})},
    '@/lib/nbaFirstBasketOddsData':{NbaFirstOddsUnavailable:class extends Error{},getNbaFirstOddsForMode:async()=>({rows,unmatched:0,eventMatched:true,observedAt:new Date(clock).toISOString(),frozen,bookCoverage:[{gameId:game.id,book:'fanduel',market:'player_first_basket',status:'fresh',quoteAt:rows[0].offer.updated_at,quotes:1}]})},
    '@/lib/nbaFirstBasketHistoryData':{attachNbaFirstBasketHistory:async(_game:number,current:unknown[])=>{clock+=1000;return current}},
  },Clock)
  return (await api.GET({nextUrl:new URL('https://test/the-paint/first-basket/odds?date='+game.date)})).json()
}

test('the completed slate response rechecks source age after delayed movement history without blocking healthy books',async()=>{
  const body=await delayedResponse()
  assert.equal(body.status,'partial');assert.deepEqual(body.rows.map((row:any)=>row.offer.vendor),['draftkings'])
  assert.equal(body.bookCoverage[0].status,'expired');assert.equal(body.bookCoverage[0].quotes,0)
  assert.equal(body.fetchedAt,new Date(now+1000).toISOString());assert.equal(body.historyAvailable,true)
})

test('a response crossing tip holds unproven prices, while durable frozen pregame prices remain available',async()=>{
  assert.equal((await delayedResponse({crossTip:true})).rows.length,0)
  const archived=await delayedResponse({crossTip:true,frozen:true})
  assert.equal(archived.rows.length,2);assert.deepEqual(archived.frozenGameIds,[game.id])
})

async function independentSources({mainFailure=false,fanaticsFailure=false,fanaticsClock='fresh'}:{mainFailure?:boolean;fanaticsFailure?:boolean;fanaticsClock?:'fresh'|'stale'|'future'|'wrong-event'}={}){
  let clock=now,fanaticsReady=false
  class Clock extends Date{constructor(value:string|number=clock){super(value)}static now(){return clock}}
  const requests:{book:string;at:number}[]=[],cache=new Map<string,{expires:number;value:Promise<unknown>}>()
  const api=await compiled<typeof import('../src/lib/nbaFirstBasketOddsData.ts')>('../src/lib/nbaFirstBasketOddsData.ts',{
    'server-only':{},'./nbaPlayerPortraits':portraits,'./nbaFirstEventDiagnostics':diagnostics,
    './nbaOddsMode':{...modes,nbaPregameOpen:(game:PaintGame)=>modes.nbaPregameOpen(game,clock)},
    './nbaFirstBasketOdds':{...first,nbaNormalizeFirstOdds:(...args:Parameters<typeof first.nbaNormalizeFirstOdds>)=>first.nbaNormalizeFirstOdds(args[0],args[1],args[2],clock)},
    './nbaFirstBookMarkets':{...panels,nbaFirstBookMarkets:(...args:Parameters<typeof panels.nbaFirstBookMarkets>)=>panels.nbaFirstBookMarkets(args[0],args[1],args[2],args[3],clock)},
    './nbaPaintData':{getPaintRoster:async()=>[player],artwork:async()=>({headshots:new Map()})},'./nbaOddsPhaseData':{},'./nbaOddsClockData':{},'./supabase/admin':{},
    './nbaBookFirstData':{getNbaBookFirstSupplement:async()=>({props:[],complete:true})},
    './nbaSharedCache':{nbaSharedCache:async(key:string,ttl:number,stale:number,load:()=>Promise<unknown>)=>{
      assert.equal(stale,0);let entry=cache.get(key)
      if(!entry||entry.expires<=clock){entry={expires:clock+ttl*1000,value:Promise.resolve().then(load)};cache.set(key,entry)}
      return{value:await entry.value}
    }},
  },Clock,async(url:URL)=>{
    const fanatics=url.searchParams.get('bookmakers')==='fanatics',book=fanatics?'fanatics':'fanduel';requests.push({book,at:clock})
    if(fanatics?fanaticsFailure:mainFailure)return Response.json({}, {status:503})
    const sourceAt=fanatics?(fanaticsClock==='future'?clock+1:fanaticsClock==='stale'&&!fanaticsReady?clock-600000:clock-500):now-1000
    return Response.json({...source,id:fanatics&&fanaticsClock==='wrong-event'?'another-event':source.id,bookmakers:[{key:book,markets:[{key:'player_first_basket',last_update:new Date(sourceAt).toISOString(),outcomes:[{name:'Real Player',price:fanatics?900:700}]}]}]})
  })
  return{load:()=>api.getNbaFirstOdds(game,true,[source]),requests,ready:()=>{fanaticsReady=true},advance:(elapsed:number)=>{clock=now+elapsed}}
}

test('Fanatics recovers on its own 30-second lease while main-book observations retain their clocks and requests coalesce',async()=>{
  const h=await independentSources({fanaticsClock:'stale'})
  const initial=await h.load();assert.deepEqual(initial.rows.map(row=>row.offer.vendor),['fanduel'])
  h.ready();h.advance(31_000)
  const readers=await Promise.all(Array.from({length:25},()=>h.load()))
  assert.equal(h.requests.filter(row=>row.book==='fanatics').length,2)
  assert.equal(h.requests.filter(row=>row.book==='fanduel').length,1)
  assert.ok(readers.every(result=>result.rows.some(row=>row.offer.vendor==='fanatics'&&row.offer.updated_at===new Date(now+30_500).toISOString())))
  assert.ok(readers.every(result=>result.rows.find(row=>row.offer.vendor==='fanduel')?.offer.updated_at===at))
  assert.equal(readers[0].rows.find(row=>row.offer.vendor==='fanatics')?.offer.prop_type,'first_field_goal')
})

test('independent source outages, suspended/future quotes and a mismatched event never freshen or withdraw healthy siblings',async()=>{
  for(const options of [{mainFailure:true},{fanaticsFailure:true},{fanaticsClock:'stale' as const},{fanaticsClock:'future' as const},{fanaticsClock:'wrong-event' as const}]){
    const h=await independentSources(options),result=await h.load(),expected=options.mainFailure?'fanatics':'fanduel'
    assert.deepEqual(result.rows.map(row=>row.offer.vendor),[expected])
    assert.equal(result.apiFrames.every(frame=>frame.book===expected),true)
    if(options.mainFailure||options.fanaticsFailure||options.fanaticsClock==='wrong-event')assert.equal(result.captureComplete,false)
    if(options.fanaticsFailure)assert.equal(result.bookCoverage.find(row=>row.book==='fanatics')?.status,'unavailable')
    assert.equal(result.rows.some(row=>Date.parse(row.offer.updated_at)>now||now-Date.parse(row.offer.updated_at)>300000),false)
  }
  await assert.rejects((await independentSources({mainFailure:true,fanaticsFailure:true})).load(),/unavailable/i)
})
