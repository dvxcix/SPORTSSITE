import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import * as control from '../src/lib/nbaPublicCaptureControl.ts'
import * as mode from '../src/lib/nbaOddsMode.ts'
import type { PaintGame } from '../src/lib/nbaPaint.ts'

const HOUR=3_600_000, tip=Date.parse('2026-11-01T23:00:00Z')
const game={id:123,date:'2026-11-01',datetime:new Date(tip).toISOString(),status:'Scheduled',status_state:'scheduled',period:0,visitor_team:{full_name:'Boston Celtics'},home_team:{full_name:'Detroit Pistons'}} as PaintGame
const parser='nba-public-fixture'
test('NBA checkpoints require only the latest due slot and retain original observations',()=>{
  assert.equal(control.nbaPublicCaptureDecision(game,null,undefined,tip-25*HOUR).due,false)
  for(const hours of [24,10,4,1]){
    const now=tip-hours*HOUR, observation=new Date(now+1000).toISOString()
    assert.equal(control.nbaPublicCaptureDecision(game,null,undefined,now).slotHours,hours)
    const state=control.nbaNextPublicControl(undefined,'captured',now+2000,tip,observation)
    assert.equal(state.successAt,observation)
    assert.equal(control.nbaPublicCaptureDecision(game,null,state,now+10*60_000).due,false)
  }
  const late=control.nbaNextPublicControl(undefined,'captured',tip-30*60_000,tip,new Date(tip-31*60_000).toISOString())
  assert.equal(control.nbaPublicCaptureDecision(game,null,late,tip-20*60_000).due,false,'missed checkpoints do not become queued captures')
  assert.equal(control.nbaPublicCaptureDecision(game,null,undefined,tip).due,false)
  assert.equal(control.nbaPublicCaptureDecision({...game,period:1},null,undefined,tip-HOUR).due,false)
})
test('unavailable, partial and interrupted attempts have capped persistent backoff',()=>{
  let previous:control.NbaPublicControl|undefined
  for(const [index,minutes] of [60,120,240,240].entries()){
    const now=tip-20*HOUR+index*1000
    previous=control.nbaNextPublicControl(previous,'unavailable',now,tip)
    assert.equal(Date.parse(previous.nextAttemptAt)-now,minutes*60_000)
  }
  const old=control.nbaNextPublicControl(undefined,'captured',tip-5*HOUR,tip,new Date(tip-5*HOUR).toISOString())
  const partial=control.nbaNextPublicControl(old,'partial',tip-3*HOUR,tip)
  assert.equal(partial.successAt,old.successAt,'partial counts cannot satisfy a later checkpoint')
  assert.equal(control.nbaPublicCaptureDecision(game,null,partial,tip-3*HOUR+10*60_000).due,false)
  assert.equal(control.nbaPublicCaptureDecision(game,null,partial,tip-2.5*HOUR).due,true)
  assert.equal(Date.parse(control.nbaNextPublicControl(undefined,'running',tip-3*HOUR,tip).nextAttemptAt),tip-2.5*HOUR)
  assert.equal(Date.parse(control.nbaNextPublicControl(undefined,'auth',tip-3*HOUR).nextAttemptAt),tip-HOUR)
})
test('control keys isolate canonical games/parser versions and hash the private context',()=>{
  assert.notEqual(control.nbaPublicGameControlKey(game,'v1'),control.nbaPublicGameControlKey(game,'v2'))
  assert.notEqual(control.nbaPublicGameControlKey(game,parser),control.nbaPublicGameControlKey({...game,datetime:new Date(tip-1000).toISOString()},parser))
  const key=control.nbaPublicContextControlKey('private-context-identity')
  assert.match(key,/^public-context-control:v1:[a-f0-9]{64}$/)
  assert.doesNotMatch(key,/private-context-identity/)
  assert.notEqual(key,control.nbaPublicContextControlKey('another-context'))
})

