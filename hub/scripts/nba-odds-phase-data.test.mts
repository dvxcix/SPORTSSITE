import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import ts from 'typescript'
import * as crypto from 'node:crypto'
import * as paint from '../src/lib/nbaPaint.ts'
import * as movement from '../src/lib/nbaMovement.ts'
import * as history from '../src/lib/nbaOddsHistory.ts'
import * as firstMarkets from '../src/lib/nbaFirstBasketMarkets.ts'

async function compiled<T>(file:string,imports:Record<string,unknown>,Clock:unknown):Promise<T>{
 const source=await readFile(new URL(file,import.meta.url),'utf8'),output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 const target={exports:{}}
 new Function('require','module','exports','Date',output)((key:string)=>{if(key==='./nbaOddsClockData'&&!(key in imports))return{getNbaOddsGame:async(game:unknown)=>game};assert.ok(key in imports,key);return imports[key]},target,target.exports,Clock)
 return target.exports as T
}
const tip=Date.parse('2026-10-20T20:00:00Z'),team={id:2,abbreviation:'BOS',full_name:'Boston Celtics',name:'Celtics'}
const game={id:123,date:'2026-10-20',season:2026,datetime:new Date(tip).toISOString(),status:'Scheduled',status_state:'scheduled',period:0,home_team:team,visitor_team:{...team,id:9},home_team_score:0,visitor_team_score:0} as paint.PaintGame
const quote=(at:number,odds:number,prop='points'):paint.PaintProp=>({id:1,game_id:123,player_id:434,vendor:'fanduel',prop_type:prop,line_value:prop==='points'?'15':'0.5',market:prop==='points'?{type:'milestone',odds}:{type:'over_under',over_odds:odds},updated_at:new Date(at).toISOString()})
async function fixture(){
 let now=tip+600000
 class Clock extends Date{constructor(value:string|number=now){super(value)}static now(){return now}}
 const modes=await compiled<typeof import('../src/lib/nbaOddsMode.ts')>('../src/lib/nbaOddsMode.ts',{},Clock)
 let payload:unknown=[]
 const calls:{name:string;args:Record<string,unknown>}[]=[],keys:string[]=[]
 const cache={nbaSharedCache:async(key:string,_ttl:number,stale:number,load:()=>Promise<unknown>)=>{keys.push(key);assert.equal(stale,0);return{value:await load()}}}
 const admin={rpc:(name:string,args:Record<string,unknown>)=>({abortSignal:async()=>{calls.push({name,args});return{data:payload,error:null}}})}
 const phase=await compiled<typeof import('../src/lib/nbaOddsPhaseData.ts')>('../src/lib/nbaOddsPhaseData.ts',{'server-only':{},'./supabase/admin':{createAdminClient:()=>admin},'./nbaSharedCache':cache,'./nbaOddsMode':modes},Clock)
 return{phase,Clock,modes,cache,admin,calls,keys,set:(value:unknown)=>{payload=value},time:(value:number)=>{now=value}}
}

