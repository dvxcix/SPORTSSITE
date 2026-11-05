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