async function compiled<T>(file:string,imports:Record<string,unknown>,globals:Record<string,unknown>={}):Promise<T>{
  const source=await readFile(new URL(file,import.meta.url),'utf8')
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
  const fixture={exports:{}}
  new Function('require','module','exports',...Object.keys(globals),code)((id:string)=>{assert.ok(id in imports,id);return imports[id]},fixture,fixture.exports,...Object.values(globals))
  return fixture.exports as T
}
type Row={key:string;payload:unknown;fetched_at?:string}
async function fixture(){
  let now=tip-8*HOUR, opens=0,claims=0,releases=0,reads=0,writes=0,failRead=false,failWrite=false,failRelease=false,auth=false,startupFails=false,startupError:Error|undefined,underLease:undefined|(()=>void)
  const rows=new Map<string,Row>()
  const query=()=>{
    let keys:string[]=[],write:Row|undefined
    const answer=async()=>{
      if(write){writes++;if(failWrite)return{data:null,error:{message:'fixture'}};rows.set(write.key,write);return{data:[{key:write.key}],error:null}}
      reads++;if(failRead)return{data:null,error:{message:'fixture'}}
      return{data:[...rows.values()].filter(row=>keys.includes(row.key)),error:null}
    }
    const q={select:()=>q,in:(_field:string,value:string[])=>{keys=value;return q},limit:()=>q,upsert:(value:Row)=>{write=value;return q},abortSignal:(signal:AbortSignal)=>{assert.ok(signal instanceof AbortSignal);return answer()},then:(resolve:unknown,reject:unknown)=>answer().then(resolve as never,reject as never)}
    return q
  }
  const admin={from:(table:string)=>{assert.equal(table,'nba_source_cache');return query()}}
  const data=await compiled<typeof import('../src/lib/nbaPublicCaptureControlData.ts')>('../src/lib/nbaPublicCaptureControlData.ts',{'server-only':{},'./supabase/admin':{createAdminClient:()=>admin},'./nbaPublicCaptureControl':control})
  const budget=await compiled<typeof import('../src/lib/nbaBrowserBudget.ts')>('../src/lib/nbaBrowserBudget.ts',{'server-only':{},'node:crypto':{},'./supabase/admin':{}})
  class Clock extends Date{constructor(value:string|number=now){super(value)}static now(){return now}}
  const invoke=async(params='')=>{
    const route=await compiled<{GET:(request:Request)=>Promise<Response>}>('../src/app/api/cron/poll-pikkit-nba-picks/route.ts',{
      'next/server':{NextResponse:{json:Response.json}},'@/lib/cron-auth':{requireBrowserbaseCronAuth:()=>null},'@/lib/pipelineHealth':{withPipelineHealth:(_name:string,run:unknown)=>run},
      '@/lib/nbaPaintData':{getPaintSchedule:async()=>({games:[game]})},'@/lib/nbaOddsClockData':{getNbaOddsGame:async(g:PaintGame)=>g},'@/lib/nbaPaint':{nbaToday:()=>game.date},'@/lib/nbaOddsMode':mode,
      '@/lib/nbaPublicCaptureControl':control,'@/lib/nbaPublicCaptureControlData':data,'@/lib/supabase/admin':{createAdminClient:()=>admin},
      '@/lib/nbaBrowserBudget':budget,
      '@/lib/pikkitBrowserLease':{acquirePikkitBrowserLease:async()=>{claims++;underLease?.();return{release:async()=>{releases++;return !failRelease}}}},
      '@/lib/browserbase':{openPikkitSession:async()=>{if(startupError)throw startupError;opens++;if(startupFails)throw Error('startup fixture');return{page:{setDefaultTimeout(){},setDefaultNavigationTimeout(){},on(){},off(){},goto:async()=>{},url:()=>auth?'https://app.pikkit.com/login':'https://app.pikkit.com/leagues/nba',waitForFunction:async()=>{},waitForTimeout:async()=>{},evaluate:async(_fn:unknown,arg?:unknown)=>arg?{bodyLength:0,signIn:false,awayTeamMentioned:false,selectCount:0,eventCount:0}:false},close:async()=>{}}}},
      '@/lib/scrapers/gameMatch':{findAndClickPikkitGame:async()=>false},'@/lib/scrapers/pikkitLeagueDate':{observePikkitLeagueDates:()=>({selectDate:async()=>true,dispose(){}})},'@/lib/scrapers/nbaPikkitScraper':{},'@/lib/nbaPublicServer':{},'@/lib/nbaPublic':{NBA_PUBLIC_VERSION:parser},
      '@/lib/nbaPublicEventIdentity':{nbaPublicTeamLabel:(team:{full_name:string})=>team.full_name,nbaVerifiedPublicEvent:()=>null},'@/lib/nbaSharedCache':{},
    },{Date:Clock,process:{env:{PIKKIT_CONTEXT_ID:'private-context-identity'}}})
    const response=await route.GET(new Request(`https://fixture.test/capture${params}`))
    return{status:response.status,body:await response.json()}
  }
  return{rows,invoke,data,metrics:()=>({opens,claims,releases,reads,writes}),advance:(ms:number)=>{now+=ms},clock:()=>now,setReadFailure:(value:boolean)=>{failRead=value},setWriteFailure:(value:boolean)=>{failWrite=value},setAuth:()=>{auth=true},setStartupFailure:()=>{startupFails=true},setBudgetFailure:(code:import('../src/lib/nbaBrowserBudget.ts').NbaBrowserBudgetCode)=>{startupError=new budget.NbaBrowserBudgetError(code)},setSpoofedBudgetFailure:()=>{startupError=Object.assign(new Error('provider secret'),{name:'NbaBrowserBudgetError',code:'spend-limit'})},setReleaseFailure:()=>{failRelease=true},onLease:(fn:()=>void)=>{underLease=fn}}
}
test('unlisted game is skipped across separate route instances until its persisted cooldown expires',async()=>{
  const f=await fixture()
  assert.equal((await f.invoke()).status,425);assert.equal(f.metrics().opens,1)
  const state=f.rows.get(control.nbaPublicGameControlKey(game,parser))!.payload as control.NbaPublicControl
  assert.equal(state.outcome,'unavailable');assert.equal(state.successAt,null)
  f.advance(10*60_000)
  assert.equal((await f.invoke('?game=123&force=1')).body.browserSessions,0);assert.equal(f.metrics().opens,1)
  f.advance(50*60_000)
  await f.invoke();assert.equal(f.metrics().opens,2)
  const next=f.rows.get(control.nbaPublicGameControlKey(game,parser))!.payload as control.NbaPublicControl
  assert.equal(next.failures,2);assert.equal(Date.parse(next.nextAttemptAt)-f.clock(),120*60_000)
})

