import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import * as policy from '../src/lib/nbaBookCapturePolicy.ts'
import type { PaintGame } from '../src/lib/nbaPaint.ts'
import type { NbaFirstBook } from '../src/lib/nbaBookFirstData.ts'

const minute=60_000,hour=60*minute,tip=Date.parse('2026-10-28T00:00:00Z')
const team={id:1,name:'Hawks',full_name:'Atlanta Hawks',abbreviation:'ATL'}
const game:PaintGame={id:217,date:'2026-10-27',datetime:new Date(tip).toISOString(),season:2026,status:'Scheduled',status_state:'scheduled',period:0,home_team:team,visitor_team:{...team,id:2},home_team_score:0,visitor_team_score:0}
const plan=(now:number,state?:policy.NbaBookScheduleState,circuit?:policy.NbaBookCircuit)=>policy.planNbaBookCapture(game,'betmgm',state,circuit,now)
const observed=(at:number,families=policy.nbaBookFamilies('betmgm'))=>families.map(family=>({family,status:'captured' as const,observedAt:new Date(at).toISOString()}))

test('direct-book captures use canonical checkpoints and never allow a started or unknown game',()=>{
  assert.equal(policy.nbaBookCheckpoint(game,tip-25*hour),null)
  assert.equal(policy.nbaBookCheckpoint(game,tip-24*hour),tip-24*hour)
  assert.equal(policy.nbaBookCheckpoint(game,tip-10*hour),tip-24*hour)
  assert.equal(policy.nbaBookCheckpoint(game,tip-3*hour),tip-4*hour)
  assert.equal(policy.nbaBookCheckpoint(game,tip-hour),tip-hour)
  for(const closed of [game,{...game,datetime:null},{...game,status_state:'in_progress' as const,period:1}])assert.deepEqual(policy.planNbaBookCapture(closed,'betmgm',undefined,undefined,tip).families,[])
  const first=plan(tip-3*hour),saved=policy.finishNbaBookCapture(first,policy.reserveNbaBookCapture(first,undefined,tip-3*hour),observed(tip-3*hour),tip-3*hour)
  assert.equal(plan(tip-91*minute,saved).families.length,0)
  assert.equal(plan(tip-hour,saved).families.length,12)
})

test('a 48-hour five-minute trigger simulation launches only three healthy or unavailable checkpoints',()=>{
  for(const outcome of ['captured','unavailable'] as const){
    let state:policy.NbaBookScheduleState|undefined,attempts=0,baseline=0
    for(let at=tip-48*hour;at<tip;at+=5*minute){
      baseline++;const due=plan(at,state)
      if(!due.families.length)continue
      attempts++;state=policy.finishNbaBookCapture(due,policy.reserveNbaBookCapture(due,state,at),due.families.map(family=>({family,status:outcome,observedAt:new Date(at).toISOString()})),at)
    }
    assert.equal(attempts,3,`${outcome}: ${attempts}/${baseline}`)
    assert.ok(attempts/baseline<0.01)
    assert.equal(plan(tip,state).families.length,0)
  }
})

test('durable reservation is not success and prevents immediate retries after interruption',()=>{
  const at=tip-hour,due=plan(at),state=policy.reserveNbaBookCapture(due,undefined,at)
  assert.ok(Object.values(state.markets).every(row=>row.status==='attempting'&&row.successAt===null))
  assert.equal(plan(at+5*minute,structuredClone(state)).families.length,0)
  assert.equal(plan(at+30*minute,structuredClone(state)).families.length,12)
})

test('families schedule independently; failed attempts never restamp a prior genuine success',()=>{
  const at=tip-3*hour,due=plan(at),prior=policy.finishNbaBookCapture(due,policy.reserveNbaBookCapture(due,undefined,at),observed(at),at)
  const retryAt=tip-hour,next=plan(retryAt,prior),reserved=policy.reserveNbaBookCapture(next,prior,retryAt)
  const failed=policy.finishNbaBookCapture(next,reserved,[...observed(retryAt).filter(row=>row.family!=='points'),{family:'points',status:'failed'}],retryAt)
  assert.equal(failed.markets.points.successAt,at)
  assert.equal(failed.markets.assists.successAt,retryAt)
  failed.markets.points.retryAt=retryAt+hour
  assert.equal(plan(retryAt+30*minute,failed).regularMarkets.includes('points'),false)
  assert.equal(plan(retryAt+30*minute,failed).regularMarkets.includes('assists'),false)
  assert.ok(policy.nbaValidBookSchedule(failed,'betmgm',game))
})