test('frozen NBA snapshots preserve each empty feed and never borrow a different phase',async()=>{
 const h=await fixture()
 h.set([{feed:'props',captured_at:new Date(tip-1000).toISOString(),quotes:[],fingerprint:'empty'},{feed:'first',captured_at:new Date(tip-2000).toISOString(),quotes:[quote(tip-3000,1000,'first_score')],fingerprint:'first'}])
 const pre=await h.phase.getNbaPhaseSnapshot(game)
 assert.deepEqual(pre.props,[]);assert.equal(pre.available.props,true);assert.equal(pre.available.gameOdds,false);assert.equal(pre.firstBasket[0].market.over_odds,1000)
 h.set([{feed:'props',captured_at:new Date(tip+3000).toISOString(),quotes:[quote(tip+2000,-600)],fingerprint:'live'}])
 const live=await h.phase.getNbaPhaseSnapshot(game,'live')
 assert.equal(live.props[0].market.odds,-600);assert.deepEqual(live.firstBasket,[]);assert.equal(live.available.firstBasket,false)
 assert.notEqual(h.keys[0],h.keys[1]);assert.deepEqual(h.calls.map(row=>row.args.p_mode),['pregame','live'])
})
test('phase readers reject cross-phase frames and remove future/stale quote timestamps',async()=>{
 const h=await fixture()
 h.set([{feed:'props',captured_at:new Date(tip-1000).toISOString(),quotes:[quote(tip-2000,100),quote(tip+1000,-600)],fingerprint:'pre'}])
 assert.equal((await h.phase.getNbaPhaseSnapshot(game)).props.length,1)
 await assert.rejects(()=>h.phase.getNbaPhaseSnapshot(game,'live'),/Invalid NBA phase/)
 h.set([{feed:'props',captured_at:new Date(tip+1000).toISOString(),quotes:[quote(tip-1000,100),quote(tip+500,-600),quote(tip+2000,200)],fingerprint:'live'}])
 const live=await h.phase.getNbaPhaseSnapshot(game,'live');assert.equal(live.props.length,1);assert.equal(live.props[0].market.odds,-600)
 await assert.rejects(()=>h.phase.getNbaPhaseSnapshot({...game,datetime:null,status:'Unknown'}),/Verified NBA phase/)
})
test('crossing tipoff partitions cached pregame reads and history preserves exact market/player selection',async()=>{
 const h=await fixture();h.set([]);h.time(tip-1000);await h.phase.getNbaPhaseSnapshot(game);h.time(tip+1000);await h.phase.getNbaPhaseSnapshot(game);assert.notEqual(h.keys[0],h.keys[1])
 const data=await compiled<typeof import('../src/lib/nbaOddsHistoryData.ts')>('../src/lib/nbaOddsHistoryData.ts',{'server-only':{},'./supabase/admin':{createAdminClient:()=>h.admin},'./nbaSharedCache':h.cache,'./nbaFirstBasketMarkets':firstMarkets,'./nbaOddsPhaseData':h.phase,'./nbaOddsMode':h.modes,'./nbaPaintData':{getPaintGame:async()=>game}},h.Clock)
 h.set([{captured_at:new Date(tip-1000).toISOString(),quotes:[quote(tip-2000,100),{...quote(tip-2000,200),player_id:435},quote(tip-2000,300,'rebounds')],fingerprint:'pre'}])
 const frames=await data.getNbaMarketFrames(123,'points',434);assert.equal(frames.length,1);assert.equal(frames[0].props.length,1);assert.equal(frames[0].props[0].player_id,434)
 assert.deepEqual(h.calls.at(-1)?.args,{p_game_id:123,p_mode:'pregame',p_feed:'props',p_tipoff:new Date(tip).toISOString(),p_selection:'history',p_market:'points',p_player_id:434,p_as_of:null})
})

test('latest context reads one exact as-of frame without persisting timestamp-specific caches',async()=>{
 const h=await fixture(),asOf=new Date(tip-1000).toISOString()
 const frame={captured_at:new Date(tip-2000).toISOString(),quotes:[quote(tip-3000,120)],fingerprint:'latest'}
 h.set([frame]);assert.deepEqual(await h.phase.getNbaPhaseFrames(game,'pregame','props',{selection:'latest',asOf}),[frame])
 assert.equal(h.calls[0].args.p_selection,'latest');assert.equal(h.calls[0].args.p_as_of,asOf);assert.equal(h.keys.length,0)
 h.set([{...frame,captured_at:new Date(tip-500).toISOString()}])
 await assert.rejects(()=>h.phase.getNbaPhaseFrames(game,'pregame','props',{selection:'latest',asOf}),/history cutoff/)
 h.set([frame,frame]);await assert.rejects(()=>h.phase.getNbaPhaseFrames(game,'pregame','props',{selection:'latest',asOf}),/history unavailable/)
})

