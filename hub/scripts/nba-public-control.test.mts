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
  for(const hours of [24,12,4,1]){
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
test('nearest tips are captured first; equal-tip failures rotate without starving later attempts',()=>{
  const near={...game,id:1},later={...game,id:2,datetime:new Date(tip+HOUR).toISOString()},same={...game,id:3}
  const now=tip-4*HOUR, states=new Map<string,control.NbaPublicControl>()
  states.set(control.nbaPublicGameControlKey(near,parser),control.nbaNextPublicControl(undefined,'captured',now-3*HOUR,tip,new Date(now-3*HOUR).toISOString()))
  states.set(control.nbaPublicGameControlKey(same,parser),control.nbaNextPublicControl(undefined,'failed',now-HOUR,tip))
  const sorted=control.nbaPublicPrioritize([later,same,near],states,parser,()=>new Date(0).toISOString())
  assert.deepEqual(sorted.map(g=>g.id),[1,3,2])
  assert.equal(control.nbaPublicCaptureDecision(near,null,states.get(control.nbaPublicGameControlKey(near,parser)),now).due,true)
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
test('repeated public failures stop spending browsers until the next game checkpoint',()=>{
  const at=tip-12*HOUR
  const first=control.nbaNextPublicControl(undefined,'unavailable',at,tip)
  assert.equal(control.nbaPublicCaptureDecision(game,null,first,at+HOUR).due,true)
  const second=control.nbaNextPublicControl(first,'unavailable',at+HOUR,tip)
  assert.equal(control.nbaPublicCaptureDecision(game,null,second,at+4*HOUR).reason,'checkpoint-attempt-limit')
  assert.equal(control.nbaPublicCaptureDecision(game,null,second,tip-4*HOUR).due,true)
  assert.equal(control.nbaPublicCaptureDecision(game,null,second,tip).due,false)
  assert.equal(second.successAt,null)
})
test('public attempts reset at each checkpoint despite cumulative failure backoff',()=>{
  const firstAt=tip-24*HOUR
  const first=control.nbaNextPublicControl(undefined,'failed',firstAt,tip)
  const second=control.nbaNextPublicControl(first,'failed',firstAt+HOUR,tip)
  assert.equal(second.checkpointAttempts,2)
  const nextAt=tip-4*HOUR
  assert.equal(control.nbaPublicCaptureDecision(game,null,second,nextAt).due,true)
  const third=control.nbaNextPublicControl(second,'failed',nextAt,tip)
  assert.equal(third.checkpointAt,nextAt)
  assert.equal(third.checkpointAttempts,1)
  assert.equal(control.nbaPublicCaptureDecision(game,null,third,nextAt+2*HOUR).due,true)
  const fourth=control.nbaNextPublicControl(third,'failed',nextAt+2*HOUR,tip)
  assert.equal(fourth.checkpointAttempts,2)
  assert.equal(control.nbaPublicCaptureDecision(game,null,fourth,tip).due,false)
})
test('legacy public controls without checkpoint fields remain valid and conservative',()=>{
  const at=tip-12*HOUR
  const legacy={version:1 as const,outcome:'failed' as const,attemptedAt:new Date(at).toISOString(),nextAttemptAt:new Date(at).toISOString(),failures:2,successAt:null}
  assert.ok(control.nbaValidPublicControl(legacy))
  assert.equal(control.nbaPublicCaptureDecision(game,null,legacy,at+HOUR).reason,'checkpoint-attempt-limit')
  const nextAt=tip-4*HOUR
  assert.equal(control.nbaPublicCaptureDecision(game,null,legacy,nextAt).due,true)
  const next=control.nbaNextPublicControl(legacy,'failed',nextAt,tip)
  assert.equal(next.checkpointAt,nextAt)
  assert.equal(next.checkpointAttempts,1)
})
test('a prior 12-hour public checkpoint remains valid without a redundant retry',()=>{
  const at=tip-12*HOUR
  const prior={version:1 as const,outcome:'failed' as const,attemptedAt:new Date(at).toISOString(),nextAttemptAt:new Date(at).toISOString(),failures:2,successAt:null,checkpointAt:at,checkpointAttempts:2}
  assert.ok(control.nbaValidPublicControl(prior))
  assert.equal(control.nbaPublicCaptureDecision(game,null,prior,at+HOUR).reason,'checkpoint-attempt-limit')
  assert.equal(control.nbaPublicCaptureDecision(game,null,prior,tip-4*HOUR).due,true)
})
test('the 12-hour checkpoint refreshes day-before captures but does not replay earlier slots',()=>{
  const at=tip-24*HOUR+60_000, prior=control.nbaNextPublicControl(undefined,'captured',at,tip,new Date(at).toISOString())
  assert.equal(control.nbaPublicCaptureDecision(game,null,prior,tip-12*HOUR-1).due,false)
  assert.equal(control.nbaPublicCaptureDecision(game,null,prior,tip-12*HOUR).slotHours,12)
  assert.equal(control.nbaPublicCaptureDecision(game,null,prior,tip-12*HOUR).due,true)
  const refreshed=control.nbaNextPublicControl(prior,'captured',tip-12*HOUR+1000,tip,new Date(tip-12*HOUR+1000).toISOString())
  assert.equal(control.nbaPublicCaptureDecision(game,null,refreshed,tip-8*HOUR).due,false)
  assert.equal(control.nbaPublicCaptureDecision(game,null,refreshed,tip-4*HOUR).due,true)
  assert.equal(control.nbaPublicCaptureDecision(game,null,refreshed,tip-HOUR).slotHours,1)
})
test('overdue intermediate waits for near four-hour only with a prior successful baseline and no retry',()=>{
  const at=tip-24*HOUR+60_000, prior=control.nbaNextPublicControl(undefined,'captured',at,tip,new Date(at).toISOString())
  assert.equal(control.nbaPublicCaptureDecision(game,null,prior,tip-5*HOUR-1).due,true)
  assert.equal(control.nbaPublicCaptureDecision(game,null,prior,tip-5*HOUR).reason,'next-checkpoint-near')
  assert.equal(control.nbaPublicCaptureDecision(game,null,prior,tip-4*HOUR-1).due,false)
  assert.equal(control.nbaPublicCaptureDecision(game,null,prior,tip-4*HOUR).due,true)
  assert.equal(control.nbaPublicCaptureDecision(game,null,undefined,tip-4.5*HOUR).due,true,'missing baseline')
  const failAt=tip-5*HOUR-60_000, failed=control.nbaNextPublicControl(prior,'failed',failAt,tip)
  assert.equal(control.nbaPublicCaptureDecision(game,null,failed,failAt+31*60_000).due,true,'retry already begun')
  assert.equal(control.nbaPublicCaptureDecision(game,null,prior,tip).due,false)
})
test('public attempts crossing a checkpoint keep their actual start slot and observation time',()=>{
  const start=tip-4*HOUR-60_000,finish=tip-4*HOUR+60_000
  const failure=control.nbaNextPublicControl(undefined,'failed',finish,tip,undefined,start)
  assert.equal(failure.checkpointAt,tip-12*HOUR)
  assert.equal(control.nbaPublicCaptureDecision(game,null,failure,finish+30*60_000).due,true)
  const before=control.nbaNextPublicControl(undefined,'captured',finish,tip,new Date(start).toISOString(),start)
  assert.equal(control.nbaPublicCaptureDecision(game,null,before,finish).due,true)
  const after=control.nbaNextPublicControl(undefined,'captured',finish,tip,new Date(finish).toISOString(),start)
  assert.equal(control.nbaPublicCaptureDecision(game,null,after,finish).due,false)
  assert.ok(control.nbaValidPublicControl(failure))
  assert.throws(()=>control.nbaNextPublicControl(undefined,'failed',finish,tip,undefined,finish+1),/attempt clock/)
})
test('attempts crossing the new intermediate checkpoint retain their real slot and time',()=>{
  const start=tip-12*HOUR-60_000,finish=tip-12*HOUR+60_000
  const failure=control.nbaNextPublicControl(undefined,'failed',finish,tip,undefined,start)
  assert.equal(failure.checkpointAt,tip-24*HOUR)
  assert.equal(control.nbaPublicCaptureDecision(game,null,failure,finish+30*60_000).slotHours,12)
  const observed=control.nbaNextPublicControl(undefined,'captured',finish,tip,new Date(start).toISOString(),start)
  assert.equal(control.nbaPublicCaptureDecision(game,null,observed,finish).due,true)
  assert.equal(observed.successAt,new Date(start).toISOString())
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
async function fixture(options:{now?:number;games?:PaintGame[];complete?:boolean;gotoAdvanceMs?:number}={}){
  let now=options.now??tip-8*HOUR, opens=0,claims=0,releases=0,reads=0,writes=0,failRead=false,failWrite=false,failRelease=false,leaseBusy=false,auth=false,startupFails=false,startupError:Error|undefined,underLease:undefined|(()=>void)
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
      '@/lib/nbaPaintData':{getPaintSchedule:async()=>({games:options.games??[game],complete:options.complete??true})},'@/lib/nbaOddsClockData':{getNbaOddsGame:async(g:PaintGame)=>g},'@/lib/nbaPaint':{nbaToday:()=>game.date},'@/lib/nbaOddsMode':mode,
      '@/lib/nbaPublicCaptureControl':control,'@/lib/nbaPublicCaptureControlData':data,'@/lib/supabase/admin':{createAdminClient:()=>admin},
      '@/lib/pikkitGameOverviewServer': { observePikkitGameOverview: () => ({ find: () => null, dispose() {} }) },
      '@/lib/nbaBrowserBudget':budget,
      '@/lib/pikkitBrowserLease':{acquirePikkitBrowserLease:async()=>{claims++;underLease?.();return leaseBusy?null:{release:async()=>{releases++;return !failRelease}}}},
      '@/lib/browserbase':{openPikkitSession:async()=>{if(startupError)throw startupError;opens++;if(startupFails)throw Error('startup fixture');return{page:{setDefaultTimeout(){},setDefaultNavigationTimeout(){},on(){},off(){},goto:async()=>{now+=options.gotoAdvanceMs??0},url:()=>auth?'https://app.pikkit.com/login':'https://app.pikkit.com/leagues/nba',waitForFunction:async()=>{},waitForTimeout:async()=>{},evaluate:async(_fn:unknown,arg?:unknown)=>arg?{bodyLength:0,signIn:false,awayTeamMentioned:false,selectCount:0,eventCount:0}:false},close:async()=>{}}}},
      '@/lib/scrapers/gameMatch':{findAndClickPikkitGame:async()=>false},'@/lib/scrapers/pikkitLeagueDate':{observePikkitLeagueDates:()=>({selectDate:async()=>true,dispose(){}})},'@/lib/scrapers/nbaPikkitScraper':{},'@/lib/nbaPublicServer':{},'@/lib/nbaPublic':{NBA_PUBLIC_VERSION:parser},
      '@/lib/nbaPublicEventIdentity':{nbaPublicTeamLabel:(team:{full_name:string})=>team.full_name,nbaVerifiedPublicEvent:()=>null},'@/lib/nbaSharedCache':{},
    },{Date:Clock,process:{env:{PIKKIT_CONTEXT_ID:'private-context-identity'}}})
    const response=await route.GET(new Request(`https://fixture.test/capture${params}`))
    return{status:response.status,body:await response.json()}
  }
  return{rows,invoke,data,metrics:()=>({opens,claims,releases,reads,writes}),advance:(ms:number)=>{now+=ms},clock:()=>now,setReadFailure:(value:boolean)=>{failRead=value},setWriteFailure:(value:boolean)=>{failWrite=value},setAuth:()=>{auth=true},setStartupFailure:()=>{startupFails=true},setBudgetFailure:(code:import('../src/lib/nbaBrowserBudget.ts').NbaBrowserBudgetCode)=>{startupError=new budget.NbaBrowserBudgetError(code)},setSpoofedBudgetFailure:()=>{startupError=Object.assign(new Error('provider secret'),{name:'NbaBrowserBudgetError',code:'spend-limit'})},setReleaseFailure:()=>{failRelease=true},setLeaseBusy:()=>{leaseBusy=true},onLease:(fn:()=>void)=>{underLease=fn}}
}
test('day-before cohort holds without a paid launch and starts due games on the next tick',async()=>{
  const later={...game,id:456,datetime:new Date(tip+30*60_000).toISOString()}
  const f=await fixture({now:tip-24*HOUR+6*60_000,games:[game,later]})
  const held=await f.invoke()
  assert.equal(held.body.browserSessions,0)
  assert.equal(f.metrics().opens,0);assert.equal(f.metrics().claims,0);assert.equal(f.metrics().writes,0)
  f.advance(30*60_000)
  const run=await f.invoke()
  assert.equal(f.metrics().opens,1)
  assert.deepEqual(run.body.results.map((result:{game:number})=>result.game),[123,456])
  assert.equal(f.metrics().releases,1)
})
test('intermediate first attempts group within an hour, without holding missing baselines or retries',async()=>{
  const later={...game,id:456,datetime:new Date(tip+30*60_000).toISOString()}
  const f=await fixture({now:tip-12*HOUR+6*60_000,games:[game,later]})
  for(const item of [game,later]){
    const start=mode.nbaGameStart(item)!, at=start-20*HOUR, key=control.nbaPublicGameControlKey(item,parser)
    f.rows.set(key,{key,payload:control.nbaNextPublicControl(undefined,'captured',at,start,new Date(at).toISOString())})
  }
  assert.equal((await f.invoke()).body.browserSessions,0)
  assert.equal(f.metrics().claims,0)
  f.advance(30*60_000)
  const result=await f.invoke()
  assert.equal(f.metrics().opens,1)
  assert.deepEqual(result.body.results.map((row:{game:number})=>row.game),[123,456])
  const missing=await fixture({now:tip-12*HOUR+6*60_000,games:[game,later]})
  await missing.invoke()
  assert.equal(missing.metrics().opens,1)
})
test('a slow intermediate batch leaves the untouched game eligible at the next normal tick',async()=>{
  const later={...game,id:456,datetime:new Date(tip+30*60_000).toISOString()}
  const f=await fixture({now:tip-12*HOUR+36*60_000,games:[game,later],gotoAdvanceMs:220_000})
  for(const item of [game,later]){
    const start=mode.nbaGameStart(item)!,at=start-20*HOUR,key=control.nbaPublicGameControlKey(item,parser)
    f.rows.set(key,{key,payload:control.nbaNextPublicControl(undefined,'captured',at,start,new Date(at).toISOString())})
  }
  const first=await f.invoke()
  assert.deepEqual(first.body.results.map((row:{game:number})=>row.game),[123])
  assert.equal(f.metrics().opens,1)
  const next=await f.invoke()
  assert.deepEqual(next.body.results.map((row:{game:number})=>row.game),[456])
  assert.equal(f.metrics().opens,2)
})
test('large fresh intermediate batches cap at six and honestly defer remaining games',async()=>{
  const games=Array.from({length:7},(_,i)=>({...game,id:100+i})),f=await fixture({now:tip-12*HOUR+6*60_000,games})
  for(const item of games){
    const at=tip-20*HOUR,key=control.nbaPublicGameControlKey(item,parser)
    f.rows.set(key,{key,payload:control.nbaNextPublicControl(undefined,'captured',at,tip,new Date(at).toISOString())})
  }
  const first=await f.invoke()
  assert.equal(first.body.due,7);assert.equal(first.body.results.length,6);assert.equal(first.body.deferred,7)
  assert.equal(f.metrics().opens,1)
  assert.equal((f.rows.get(control.nbaPublicGameControlKey(games[6],parser))!.payload as control.NbaPublicControl).outcome,'captured')
  f.advance(30*60_000)
  const next=await f.invoke()
  assert.deepEqual(next.body.results.map((row:{game:number})=>row.game),[games[6].id])
  assert.equal(f.metrics().opens,2)
})
test('lease-busy and budget denial report every due intermediate game, including capped ones',async()=>{
  for(const denial of ['lease','budget'] as const){
    const games=Array.from({length:7},(_,i)=>({...game,id:100+i})),f=await fixture({now:tip-12*HOUR+6*60_000,games})
    for(const item of games){const at=tip-20*HOUR,key=control.nbaPublicGameControlKey(item,parser);f.rows.set(key,{key,payload:control.nbaNextPublicControl(undefined,'captured',at,tip,new Date(at).toISOString())})}
    if(denial==='lease')f.setLeaseBusy();else f.setBudgetFailure('spend-limit')
    const result=await f.invoke()
    assert.equal(result.status,425);assert.equal(result.body.due,7);assert.equal(result.body.deferred,7)
    assert.equal(result.body.browserSessions,0);assert.equal(f.metrics().opens,0)
  }
})
test('a seventh due retry is never hidden by first-attempt grouping or the intermediate cap',async()=>{
  const games=Array.from({length:7},(_,i)=>({...game,id:100+i})),future={...game,id:200,datetime:new Date(tip+HOUR).toISOString()}
  const now=tip-12*HOUR+36*60_000,f=await fixture({now,games:[...games,future]})
  for(const item of [...games,future]){
    const start=mode.nbaGameStart(item)!,at=start-20*HOUR,key=control.nbaPublicGameControlKey(item,parser)
    let state=control.nbaNextPublicControl(undefined,'captured',at,start,new Date(at).toISOString())
    if(item.id===games[6].id)state=control.nbaNextPublicControl(state,'failed',tip-12*HOUR+60_000,tip)
    f.rows.set(key,{key,payload:state})
  }
  const result=await f.invoke()
  assert.equal(f.metrics().opens,1)
  assert.ok(result.body.results.some((row:{game:number})=>row.game===games[6].id))
})
test('a seventh due game without a successful baseline is never hidden by intermediate grouping',async()=>{
  const games=Array.from({length:7},(_,i)=>({...game,id:100+i})),future={...game,id:200,datetime:new Date(tip+HOUR).toISOString()}
  const now=tip-12*HOUR+36*60_000,f=await fixture({now,games:[...games,future]})
  for(const item of [...games.slice(0,6),future]){
    const start=mode.nbaGameStart(item)!,at=start-20*HOUR,key=control.nbaPublicGameControlKey(item,parser)
    f.rows.set(key,{key,payload:control.nbaNextPublicControl(undefined,'captured',at,start,new Date(at).toISOString())})
  }
  const result=await f.invoke()
  assert.equal(f.metrics().opens,1)
  assert.ok(result.body.results.some((row:{game:number})=>row.game===games[6].id))
})
test('intermediate batching uses real UTC instants across the fall DST change and respects canonical corrections',()=>{
  const first={...game,id:100,date:'2026-11-01',datetime:'2026-11-01T05:00:00Z'}
  const second={...first,id:101,datetime:'2026-11-01T05:30:00Z'}
  const state=(item:PaintGame)=>{const start=mode.nbaGameStart(item)!,at=start-20*HOUR;return control.nbaNextPublicControl(undefined,'captured',at,start,new Date(at).toISOString())}
  const states=new Map([[control.nbaPublicGameControlKey(first,parser),state(first)],[control.nbaPublicGameControlKey(second,parser),state(second)]])
  const now=Date.parse(first.datetime!)-12*HOUR+6*60_000
  assert.equal(control.nbaPublicIntermediateCohortHold([first],[first,second],states,parser,()=>null,now),Date.parse(second.datetime!)-12*HOUR)
  const corrected={...second,datetime:'2026-11-01T04:30:00Z'}
  assert.notEqual(control.nbaPublicGameControlKey(corrected,parser),control.nbaPublicGameControlKey(second,parser))
  assert.equal(control.nbaPublicIntermediateCohortHold([first],[first,corrected],states,parser,()=>null,now),null)
})
test('under-lease reread cancels a capped intermediate launch after another worker captured all games',async()=>{
  const games=Array.from({length:7},(_,i)=>({...game,id:100+i})),f=await fixture({now:tip-12*HOUR+6*60_000,games})
  for(const item of games){const at=tip-20*HOUR,key=control.nbaPublicGameControlKey(item,parser);f.rows.set(key,{key,payload:control.nbaNextPublicControl(undefined,'captured',at,tip,new Date(at).toISOString())})}
  f.onLease(()=>{for(const item of games){const key=control.nbaPublicGameControlKey(item,parser);f.rows.set(key,{key,payload:control.nbaNextPublicControl(undefined,'captured',f.clock(),tip,new Date(f.clock()).toISOString())})}})
  const result=await f.invoke()
  assert.equal(result.body.browserSessions,0);assert.equal(f.metrics().opens,0);assert.equal(f.metrics().releases,1)
})
test('ideal nine-game schedule adds three grouped daytime sessions with the six-game limit',()=>{
  const base=Date.parse('2026-11-07T00:00:00Z'), offsets=[0,0,30,60,60,60,60,180,180]
  const games=offsets.map((minutes,i)=>({...game,id:2000+i,date:'2026-11-06',datetime:new Date(base+minutes*60_000).toISOString()}))
  const states=new Map<string,control.NbaPublicControl>()
  for(const item of games){const start=mode.nbaGameStart(item)!,at=start-24*HOUR+60_000;states.set(control.nbaPublicGameControlKey(item,parser),control.nbaNextPublicControl(undefined,'captured',at,start,new Date(at).toISOString()))}
  const groups:number[][]=[], ages:number[]=[]
  for(let tick=0;tick<=8;tick++){
    const now=base-12*HOUR+6*60_000+tick*30*60_000
    const due=games.filter(item=>control.nbaPublicCaptureDecision(item,null,states.get(control.nbaPublicGameControlKey(item,parser)),now).due)
    if(!due.length||control.nbaPublicIntermediateCohortHold(due,games,states,parser,()=>null,now)!==null)continue
    assert.ok(due.length<=6)
    groups.push(due.map(item=>item.id))
    for(const item of due){const key=control.nbaPublicGameControlKey(item,parser),start=mode.nbaGameStart(item)!,prior=states.get(key)!;ages.push(now-Date.parse(prior.successAt!));states.set(key,control.nbaNextPublicControl(prior,'captured',now+1000,start,new Date(now+1000).toISOString(),now))}
  }
  assert.deepEqual(groups.map(group=>group.length),[2,5,2])
  assert.equal(groups.length,3)
  assert.ok(Math.max(...ages)<13*HOUR)
})
test('four-hour cohorts combine only previously captured first attempts and keep near-tip work unchanged',async()=>{
  const later={...game,id:456,datetime:new Date(tip+30*60_000).toISOString()}
  const now=tip-4*HOUR+6*60_000
  const f=await fixture({now,games:[game,later]})
  for(const item of [game,later]){
    const start=mode.nbaGameStart(item)!,at=start-20*HOUR
    const state=control.nbaNextPublicControl(undefined,'captured',at,start,new Date(at).toISOString())
    f.rows.set(control.nbaPublicGameControlKey(item,parser),{key:control.nbaPublicGameControlKey(item,parser),payload:state})
  }
  const held=await f.invoke()
  assert.equal(held.body.browserSessions,0);assert.equal(f.metrics().opens,0);assert.equal(f.metrics().claims,0)
  f.advance(30*60_000)
  const run=await f.invoke()
  assert.equal(f.metrics().opens,1)
  assert.deepEqual(run.body.results.map((result:{game:number})=>result.game),[123,456])
  assert.equal(f.metrics().releases,1)
})
test('four-hour batching never delays missing baselines, retries, mixed urgent work or oversized groups',()=>{
  const now=tip-4*HOUR+6*60_000,later={...game,id:456,datetime:new Date(tip+30*60_000).toISOString()}
  const prior=(item:PaintGame)=>{const start=mode.nbaGameStart(item)!,at=start-20*HOUR;return control.nbaNextPublicControl(undefined,'captured',at,start,new Date(at).toISOString())}
  const key=(item:PaintGame)=>control.nbaPublicGameControlKey(item,parser)
  const states=new Map([[key(game),prior(game)],[key(later),prior(later)]])
  const hold=(due:PaintGame[],schedule:PaintGame[],at=now)=>control.nbaPublicFourHourCohortHold(due,schedule,states,parser,()=>null,at)
  assert.equal(hold([game],[game,later]),tip-4*HOUR+30*60_000)
  assert.equal(hold([game],[game,later],tip-4*HOUR+30*60_000),null,'hold ends at its fixed deadline')
  states.delete(key(game));assert.equal(hold([game],[game,later]),null,'missing baseline')
  states.set(key(game),control.nbaNextPublicControl(prior(game),'failed',now,tip));assert.equal(hold([game],[game,later],now+31*60_000),null,'retry')
  states.set(key(game),prior(game))
  const urgent={...game,id:789,datetime:new Date(now+HOUR).toISOString()}
  states.set(key(urgent),prior(urgent));assert.equal(hold([game,urgent],[game,later,urgent]),null,'T-1h is never delayed')
  const extras=Array.from({length:6},(_,i)=>({...later,id:1000+i}))
  for(const item of extras)states.set(key(item),prior(item))
  assert.equal(hold([game],[game,...extras]),null,'oversized batches are not held')
})
test('a slow grouped four-hour attempt leaves an unvisited game immediately eligible',async()=>{
  const later={...game,id:456,datetime:new Date(tip+30*60_000).toISOString()}
  const f=await fixture({now:tip-4*HOUR+36*60_000,games:[game,later],gotoAdvanceMs:220_000})
  for(const item of [game,later]){
    const start=mode.nbaGameStart(item)!,at=start-20*HOUR,key=control.nbaPublicGameControlKey(item,parser)
    f.rows.set(key,{key,payload:control.nbaNextPublicControl(undefined,'captured',at,start,new Date(at).toISOString())})
  }
  const run=await f.invoke()
  assert.equal(f.metrics().opens,1)
  assert.deepEqual(run.body.results.map((result:{game:number})=>result.game),[123])
  const laterState=f.rows.get(control.nbaPublicGameControlKey(later,parser))!.payload as control.NbaPublicControl
  assert.ok(Date.parse(laterState.successAt!)<tip-4*HOUR,'unvisited prior stays untouched')
  const next=await f.invoke()
  assert.equal(f.metrics().opens,2)
  assert.deepEqual(next.body.results.map((result:{game:number})=>result.game),[456])
})
test('the observed 14-game stagger models five rather than eight public launches under ideal success',()=>{
  const games=[2,3,3,1,2,1,1,1].flatMap((count,index)=>Array.from({length:count},(_,n)=>({...game,id:2000+index*10+n,datetime:new Date(tip+index*30*60_000).toISOString()})))
  const run=(group:boolean)=>{
    const states=new Map<string,control.NbaPublicControl>()
    for(const item of games){const start=mode.nbaGameStart(item)!,at=start-20*HOUR;states.set(control.nbaPublicGameControlKey(item,parser),control.nbaNextPublicControl(undefined,'captured',at,start,new Date(at).toISOString()))}
    let launches=0
    for(let tick=0;tick<8;tick++){
      const now=tip-4*HOUR+6*60_000+tick*30*60_000
      const due=games.filter(item=>control.nbaPublicCaptureDecision(item,null,states.get(control.nbaPublicGameControlKey(item,parser)),now).due)
      if(!due.length||group&&control.nbaPublicFourHourCohortHold(due,games,states,parser,()=>null,now)!==null)continue
      launches++
      for(const item of due){const key=control.nbaPublicGameControlKey(item,parser),start=mode.nbaGameStart(item)!;states.set(key,control.nbaNextPublicControl(states.get(key),'captured',now+1000,start,new Date(now+1000).toISOString(),now))}
    }
    assert.ok(games.every(item=>Date.parse(states.get(control.nbaPublicGameControlKey(item,parser))!.successAt!)>=mode.nbaGameStart(item)!-4*HOUR))
    return launches
  }
  assert.equal(run(false),8)
  assert.equal(run(true),5)
})
test('incomplete schedule disables batching and starts the existing due check',async()=>{
  const later={...game,id:456,datetime:new Date(tip+30*60_000).toISOString()}
  const f=await fixture({now:tip-24*HOUR+6*60_000,games:[game,later],complete:false})
  await f.invoke()
  assert.equal(f.metrics().opens,1)
})
test('selected requests do not wait for another game',async()=>{
  const later={...game,id:456,datetime:new Date(tip+30*60_000).toISOString()}
  const f=await fixture({now:tip-24*HOUR+6*60_000,games:[game,later]})
  await f.invoke('?game=123')
  assert.equal(f.metrics().opens,1)
})
test('a mixed day-before and near-tip cohort never delays urgent work',async()=>{
  const now=tip-4*HOUR
  const dayBefore={...game,id:456,datetime:new Date(now+24*HOUR).toISOString()}
  const soon={...game,id:789,datetime:new Date(now+24*HOUR+30*60_000).toISOString()}
  const f=await fixture({now,games:[game,dayBefore,soon]})
  await f.invoke()
  assert.equal(f.metrics().opens,1)
})
test('a slow first game leaves the unvisited game eligible without another cohort hold',async()=>{
  const later={...game,id:456,datetime:new Date(tip+30*60_000).toISOString()}
  const f=await fixture({now:tip-24*HOUR+36*60_000,games:[game,later],gotoAdvanceMs:220_000})
  const run=await f.invoke()
  assert.equal(f.metrics().opens,1)
  assert.deepEqual(run.body.results.map((result:{game:number})=>result.game),[123])
  assert.equal(f.rows.has(control.nbaPublicGameControlKey(later,parser)),false)
  const next=await f.invoke()
  assert.equal(f.metrics().opens,2)
  assert.deepEqual(next.body.results.map((result:{game:number})=>result.game),[456])
})
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