test('each failed checkpoint gets at most one retry; later checkpoints remain available',()=>{
  const at=tip-12*hour, first=plan(at), reserved=policy.reserveNbaBookCapture(first,undefined,at)
  const failed=policy.finishNbaBookCapture(first,reserved,first.families.map(family=>({family,status:'failed' as const})),at)
  assert.equal(plan(at+29*minute,failed).families.length,0)
  const retry=plan(at+30*minute,failed)
  assert.equal(retry.families.length,12)
  const second=policy.finishNbaBookCapture(retry,policy.reserveNbaBookCapture(retry,failed,at+30*minute),retry.families.map(family=>({family,status:'failed' as const})),at+30*minute)
  assert.equal(plan(at+2*hour,second).families.length,0)
  assert.equal(plan(tip-4*hour,second).families.length,12)
  assert.ok(policy.nbaValidBookSchedule(second,'betmgm',game))
})

test('a persisted retired 12-hour checkpoint remains valid and does not trigger extra attempts',()=>{
  const at=tip-12*hour, due=plan(at), reserved=policy.reserveNbaBookCapture(due,undefined,at)
  const failed=policy.finishNbaBookCapture(due,reserved,due.families.map(family=>({family,status:'failed' as const})),at)
  for(const row of Object.values(failed.markets)){row.checkpointAt=at;row.checkpointAttempts=2;row.retryAt=at}
  assert.ok(policy.nbaValidBookSchedule(failed,'betmgm',game))
  assert.equal(plan(at+hour,failed).families.length,0)
  assert.equal(plan(tip-4*hour,failed).families.length,12)
})

test('a no-browser budget deferral does not spend a checkpoint attempt',()=>{
  const at=tip-4*hour,first=plan(at),reserved=policy.reserveNbaBookCapture(first,undefined,at)
  const deferred=policy.finishNbaBookCapture(first,reserved,first.families.map(family=>({family,status:'budget-deferred' as const})),at)
  assert.equal(deferred.markets.first.checkpointAttempts,0)
  assert.equal(plan(at+29*minute,deferred).families.length,0)
  const retry=plan(at+30*minute,deferred)
  assert.equal(retry.families.length,12)
  assert.equal(policy.reserveNbaBookCapture(retry,deferred,at+30*minute).markets.first.checkpointAttempts,1)
})

test('a direct capture crossing a checkpoint counts its actual observation, not finish time',()=>{
  const start=tip-4*hour-minute,finish=tip-4*hour+minute
  const first=plan(start),reserved=policy.reserveNbaBookCapture(first,undefined,start)
  const before=policy.finishNbaBookCapture(first,reserved,observed(start),finish)
  assert.equal(before.markets.first.checkpointAt,tip-24*hour)
  assert.equal(plan(finish,before).families.length,12)
  assert.equal(policy.reserveNbaBookCapture(plan(finish,before),before,finish).markets.first.checkpointAttempts,1)
  const after=policy.finishNbaBookCapture(first,reserved,observed(finish),finish)
  assert.equal(plan(finish,after).families.length,0)
  const legacy=structuredClone(before)
  for(const value of Object.values(legacy.markets)){delete value.checkpointAt;delete value.checkpointAttempts}
  assert.ok(policy.nbaValidBookSchedule(legacy,'betmgm',game))
  assert.equal(plan(finish,legacy).families.length,12,'legacy finish time cannot replace the real read time')
  const legacyRetry=policy.reserveNbaBookCapture(plan(finish,legacy),legacy,finish)
  assert.equal(legacyRetry.markets.first.checkpointAttempts,1)
  const legacyFailure=policy.finishNbaBookCapture(plan(finish,legacy),legacyRetry,first.families.map(family=>({family,status:'failed' as const})),finish)
  assert.equal(plan(finish+30*minute,legacyFailure).families.length,12)
  const absent=policy.finishNbaBookCapture(first,reserved,first.families.map(family=>({family,status:'unavailable' as const})),finish)
  assert.equal(plan(finish,absent).families.length,12)
})

test('challenge cooldown survives time-band changes and exponential failures cap at6h',()=>{
  const at=tip-2*hour,circuit={version:1 as const,failures:3,retryAt:at+2*hour}
  assert.deepEqual(plan(tip-30*minute,undefined,circuit).families,[])
  assert.deepEqual([1,2,3,4,5,8].map(policy.nbaBookFailureBackoff),[30,60,120,240,360,360].map(value=>value*minute))
  assert.equal(policy.planNbaBookCapture(game,'draftkings',undefined,undefined,at).families.length,1)
})