test('cross-market reads only opening/latest frames and keeps a withdrawn empty latest capture',async()=>{
 const h=await fixture(),first={captured_at:new Date(tip-3000).toISOString(),quotes:[quote(tip-4000,120)],fingerprint:'first'},last={captured_at:new Date(tip-1000).toISOString(),quotes:[],fingerprint:'withdrawn'}
 h.set([first,last]);assert.deepEqual(await h.phase.getNbaPhaseFrames(game,'pregame','props',{selection:'edges'}),[first,last])
 assert.equal(h.calls[0].args.p_selection,'edges');assert.match(h.keys[0],/:edges:all:all$/)
 h.set([first,first,last]);await assert.rejects(()=>h.phase.getNbaPhaseFrames(game,'pregame','props',{selection:'edges'}),/history unavailable/)
})
test('opening history cannot use a pregame first observation as the live baseline',async()=>{
 const h=await fixture();const data=await compiled<typeof import('../src/lib/nbaOddsHistoryData.ts')>('../src/lib/nbaOddsHistoryData.ts',{'server-only':{},'./supabase/admin':{createAdminClient:()=>h.admin},'./nbaSharedCache':h.cache,'./nbaFirstBasketMarkets':firstMarkets,'./nbaOddsPhaseData':h.phase,'./nbaOddsMode':h.modes,'./nbaPaintData':{getPaintGame:async()=>game}},h.Clock)
 const opening={game_id:123,player_id:434,vendor:'fanduel',market:'points',market_type:'milestone',line:15,side:'over'}
 h.set([{...opening,odds:1000,observed_at:new Date(tip-1000).toISOString()},{...opening,odds:-600,observed_at:new Date(tip+1000).toISOString()}])
 assert.deepEqual((await data.getNbaQuoteOpenings(123)).map(row=>row.odds),[1000]);assert.deepEqual((await data.getNbaQuoteOpenings(123,'live')).map(row=>row.odds),[-600])
})
async function captureFixture(mode:'pregame'|'live'|'unknown',options:{empty?:boolean;stale?:boolean;cross?:boolean}={}){
 const h=await fixture();h.time(mode==='pregame'?tip-60000:tip+60000)
 const current={...game,status_state:mode==='live'?'in_progress':'scheduled',period:mode==='live'?1:0} as paint.PaintGame
 const at=mode==='pregame'||options.stale?tip-120000:tip+1000
 const props=options.empty?[]:[quote(at,mode==='live'?-600:1000)],first=options.empty?[]:[quote(at,1000,'first_score')]
 const calls:{name:string;args:Record<string,unknown>}[]=[],keys:string[]=[]
 const route=await compiled<{GET:(request:Request)=>Promise<Response>}>('../src/app/api/cron/nba-market-capture/route.ts',{
 'node:crypto':crypto,'next/server':{NextResponse:{json:Response.json}},'@/lib/cron-auth':{requireCronAuth:()=>null},'@/lib/pipelineHealth':{withPipelineHealth:(_name:string,run:unknown)=>run},
 '@/lib/supabase/admin':{createAdminClient:()=>({from:()=>({select:()=>({in:async()=>({data:[],error:null})})}),rpc:(name:string,args:Record<string,unknown>)=>({abortSignal:async()=>{calls.push({name,args});return{data:true,error:null}}})})},
 '@/lib/nbaPaintData':{getPaintSchedule:async()=>({games:[current]}),getPaintGame:async()=>current,getPaintProps:async()=>{if(options.cross)h.time(tip+1000);return props},getPaintGameOdds:async()=>[]},
 '@/lib/nbaPaint':{nbaToday:()=>game.date},'@/lib/nbaOddsMode':h.modes,'@/lib/nbaMovement':movement,'@/lib/nbaOddsHistory':history,
 '@/lib/nbaSharedCache':{nbaSharedCache:async(key:string,_ttl:number,_stale:number,load:()=>Promise<unknown>)=>{keys.push(key);return{value:await load()}}},
 '@/lib/nbaFirstBasketOddsData':{getNbaFirstEvents:async()=>[],getNbaFirstOdds:async()=>({eventMatched:true,unmatched:0,rows:first.map(offer=>({offer}))})},
 },h.Clock)
 const response=await route.GET(new Request('https://test/capture'));return{calls,keys,response,body:await response.json()}
}
test('the normal NBA collector writes pregame and live into separate tapes and attempt keys',async()=>{
 for(const mode of ['pregame','live'] as const){const run=await captureFixture(mode);assert.equal(run.response.status,200);assert.equal(run.calls.length,3);assert.ok(run.calls.every(call=>call.name==='record_nba_phase_capture'&&call.args.p_mode===mode));assert.deepEqual(new Set(run.calls.map(call=>call.args.p_feed)),new Set(['props','game','first']));assert.ok(run.keys.includes('market-attempt:v4:'+mode+':123'));assert.ok(run.keys.includes('first-basket-attempt:v2:'+mode+':123'))}
})
test('live stale-only feeds cannot become empty withdrawals while successful empty feeds remain captures',async()=>{
 const stale=await captureFixture('live',{stale:true});assert.deepEqual(stale.calls.map(call=>call.args.p_feed),['game']);assert.equal(stale.body.firstBasket.deferred,1)
 const empty=await captureFixture('live',{empty:true});assert.equal(empty.calls.length,3);assert.ok(empty.calls.every(call=>JSON.stringify(call.args.p_quotes)==='[]'))
})
test('a response crossing tipoff and an unconfirmed elapsed game cannot create a pregame or live capture',async()=>{
 const crossed=await captureFixture('pregame',{cross:true});assert.equal(crossed.calls.length,0)
 const unknown=await captureFixture('unknown');assert.equal(unknown.calls.length,0);assert.equal(unknown.keys.length,0)
})


