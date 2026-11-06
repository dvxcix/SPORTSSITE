import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import * as eventDiagnostics from '../src/lib/nbaFirstEventDiagnostics'
import { NbaFirstEventTransportError, NbaFirstOddsUnavailable, nbaFirstEventFailure, nbaFirstEventFailureLog, nbaReadFirstOddsResponse } from '../src/lib/nbaFirstEventDiagnostics'

test('event failure categories are bounded and contain no error text', () => {
  const cases = [
    [new NbaFirstOddsUnavailable('connection'), 'missing-key'],
    [new NbaFirstOddsUnavailable('authorization'), 'authorization'],
    [new NbaFirstOddsUnavailable('quota'), 'quota'],
    [new NbaFirstOddsUnavailable('upstream'), 'upstream'],
    [new NbaFirstEventTransportError(), 'transport'],
    [new Error('https://example.invalid/?apiKey=SECRET_CANARY'), 'unknown'],
    [{ reason: 'SECRET_CANARY' }, 'unknown'],
    [null, 'unknown'],
  ] as const
  for (const [error, category] of cases) {
    const result = nbaFirstEventFailure(error)
    assert.equal(result, category)
    assert.doesNotMatch(result, /SECRET_CANARY|https?:/)
    assert.equal(nbaFirstEventFailureLog(error), `NBA market event list unavailable: ${category}`)
  }
})

test('one event request preserves success and classifies observed failures', async () => {
  for (const [status, expected] of [[401, 'authorization'], [403, 'authorization'], [429, 'quota'], [500, 'upstream']] as const) {
    let calls = 0
    await assert.rejects(nbaReadFirstOddsResponse(async () => { calls++; return new Response('', { status }) }, true), error => nbaFirstEventFailure(error) === expected)
    assert.equal(calls, 1)
  }
  let calls = 0
  await assert.rejects(nbaReadFirstOddsResponse(async () => { calls++; throw new Error('https://example.invalid/?apiKey=SECRET_CANARY') }, true), error => nbaFirstEventFailure(error) === 'transport' && !String(error).includes('SECRET_CANARY'))
  assert.equal(calls, 1)
  await assert.rejects(nbaReadFirstOddsResponse(async () => new Response('{'), true), error => nbaFirstEventFailure(error) === 'unknown')
  assert.deepEqual(await nbaReadFirstOddsResponse(async () => new Response('[]'), true), [])
})

test('only known provider error codes from the existing event response are recorded',async()=>{
  const cases=[['INVALID_KEY','invalid-key'],['DEACTIVATED_KEY','deactivated-key'],['OUT_OF_USAGE_CREDITS','usage-exhausted'],['MISSING_KEY','request-key-missing'],['INVALID_KEY SECRET_CANARY','authorization'],['OTHER','authorization']] as const
  for(const [code,expected] of cases)for(const status of [401,403]){
    let calls=0
    await assert.rejects(nbaReadFirstOddsResponse(async()=>{calls++;return Response.json({error_code:code,message:'https://example.invalid/?apiKey=SECRET_CANARY'},{status})},true),error=>{
      const category=nbaFirstEventFailure(error),log=nbaFirstEventFailureLog(error)
      assert.equal(category,expected);assert.doesNotMatch(log,/SECRET_CANARY|https?:|apiKey/)
      return true
    })
    assert.equal(calls,1)
  }
  const forged=new NbaFirstOddsUnavailable('authorization')
  ;(forged as {rejection?:unknown}).rejection='SECRET_CANARY'
  assert.equal(nbaFirstEventFailureLog(forged),'NBA market event list unavailable: authorization')
})

test('malformed, oversized, stalled and failed bodies fall back without exposing text',async()=>{
  const unknown=async(response:Response)=>assert.rejects(nbaReadFirstOddsResponse(async()=>response,true),error=>{
    assert.equal(nbaFirstEventFailure(error),'authorization')
    assert.doesNotMatch(nbaFirstEventFailureLog(error),/SECRET_CANARY|https?:|apiKey/)
    return true
  })
  await unknown(new Response('{"error_code":"SECRET_CANARY', {status:401}))
  await unknown(new Response(JSON.stringify({error_code:'INVALID_KEY',message:'SECRET_CANARY'.repeat(1000)}),{status:401}))
  let oversizedCanceled=false
  const oversized=new ReadableStream<Uint8Array>({pull(){return new Promise(()=>{})},cancel(){oversizedCanceled=true}},{highWaterMark:0})
  await unknown(new Response(oversized,{status:401,headers:{'content-length':'99999'}}))
  assert.equal(oversizedCanceled,true)
  const locked=new Response('secret body',{status:401}),held=locked.body!.getReader()
  try{await unknown(locked)}finally{held.releaseLock()}
  await unknown(new Response(new ReadableStream({pull(controller){controller.error(new Error('https://example.invalid/?apiKey=SECRET_CANARY'))}}),{status:401}))
  let canceled=false
  const stalled=new ReadableStream<Uint8Array>({pull(){return new Promise(()=>{})},cancel(){canceled=true}},{highWaterMark:0})
  const start=Date.now();await unknown(new Response(stalled,{status:401}))
  assert.ok(Date.now()-start<2000,'diagnostic must not wait indefinitely for a failed response body')
  assert.equal(canceled,true)
  let pulls=0
  const fragmented=new ReadableStream<Uint8Array>({pull(controller){pulls++;controller.enqueue(new Uint8Array([32]))}},{highWaterMark:0})
  await unknown(new Response(fragmented,{status:401}))
  assert.equal(pulls,32,'fragmented bodies are bounded by a read count as well as size')
})

test('normal non-event paths retain their old error handling',async()=>{
  let pulls=0
  const body=new ReadableStream<Uint8Array>({pull(controller){pulls++;controller.enqueue(new Uint8Array([32]));controller.close()}},{highWaterMark:0})
  await assert.rejects(nbaReadFirstOddsResponse(async()=>new Response(body,{status:401}),false),error=>nbaFirstEventFailure(error)==='authorization')
  assert.equal(pulls,0)
  await assert.rejects(nbaReadFirstOddsResponse(async()=>Response.json({error_code:'INVALID_KEY'},{status:429}),true),error=>nbaFirstEventFailure(error)==='quota')
})

test('only the existing authenticated cron call emits an allowlisted category', () => {
  const route = readFileSync(new URL('../src/app/api/cron/nba-market-capture/route.ts', import.meta.url), 'utf8')
  assert.ok(route.indexOf('requireCronAuth(request)') < route.indexOf('getNbaFirstEvents(true, true)'))
  assert.match(route, /getNbaFirstEvents\(true, true\)\.catch\(error => \{\s*console\.error\(nbaFirstEventFailureLog\(error\)\)\s*return null/)
  assert.equal((route.match(/getNbaFirstEvents\(/g) ?? []).length, 1)
})

test('fresh event path handles a missing key without making a request', async () => {
  const source = readFileSync(new URL('../src/lib/nbaFirstBasketOddsData.ts', import.meta.url), 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const target = { exports: {} as { getNbaFirstEvents: (fresh: boolean, diagnostic: boolean) => Promise<unknown> } }
  let calls = 0
  new Function('require', 'module', 'exports', 'fetch', 'process', output)(
    (name: string) => name === './nbaFirstEventDiagnostics' ? eventDiagnostics : {}, target, target.exports,
    () => { calls++; throw new Error('unexpected request') }, { env: {} },
  )
  await assert.rejects(target.exports.getNbaFirstEvents(true, true), error => nbaFirstEventFailureLog(error) === 'NBA market event list unavailable: missing-key')
  assert.equal(calls, 0)
})
