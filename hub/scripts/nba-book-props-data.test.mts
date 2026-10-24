import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import ts from 'typescript'
import * as modes from '../src/lib/nbaOddsMode.ts'
import * as paint from '../src/lib/nbaPaint.ts'
import {nbaValidOdds} from '../src/lib/nbaOddsHistory.ts'
import type {NbaBookPropFrame,NbaBookPropObservation} from '../src/lib/nbaBookPropsData.ts'

const now=Date.parse('2026-10-24T12:00:00Z'),game={id:123,date:'2026-10-24',datetime:'2026-10-24T23:00:00Z',status:'Scheduled',status_state:'scheduled',period:0} as paint.PaintGame
const quote=(player=434,line=30,at=now-1000):paint.PaintProp=>({id:-5_000_000_000_000-player,game_id:123,player_id:player,vendor:'betmgm',prop_type:'points',line_value:String(line),market:{type:'milestone',odds:400},updated_at:new Date(at).toISOString()})
const frame=(line=30,players=[434],at=now-1000):NbaBookPropFrame=>({gameId:123,book:'betmgm',tipoff:new Date(game.datetime!).toISOString(),contract:{market:'points',type:'milestone',line},observedAt:new Date(at).toISOString(),props:players.map(player=>quote(player,line,at)),complete:true})
type Entry={key:string;payload:unknown;fetched_at?:string;expires_at?:string}
async function harness(){
  const entries=new Map<string,Entry>(),cache=new Map<string,Promise<unknown>>(),calls:{key:string;ttl:number;stale:number}[]=[]
  let clock=now,reads=0,writes=0,readError=false,writeError=false
  class Clock extends Date{constructor(value:string|number=clock){super(value)}static now(){return clock}}
  const reply=(keys:string[])=>({abortSignal:async()=>{reads++;return{data:keys.flatMap(key=>entries.has(key)?[structuredClone(entries.get(key)!)]:[]),error:readError?{message:'private'}:null}}})
  const admin={from:(table:string)=>{assert.equal(table,'nba_source_cache');return{
    select:(columns:string)=>{assert.equal(columns,'key,payload');return{
      in:(column:string,keys:string[])=>{assert.equal(column,'key');return reply(keys)},
      like:(column:string,pattern:string)=>{assert.equal(column,'key');assert.equal(pattern,`book-props:v1:123:${Date.parse(game.datetime!)}:betmgm:%`);return{limit:(limit:number)=>{assert.equal(limit,161);return reply([...entries.keys()].filter(key=>key.startsWith(pattern.slice(0,-1))).slice(0,limit))}}},
    }},
    upsert:(rows:Entry[],options:{onConflict:string})=>{assert.equal(options.onConflict,'key');return{abortSignal:async()=>{writes++;if(!writeError)for(const row of rows)entries.set(row.key,structuredClone(row));return{error:writeError?{message:'private'}:null}}}},
  }}}
  const imports:Record<string,unknown>={'server-only':{},'./supabase/admin':{createAdminClient:()=>admin},'./nbaPaint':paint,'./nbaOddsMode':{...modes,nbaPregameOpen:(g:paint.PaintGame,at=clock)=>modes.nbaPregameOpen(g,at)},'./nbaOddsHistory':{nbaValidOdds},'./nbaSharedCache':{nbaSharedCache:async(key:string,ttl:number,stale:number,load:()=>Promise<unknown>)=>{calls.push({key,ttl,stale});if(!cache.has(key))cache.set(key,load());return{value:await cache.get(key)}}}}
  const source=await readFile(new URL('../src/lib/nbaBookPropsData.ts',import.meta.url),'utf8'),output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,target={exports:{}}
  new Function('require','module','exports','Date','fetch',output)((name:string)=>{assert.ok(name in imports,name);return imports[name]},target,target.exports,Clock,()=>{throw new Error('No member source requests')})
  return{api:target.exports as typeof import('../src/lib/nbaBookPropsData.ts'),entries,calls,time:(at:number)=>{clock=at},errors:(r:boolean,w=false)=>{readError=r;writeError=w},counts:()=>({reads,writes})}
}

test('regular direct frame binds canonical game, exact supported threshold/type/book and every side',async()=>{
  const {api}=await harness();assert.ok(api.nbaValidBookPropFrame(frame(),game));assert.ok(api.nbaValidBookPropFrame({...frame(),complete:false},game))
  for(const invalid of [{...frame(),gameId:124},{...frame(),tipoff:'2026-10-25T23:00:00.000Z'},{...frame(),book:'draftkings'},{...frame(),contract:{market:'first_score',type:'milestone',line:30}},{...frame(),props:[{...quote(),id:1}]},{...frame(),props:[{...quote(),line_value:'30.5'}]},{...frame(),props:[{...quote(),market:{type:'over_under',over_odds:400}}]},{...frame(),props:[{...quote(),market:{type:'milestone',odds:0}}]},{...frame(),props:[quote(),quote()]}])assert.equal(api.nbaValidBookPropFrame(invalid,game),false)
})

