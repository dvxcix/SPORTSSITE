import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

class BudgetError extends Error { constructor(readonly code:string) { super(code) } }
async function fixture(options:{failOpen?:boolean;failClosePage?:boolean;failCloseSession?:boolean;fakeTimers?:boolean}={}) {
  const source=await readFile(new URL('../src/lib/nbaDirectSession.ts',import.meta.url),'utf8')
  const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
  let opens=0,closes=0,created=0,active=0,maxActive=0
  let openOptions:Record<string,unknown>|undefined
  const pages = new Set<{close:()=>Promise<void>}>()
  const timers = new Map<number,{fn:()=>void;ms:number}>();let nextTimer=0
  const startTimer = options.fakeTimers ? (fn:()=>void,ms:number)=>{const id=++nextTimer;timers.set(id,{fn,ms});return id} : setTimeout
  const stopTimer = options.fakeTimers ? (id:number)=>{timers.delete(id)} : clearTimeout
  const fireTimers=(maximum:number)=>{for(const [id,timer] of [...timers])if(timer.ms<=maximum){timers.delete(id);timer.fn()}}
  const context={pages:()=>[root,...pages],newPage:async()=>{
    created++;active++;maxActive=Math.max(maxActive,active)
    const page={close:async()=>{if(options.failClosePage)throw new Error('close failed');if(pages.delete(page))active--}}
    pages.add(page);return page
  }}
  const root={context:()=>context}
  const imports:Record<string,unknown>={
    'server-only':{},'./nbaBrowserBudget':{NbaBrowserBudgetError:BudgetError},
    './browserbase':{openSession:async(settings:Record<string,unknown>)=>{opens++;openOptions=settings;if(options.failOpen)throw new BudgetError('session-busy');return{page:root,sessionId:'fixture',close:async()=>{closes++;if(options.failCloseSession)throw new Error('release failed')}}}},
  }
  const compiled={exports:{} as {NbaDirectSession:new()=>{acquire:(deadline:number,eligible?:()=>boolean)=>Promise<{page:unknown;close:()=>Promise<void>}>;stop:()=>void;deferred:(error:unknown)=>string|null;close:()=>Promise<void>}}}
  new Function('require','module','exports','setTimeout','clearTimeout',output)((name:string)=>{assert.ok(name in imports,name);return imports[name]},compiled,compiled.exports,startTimer,stopTimer)
  return { session:new compiled.exports.NbaDirectSession(), stats:()=>({opens,closes,created,active,maxActive,openOptions}), context, fireTimers }
}

test('one guarded session serializes five capture partitions and cleans all pages',async()=>{
  const {session,stats,context}=await fixture()
  const order:number[]=[]
  await Promise.all(Array.from({length:5},async(_,index)=>{
    const lane=await session.acquire(Date.now()+120_000)
    order.push(index); if(index===0)await context.newPage()
    await lane.close()
  }))
  await session.close()
  assert.deepEqual(order,[0,1,2,3,4])
  assert.deepEqual({...stats(),openOptions:undefined},{opens:1,closes:1,created:6,active:0,maxActive:2,openOptions:undefined})
  assert.deepEqual(stats().openOptions,{timeoutSeconds:300,requestTimeoutMs:20_000,solveCaptchas:false,verifyRelease:true,geoState:'NC',proxyDomainPattern:'^([a-zA-Z0-9-]+\\.)*(betmgm\\.com|draftkings\\.com)$',metadata:{sport:'nba',book:'combined-direct',mode:'first-market-dom'}})
})

test('expired queued work defers without opening a browser',async()=>{
  const {session,stats}=await fixture()
  await assert.rejects(session.acquire(Date.now()+19_000),(error:unknown)=>session.deferred(error)==='deadline')
  await session.close();assert.equal(stats().opens,0)
})

test('a queued partition with no pregame games opens no paid session',async()=>{
  const {session,stats}=await fixture()
  await assert.rejects(session.acquire(Date.now()+60_000,()=>false),(error:unknown)=>session.deferred(error)==='closed')
  await session.close();assert.equal(stats().opens,0)
})

test('a denied or uncertain create is never retried within the invocation',async()=>{
  const {session,stats}=await fixture({failOpen:true})
  const results=await Promise.allSettled([session.acquire(Date.now()+60_000),session.acquire(Date.now()+60_000)])
  assert.ok(results.every(item=>item.status==='rejected'))
  assert.ok(results.every(item=>item.status==='rejected'&&item.reason instanceof BudgetError&&item.reason.code==='session-busy'))
  await session.close();assert.equal(stats().opens,1);assert.equal(stats().closes,0)
})

test('a challenge blocks remaining queued tasks and releases the session',async()=>{
  const {session,stats}=await fixture()
  const lane=await session.acquire(Date.now()+60_000), waiting=session.acquire(Date.now()+60_000)
  session.stop();await lane.close()
  await assert.rejects(waiting,(error:unknown)=>session.deferred(error)==='blocked')
  await session.close();assert.equal(stats().opens,1);assert.equal(stats().closes,1)
})

test('uncertain page cleanup blocks reuse but still attempts verified session release',async()=>{
  const {session,stats}=await fixture({failClosePage:true})
  const lane=await session.acquire(Date.now()+60_000), waiting=session.acquire(Date.now()+60_000)
  await assert.rejects(lane.close())
  await assert.rejects(waiting,(error:unknown)=>session.deferred(error)==='blocked')
  await session.close();assert.equal(stats().opens,1);assert.equal(stats().closes,1)
})

test('failed verified session release is surfaced to the cron caller',async()=>{
  const {session}=await fixture({failCloseSession:true})
  const lane=await session.acquire(Date.now()+60_000);await lane.close()
  await assert.rejects(session.close(),/release failed/)
})

test('a timed-out queued task cannot release a still-busy lane',async()=>{
  const {session,stats,fireTimers}=await fixture({fakeTimers:true})
  const first=await session.acquire(Date.now()+60_000)
  const second=session.acquire(Date.now()+20_050)
  fireTimers(100)
  await assert.rejects(second,(error:unknown)=>session.deferred(error)==='deadline')
  const third=session.acquire(Date.now()+60_000)
  await Promise.resolve();assert.equal(stats().created,1)
  await first.close()
  await assert.rejects(third,(error:unknown)=>session.deferred(error)==='blocked')
  await session.close();assert.equal(stats().opens,1);assert.equal(stats().closes,1)
})

test('a hung active lane triggers one verified session release at its browser deadline',async()=>{
  const {session,stats,fireTimers}=await fixture({fakeTimers:true})
  const lane=await session.acquire(Date.now()+60_000)
  fireTimers(61_000);await Promise.resolve()
  assert.equal(stats().closes,1)
  await lane.close();await session.close();assert.equal(stats().closes,1)
})