test('bounded game batches reject ambiguous/invalid selections before a browser lease',async()=>{
  for(const query of ['?game=123&games=123','?games=','?games=123,123','?games=123,NaN','?games='+Array.from({length:13},(_,i)=>i+1).join(',')]){
    const f=await fixture()
    assert.equal((await f.invoke(query)).status,400)
    assert.equal(f.metrics().claims,0)
    assert.equal(f.metrics().opens,0)
  }
  const excluded=await fixture()
  assert.equal((await excluded.invoke('?games=999,1000')).body.browserSessions,0)
  assert.equal(excluded.metrics().opens,0)
  const included=await fixture()
  await included.invoke('?games=123,999')
  assert.equal(included.metrics().opens,1)
})

test('admin batch size and identifiers stay bounded and canonical',()=>{
  assert.deepEqual(control.nbaPublicCaptureSelection([123,456]),[123,456])
  for(const value of [null,{},[],['123'],[0],[-1],[1.5],[123,123],Array.from({length:13},(_,i)=>i+1)])assert.equal(control.nbaPublicCaptureSelection(value),null)
})
test('confirmed authentication failure trips the context circuit before another game or forced request can launch',async()=>{
  const f=await fixture();f.setAuth()
  assert.equal((await f.invoke()).status,503);assert.equal(f.metrics().opens,1)
  f.rows.delete(control.nbaPublicGameControlKey(game,parser))
  f.advance(60*60_000)
  const result=await f.invoke('?game=123&force=1')
  assert.equal(result.status,425);assert.equal(result.body.reason,'NBA public authentication cooldown');assert.equal(f.metrics().opens,1);assert.equal(f.metrics().claims,1)
  assert.doesNotMatch(JSON.stringify([...f.rows]),/private-context-identity/)
})
test('startup failures persist a cooldown without any game result',async()=>{
  const f=await fixture();f.setStartupFailure()
  assert.equal((await f.invoke()).status,503);assert.equal(f.metrics().releases,0);f.advance(10*60_000)
  assert.equal((await f.invoke()).status,425);assert.equal(f.metrics().opens,1)
})
test('typed budget denials defer without a browser, false authentication cooldown or retained context lease',async()=>{
  for(const code of ['paused','spend-limit','quota-limit','usage-unavailable','reservation-unavailable'] as const){
    const f=await fixture();f.setBudgetFailure(code)
    const result=await f.invoke()
    assert.equal(result.status,425);assert.equal(result.body.stage,'deferred');assert.equal(result.body.budgetCode,code)
    assert.equal(result.body.browserSessions,0);assert.equal(result.body.attempted,0);assert.equal(result.body.failed,0)
    assert.equal(f.metrics().opens,0);assert.equal(f.metrics().releases,1)
    const state=f.rows.get(control.nbaPublicContextControlKey('private-context-identity'))!.payload as control.NbaPublicControl
    assert.equal(state.outcome,'ready');assert.equal(Date.parse(state.nextAttemptAt),f.clock());assert.equal(state.successAt,null)
    assert.equal(f.rows.has(control.nbaPublicGameControlKey(game,parser)),false)
    assert.doesNotMatch(JSON.stringify(result.body),/authentication|secret|https:/i)
  }
})
test('only the actual budget class proves no browser; spoofed errors retain startup safety',async()=>{
  const f=await fixture();f.setSpoofedBudgetFailure()
  const result=await f.invoke()
  assert.equal(result.status,503);assert.equal(f.metrics().releases,0)
  assert.doesNotMatch(JSON.stringify(result.body),/provider secret/)
  const state=f.rows.get(control.nbaPublicContextControlKey('private-context-identity'))!.payload as control.NbaPublicControl
  assert.equal(state.outcome,'failed');assert.equal(Date.parse(state.nextAttemptAt)-f.clock(),30*60_000)
})
test('a typed budget denial cannot hide a failed lease release',async()=>{
  const f=await fixture();f.setBudgetFailure('spend-limit');f.setReleaseFailure()
  const result=await f.invoke()
  assert.equal(result.status,503);assert.equal(result.body.browserSessions,0)
  assert.ok(result.body.cleanupIssues.some((issue:string)=>issue.includes('lease release')))
})
test('lease-holder reread prevents duplicate browser launch after another instance satisfies the checkpoint',async()=>{
  const f=await fixture(),key=control.nbaPublicGameControlKey(game,parser)
  f.onLease(()=>f.rows.set(key,{key,payload:control.nbaNextPublicControl(undefined,'captured',f.clock(),tip,new Date(f.clock()).toISOString())}))
  assert.equal((await f.invoke()).body.browserSessions,0);assert.equal(f.metrics().claims,1);assert.equal(f.metrics().releases,1);assert.equal(f.metrics().opens,0)
})
test('failed or malformed state reads and failed startup checkpoint writes fail closed without a browser',async()=>{
  for(const scenario of ['read','malformed','write']){
    const f=await fixture()
    if(scenario==='read')f.setReadFailure(true)
    if(scenario==='write')f.setWriteFailure(true)
    if(scenario==='malformed'){const key=control.nbaPublicContextControlKey('private-context-identity');f.rows.set(key,{key,payload:{}})}
    assert.equal((await f.invoke()).status,503,scenario);assert.equal(f.metrics().opens,0,scenario)
  }
})
test('context state is not cached in memory and verified absence remains eligible',async()=>{
  const f=await fixture(),key=control.nbaPublicContextControlKey('private-context-identity')
  assert.equal((await f.data.readNbaPublicControls([key])).size,0)
  const state=control.nbaNextPublicControl(undefined,'auth',f.clock())
  await f.data.saveNbaPublicControl(key,state)
  assert.deepEqual((await f.data.readNbaPublicControls([key])).get(key),state)
  assert.equal(f.metrics().opens,0)
})