test('a later provider schedule cannot reopen a stored cutoff or discard valid live history between the two times',async()=>{
 const h=await fixture(),later={...game,datetime:new Date(tip+3600000).toISOString(),status_state:'in_progress',period:1} as paint.PaintGame
 const calls:{name:string;args:Record<string,unknown>}[]=[],policies:{key:string;ttl:number;stale:number}[]=[]
 const pre=quote(tip-1000,1000),live=quote(tip+1000,-600),first=quote(tip+1000,600,'first_score')
 const admin={rpc:(name:string,args:Record<string,unknown>)=>({abortSignal:async()=>{
   calls.push({name,args})
   if(name==='nba_phase_cutoff')return{data:new Date(tip).toISOString(),error:null}
   assert.equal(args.p_tipoff,new Date(tip).toISOString())
   if(name==='read_nba_phase_snapshot')return{data:[{feed:'props',captured_at:new Date(args.p_mode==='live'?tip+2000:tip-500).toISOString(),quotes:[args.p_mode==='live'?live:pre],fingerprint:'frame'}],error:null}
   if(name==='read_nba_phase_frames_scoped')return{data:[{captured_at:new Date(tip+2000).toISOString(),quotes:[live],fingerprint:'live'}],error:null}
   if(name==='read_nba_phase_openings')return{data:[{game_id:123,player_id:434,vendor:'fanduel',market:'points',market_type:'milestone',line:15,side:'over',odds:-600,observed_at:new Date(tip+1000).toISOString()}],error:null}
   assert.equal(name,'read_nba_phase_first_state')
   return{data:{captures:1,frames:[{captured_at:new Date(tip+2000).toISOString(),props:[first]}]},error:null}
 }})}
 const cache={nbaSharedCache:async(key:string,ttl:number,stale:number,load:()=>Promise<unknown>)=>{policies.push({key,ttl,stale});return{value:await load()}}}
 const clock=await compiled<typeof import('../src/lib/nbaOddsClockData.ts')>('../src/lib/nbaOddsClockData.ts',{'server-only':{},'./supabase/admin':{createAdminClient:()=>admin},'./nbaSharedCache':cache,'./nbaOddsMode':h.modes},h.Clock)
 const canonical=await clock.getNbaOddsGame(later)
 assert.equal(canonical.datetime,new Date(tip).toISOString());assert.notEqual(canonical,later);assert.equal(later.datetime,new Date(tip+3600000).toISOString());assert.equal(h.modes.nbaPregameOpen(canonical),false);assert.equal(h.modes.nbaLiveOpen(canonical),true)
 const imports={'server-only':{},'./supabase/admin':{createAdminClient:()=>admin},'./nbaSharedCache':cache,'./nbaOddsMode':h.modes,'./nbaOddsClockData':clock}
 const phase=await compiled<typeof import('../src/lib/nbaOddsPhaseData.ts')>('../src/lib/nbaOddsPhaseData.ts',imports,h.Clock)
 assert.equal((await phase.getNbaPhaseSnapshot(later)).props[0].market.odds,1000)
 assert.equal((await phase.getNbaPhaseSnapshot(later,'live')).props[0].market.odds,-600)
 assert.equal((await phase.getNbaPhaseFrames(later,'live'))[0].quotes.length,1)
 const data=await compiled<typeof import('../src/lib/nbaOddsHistoryData.ts')>('../src/lib/nbaOddsHistoryData.ts',{...imports,'./nbaFirstBasketMarkets':firstMarkets,'./nbaOddsPhaseData':phase,'./nbaPaintData':{getPaintGame:async()=>later}},h.Clock)
 assert.deepEqual((await data.getNbaQuoteOpenings(123,'live')).map(row=>row.odds),[-600])
 const firstData=await compiled<typeof import('../src/lib/nbaFirstBasketHistoryData.ts')>('../src/lib/nbaFirstBasketHistoryData.ts',{...imports,'./nbaOddsHistoryData':data,'./nbaFirstBasketMovement':{},'./nbaOddsPhaseData':phase,'./nbaPaintData':{getPaintGame:async()=>later}},h.Clock)
 assert.equal((await firstData.getNbaFirstBasketState(123,'live')).frames[0].props[0].market.over_odds,600)
 const clockPolicies=policies.filter(row=>row.key.startsWith('odds-clock:'))
 assert.ok(clockPolicies.every(row=>row.ttl===15&&row.stale===0&&row.key.includes(later.datetime!)))
 assert.ok(calls.some(row=>row.name==='read_nba_phase_first_state'))
})

test('unverified or invalid canonical clocks fail closed before any archive read',async()=>{
 const h=await fixture();let result:unknown=null,reads=0
 const clock=await compiled<typeof import('../src/lib/nbaOddsClockData.ts')>('../src/lib/nbaOddsClockData.ts',{'server-only':{},'./supabase/admin':{createAdminClient:()=>({rpc:()=>({abortSignal:async()=>{reads++;return{data:result,error:null}}})})},'./nbaSharedCache':h.cache,'./nbaOddsMode':h.modes},h.Clock)
 await assert.rejects(()=>clock.getNbaOddsGame({...game,datetime:null,status:'Unknown'}),/Verified NBA phase/);assert.equal(reads,0)
 for(result of [null,'invalid',new Date(tip+1000).toISOString()])await assert.rejects(()=>clock.getNbaOddsGame(game),/Verified NBA phase unavailable/)
 assert.equal(reads,3)
})