test('exact missing30+ joins APIs while other thresholds, sides and games cannot suppress it',async()=>{
  const {api}=await harness(),entries=[{key:api.nbaBookPropKey(game,frame().contract),payload:frame()}]
  const result=api.nbaBookPropsSupplement(game,[quote(434,25)],entries,now)
  assert.equal(result.complete,true);assert.equal(result.props[0].market.odds,400);assert.equal(result.props[0].line_value,'30')
  assert.deepEqual(api.nbaBookPropsSupplement(game,[{...quote(),market:{type:'milestone',odds:450}}],entries,now),{props:[],complete:true})
  for(const primary of [{...quote(),game_id:999},{...quote(),vendor:'draftkings'},{...quote(),market:{type:'over_under' as const,under_odds:400}},{...quote(),market:{type:'milestone' as const,odds:0}}])assert.equal(api.nbaBookPropsSupplement(game,[primary],entries,now).props.length,1)
})

test('partial panel preserves unseen sibling timestamps and never erases another target',async()=>{
  const h=await harness();await h.api.saveNbaBookPropFrames(game,[frame(15,[434,435]),frame(30,[434,435])])
  const newer={...frame(30,[434],now),complete:false,props:[{...quote(434,30,now),market:{type:'milestone' as const,odds:425}}]}
  await h.api.saveNbaBookPropFrames(game,[newer])
  const saved=h.entries.get(h.api.nbaBookPropKey(game,newer.contract))!.payload as NbaBookPropFrame
  assert.equal(saved.complete,false);assert.equal(saved.props.find(p=>p.player_id===435)!.updated_at,new Date(now-1000).toISOString());assert.equal(saved.props.find(p=>p.player_id===434)!.market.odds,425)
  assert.deepEqual(h.entries.get(h.api.nbaBookPropKey(game,frame(15).contract))!.payload,frame(15,[434,435]))
  const result=h.api.nbaBookPropsSupplement(game,[],[...h.entries.values()],now);assert.equal(result.complete,false);assert.equal(result.props.length,4)
})

test('partial double-double Yes preserves the separately observed No price and APIs suppress only an exact side',async()=>{
  const h=await harness(),prior:NbaBookPropFrame={...frame(),contract:{market:'double_double',type:'over_under',line:.5},props:[{...quote(),prop_type:'double_double',line_value:'0.5',market:{type:'over_under',over_odds:250,under_odds:-300}}]}
  await h.api.saveNbaBookPropFrames(game,[prior])
  const yes:paint.PaintProp={...prior.props[0],updated_at:new Date(now).toISOString(),market:{type:'over_under',over_odds:275}}
  await h.api.saveNbaBookPropFrames(game,[{...prior,observedAt:new Date(now).toISOString(),props:[yes],complete:false}])
  const saved=h.entries.get(h.api.nbaBookPropKey(game,prior.contract))!.payload as NbaBookPropFrame
  assert.equal(saved.props.length,2);assert.equal(saved.props.find(prop=>prop.market.under_odds!=null)!.updated_at,prior.observedAt)
  const result=h.api.nbaBookPropsSupplement(game,[{...yes,id:123,market:{type:'over_under',over_odds:280}}],[...h.entries.values()],now)
  assert.equal(result.complete,false);assert.equal(result.props.length,1);assert.deepEqual(result.props[0].market,{type:'over_under',under_odds:-300})
  assert.equal(result.props[0].prop_type,'double_double');assert.equal(result.props[0].line_value,'0.5');assert.equal(result.props[0].updated_at,prior.observedAt)
})

test('stale rows are removed individually even when a partial panel has a fresh attempted timestamp',async()=>{
  const h=await harness(),old=frame(30,[434],now-299_000)
  await h.api.saveNbaBookPropFrames(game,[old]);h.time(now+2000)
  await h.api.saveNbaBookPropFrames(game,[{...frame(30,[435],now+2000),complete:false}])
  const result=h.api.nbaBookPropsSupplement(game,[],[...h.entries.values()],now+2000)
  assert.equal(result.complete,false);assert.deepEqual(result.props.map(p=>p.player_id),[435])
})

