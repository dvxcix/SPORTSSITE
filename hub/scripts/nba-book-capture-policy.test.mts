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

test('cadence tightens by canonical time to tip without allowing a started or unknown game',()=>{
  assert.equal(policy.nbaBookCadence(game,tip-25*hour),3*hour)
  assert.equal(policy.nbaBookCadence(game,tip-10*hour),4*hour)
  assert.equal(policy.nbaBookCadence(game,tip-3*hour),2*hour)
  assert.equal(policy.nbaBookCadence(game,tip-hour),30*minute)
  for(const closed of [game,{...game,datetime:null},{...game,status_state:'in_progress' as const,period:1}])assert.deepEqual(policy.planNbaBookCapture(closed,'betmgm',undefined,undefined,tip).families,[])
  const first=plan(tip-3*hour),saved=policy.finishNbaBookCapture(first,policy.reserveNbaBookCapture(first,undefined,tip-3*hour),observed(tip-3*hour),tip-3*hour)
  assert.equal(plan(tip-91*minute,saved).families.length,0)
  assert.equal(plan(tip-90*minute,saved).families.length,12)
})

test('a 48-hour five-minute trigger simulation reduces healthy and unavailable work by over90 percent',()=>{
  for(const outcome of ['captured','unavailable'] as const){
    let state:policy.NbaBookScheduleState|undefined,attempts=0,baseline=0
    for(let at=tip-48*hour;at<tip;at+=5*minute){
      baseline++;const due=plan(at,state)
      if(!due.families.length)continue
      attempts++;state=policy.finishNbaBookCapture(due,policy.reserveNbaBookCapture(due,state,at),due.families.map(family=>({family,status:outcome,observedAt:new Date(at).toISOString()})),at)
    }
    assert.ok(attempts<=22,`${outcome}: ${attempts}/${baseline}`)
    assert.ok(attempts/baseline<0.1)
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
  assert.equal(plan(retryAt+30*minute,failed).regularMarkets.includes('assists'),true)
  assert.ok(policy.nbaValidBookSchedule(failed,'betmgm',game))
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