test('budget denials retain the original success and failure count without claiming unavailable source markets',()=>{
  const at=tip-hour,due=plan(at),reserved=policy.reserveNbaBookCapture(due,undefined,at)
  reserved.markets.first.successAt=at-60_000;reserved.markets.first.failures=2
  const finished=policy.finishNbaBookCapture(due,reserved,due.families.map(family=>({family,status:'budget-deferred'})),at+1000)
  assert.equal(finished.markets.first.status,'deferred');assert.equal(finished.markets.first.successAt,at-60_000);assert.equal(finished.markets.first.failures,2)
  assert.ok(policy.nbaValidBookSchedule(finished,'betmgm',game));assert.deepEqual(plan(at+5*minute,finished).families,[])
})

test('future, post-tip, duplicate and missing successful observations become failed attempts',()=>{
  const at=tip-hour,due=plan(at),reserved=policy.reserveNbaBookCapture(due,undefined,at)
  for(const rows of [[],observed(at-1),observed(at+1),observed(tip),[...observed(at),observed(at)[0]]]){
    const finished=policy.finishNbaBookCapture(due,reserved,rows,at)
    assert.equal(finished.markets.first.successAt,null);assert.equal(finished.markets.first.status,'failed')
  }
  assert.equal(policy.nbaValidBookSchedule({...reserved,tipoff:tip+1},'betmgm',game),false)
  assert.equal(policy.nbaValidBookSchedule({...reserved,markets:{unknown:reserved.markets.first}},'betmgm',game),false)
})

async function storeFixture(){
  const rows=new Map<string,unknown>(),writes:unknown[]=[]
  let failure=false,ackWrong=false
  const query={keys:[] as string[],select(){return this},in(_field:string,keys:string[]){this.keys=keys;return this},upsert(values:{key:string;payload:unknown}[],options:{onConflict:string}){assert.equal(options.onConflict,'key');writes.push(values);this.keys=values.map(row=>row.key);if(!failure)for(const row of values)rows.set(row.key,row.payload);return this},async abortSignal(signal:AbortSignal){assert.ok(signal instanceof AbortSignal);return failure?{data:null,error:{message:'private'}}:{data:ackWrong?[]:this.keys.filter(key=>rows.has(key)).map(key=>({key,payload:rows.get(key)})),error:null}}}
  const source=readFileSync(new URL('../src/lib/nbaBookCaptureSchedule.ts',import.meta.url),'utf8'),code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
  const load=()=>{const loaded={exports:{} as typeof import('../src/lib/nbaBookCaptureSchedule.ts')};new Function('require','module','exports',code)((name:string)=>name==='server-only'?{}:name==='./nbaBookCapturePolicy'?policy:name==='./supabase/admin'?{createAdminClient:()=>({from:(table:string)=>{assert.equal(table,'nba_source_cache');return query}})}:assert.fail(name),loaded,loaded.exports);return loaded.exports}
  return{rows,writes,load,wrongAck:(value:boolean)=>{ackWrong=value},fail:(value:boolean)=>{failure=value}}
}

test('new instances share only durable cadence metadata; read/write and malformed payload fail closed',async()=>{
  const db=await storeFixture(),first=db.load(),second=db.load(),at=tip-hour,state=policy.reserveNbaBookCapture(plan(at),undefined,at)
  await first.writeNbaBookCaptureSchedule('betmgm',[{game,state}],{version:1,failures:1,retryAt:tip})
  const read=await second.readNbaBookCaptureSchedule('betmgm',[game])
  assert.deepEqual(read.states.get(game.id),state);assert.equal(read.circuit?.retryAt,tip)
  assert.ok([...db.rows.keys()].every(key=>key.startsWith('book-cadence:')||key.startsWith('book-circuit:')))
  db.fail(true)
  await assert.rejects(second.readNbaBookCaptureSchedule('betmgm',[game]),/unavailable/)
  await assert.rejects(second.writeNbaBookCaptureSchedule('betmgm',[{game,state}]),/could not save/)
  db.fail(false);db.wrongAck(true)
  await assert.rejects(second.writeNbaBookCaptureSchedule('betmgm',[{game,state}]),/could not save/)
  db.wrongAck(false);db.rows.set(policy.nbaBookScheduleKey('betmgm',game),{...state,gameId:999})
  await assert.rejects(second.readNbaBookCaptureSchedule('betmgm',[game]),/invalid/)
  await assert.rejects(second.writeNbaBookCaptureSchedule('draftkings' as NbaFirstBook,[{game,state}]),/invalid/)
})