test('only complete verified menu discovery clears disappeared thresholds; unknown panels retain incomplete history',async()=>{
  const h=await harness(),prior=[{key:h.api.nbaBookPropKey(game,frame().contract),payload:frame()}]
  const coverage={gameId:123,market:'points',complete:true,observedAt:new Date(now).toISOString(),contracts:['points:milestone:25']}
  const absent=h.api.nbaReconcileBookPropFrames(game,[],[coverage],prior,new Date(now).toISOString())
  assert.equal(absent.failed,0);assert.equal(absent.frames.length,1);assert.equal(absent.frames[0].complete,true);assert.deepEqual(absent.frames[0].props,[])
  await h.api.saveNbaBookPropFrames(game,absent.frames,prior);assert.deepEqual(h.api.nbaBookPropsSupplement(game,[],[...h.entries.values()],now),{props:[],complete:true})
  for(const entries of [[],[{...coverage,complete:false}],[{...coverage,contracts:['points:milestone:30']}]]){
    const unknown=h.api.nbaReconcileBookPropFrames(game,[],entries,prior,new Date(now).toISOString());assert.equal(unknown.failed,1);assert.equal(unknown.frames[0].complete,false)
  }
})

test('valid sibling panels persist despite partial/duplicate observations, with honest completeness',async()=>{
  const {api}=await harness(),observation=(line:number):NbaBookPropObservation=>({gameId:123,contractKey:`points:milestone:${line}`,market:'points',complete:true,status:'captured',observedAt:new Date(now).toISOString(),props:[quote(434,line,now)],unmatched:0})
  const result=api.nbaReconcileBookPropFrames(game,[observation(15),{...observation(30),complete:false,unmatched:1},observation(35),observation(35)],[],[],new Date(now).toISOString())
  assert.equal(result.failed,2);assert.deepEqual(result.frames.map(f=>f.contract.line),[15,30]);assert.equal(result.frames[1].complete,false)
})

test('verified locked outcomes retire the exact panel while a missing panel remains incomplete from its first attempt',async()=>{
  const h=await harness(),prior=[{key:h.api.nbaBookPropKey(game,frame().contract),payload:frame()}]
  const locked:NbaBookPropObservation={gameId:123,contractKey:'points:milestone:30',market:'points',complete:true,status:'captured',observedAt:new Date(now).toISOString(),props:[],unmatched:0}
  const result=h.api.nbaReconcileBookPropFrames(game,[locked],[],prior,new Date(now).toISOString())
  assert.equal(result.failed,0);assert.deepEqual(result.frames[0].props,[]);assert.equal(result.frames[0].complete,true)
  await h.api.saveNbaBookPropFrames(game,result.frames,prior)
  assert.deepEqual(h.api.nbaBookPropsSupplement(game,[],[...h.entries.values()],now),{props:[],complete:true})
  for(const status of ['partial','unavailable','deadline','error']){
    const missing=h.api.nbaReconcileBookPropFrames(game,[{...locked,status,complete:false,observedAt:null}],[],[],new Date(now).toISOString())
    assert.equal(missing.failed,1);assert.equal(missing.frames.length,1);assert.equal(missing.frames[0].complete,false);assert.deepEqual(missing.frames[0].props,[])
    assert.equal(h.api.nbaBookPropsSupplement(game,[],[{key:h.api.nbaBookPropKey(game,missing.frames[0].contract),payload:missing.frames[0]}],now).complete,false)
  }
})

test('shared member reads remain bounded/cache-only and recheck row expiry without new source requests',async()=>{
  const h=await harness();await h.api.saveNbaBookPropFrames(game,[frame()]);const results=await Promise.all(Array.from({length:6000},()=>h.api.getNbaBookPropsSupplement(game,[])))
  assert.ok(results.every(result=>result.props[0].market.odds===400));assert.equal(h.counts().reads,2);assert.ok(h.calls.every(call=>call.ttl===10&&call.stale===0))
  h.time(now+300_000);const expired=await h.api.getNbaBookPropsSupplement(game,[]);assert.equal(expired.complete,false);assert.equal(expired.props.length,0);assert.equal(h.counts().reads,2)
})

test('invalid/older/post-tip writes and database failures cannot become successful refreshed observations',async()=>{
  const h=await harness();await h.api.saveNbaBookPropFrames(game,[frame(30,[434],now)])
  await assert.rejects(h.api.saveNbaBookPropFrames(game,[frame(30,[434],now-1000)]));assert.equal(h.counts().writes,1)
  await assert.rejects(h.api.saveNbaBookPropFrames(game,[frame(30,[434],now+1)]));assert.equal(h.counts().writes,1)
  h.errors(true);await assert.rejects(h.api.getNbaBookPropEntries(game,true),{message:'NBA book observations unavailable'})
  h.errors(false,true);await assert.rejects(h.api.saveNbaBookPropFrames(game,[frame(30,[434],now)]),{message:'NBA book observations could not be saved'})
  h.time(Date.parse(game.datetime!));await assert.rejects(h.api.saveNbaBookPropFrames(game,[frame()]));assert.deepEqual(await h.api.getNbaBookPropsSupplement(game,[]),{props:[],complete:true})
})
