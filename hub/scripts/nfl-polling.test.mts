import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { nflPollDelay, startNflPolling } from '../src/lib/nflPolling.ts'

test('refresh jitter stays near 30s and failures back off with a cap', () => {
  assert.equal(nflPollDelay(0, 0), 27000)
  assert.equal(nflPollDelay(0, 1), 33000)
  assert.equal(nflPollDelay(1, .5), 60000)
  assert.equal(nflPollDelay(99, .5), 120000)
})
test('poller serializes requests, pauses hidden/offline, resumes, and cancels cleanly', async () => {
  const originals = Object.fromEntries(['document','window','navigator','setTimeout','clearTimeout'].map(k => [k, Object.getOwnPropertyDescriptor(globalThis,k)]))
  const timers = new Map<number, () => void>(); let id=0
  const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' })
  const win = new EventTarget(); const nav = { onLine: true }
  for (const [key,value] of Object.entries({ document:doc,window:win,navigator:nav,setTimeout:(fn:()=>void)=>{timers.set(++id,fn); return id},clearTimeout:(id:number)=>timers.delete(id) })) Object.defineProperty(globalThis,key,{value,configurable:true,writable:true})
  let calls=0; let finish:()=>void=()=>{}; let signal:AbortSignal
  const tick=async()=>{const entry=timers.entries().next().value; assert.ok(entry);timers.delete(entry[0]);entry[1]();await Promise.resolve();await Promise.resolve()}
  try {
    const stop=startNflPolling(async s=>{calls++;signal=s;await new Promise<void>(r=>finish=r)})
    await tick();assert.equal(calls,1);assert.equal(timers.size,0)
    doc.dispatchEvent(new Event('visibilitychange'));assert.equal(timers.size,0)
    finish();await Promise.resolve();await Promise.resolve()
    doc.visibilityState='hidden';await tick();assert.equal(calls,1)
    doc.visibilityState='visible';nav.onLine=false;await tick();assert.equal(calls,1)
    nav.onLine=true;win.dispatchEvent(new Event('online'));await tick();assert.equal(calls,2)
    stop();assert.equal(signal!.aborted,true);finish();await Promise.resolve();await Promise.resolve()
    assert.equal(timers.size,0);win.dispatchEvent(new Event('online'));assert.equal(timers.size,0)
  } finally { for(const [key,descriptor] of Object.entries(originals)) { if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key) } }
})
test('NFL private endpoints keep auth outside shared cache and history is opt-in',()=>{
  const read=(p:string)=>readFileSync(p,'utf8')
  const slate=read('src/app/api/the-sideline/slate-edge/route.ts')
  assert.ok(slate.indexOf('await requireNflAccess()') < slate.indexOf('await getSlatePayload('))
  assert.match(slate,/private, no-store/)
  assert.match(slate,/unstable_cache/)
  const research=read('src/app/the-sideline/SidelineResearchClient.tsx')
  assert.match(research,/results=1/)
  assert.doesNotMatch(research,/fetch\(`\/the-sideline\/results/)
  const market=read('src/app/the-sideline/useSidelineMarket.ts')
  assert.match(market,/if \(!selectedAt \|\| document.visibilityState/)
  assert.doesNotMatch(market,/setInterval/)
  assert.match(read('src/app/the-sideline/page.tsx'),/gate.isAdmin/)
})

