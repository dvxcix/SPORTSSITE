import assert from 'node:assert/strict'
import test from 'node:test'
import { recentNflCaptureAttempts, selectNflCaptureCandidates, nflCaptureResultStatus, NFL_CAPTURE_REQUEST_TIMEOUT_MS } from '../src/lib/nflCaptureDispatch.ts'
import { emptyNflCaptureStatus } from '../src/lib/nflCaptureCoverage.ts'
import { pruneInBatches } from '../src/lib/retentionBatch.ts'
const now = new Date('2026-09-23T17:00:00Z')
const game = (id: string, date = '2026-09-27') => ({ gameId: id, gameDate: date, gameTime: '13:00', capturedAt: 0 })
test('uncaptured games rotate behind recently attempted games', () => {
  const attempts = recentNflCaptureAttempts([{ started_at: '2026-09-23T16:00:00Z', details: { results: [{ gameId: 'a' }, { gameId: 'b' }] } }])
  assert.deepEqual(selectNflCaptureCandidates(['a','b','c','d'].map(id => game(id)), attempts, now).map(g => g.gameId), ['c','d'])
})
test('games within six hours take priority, without retrying every minute', () => {
  assert.equal(selectNflCaptureCandidates([game('later'), game('soon','2026-09-23')], new Map(), now)[0].gameId, 'soon')
  assert.equal(selectNflCaptureCandidates([game('a')], new Map([['a',now.getTime()-60_000]]), now).length, 0)
})
test('failed captures can retry without a 12-hour penalty', () => {
  assert.equal(selectNflCaptureCandidates([game('a')], new Map([['a',now.getTime()-31*60_000]]), now).length, 1)
})
test('deferred markets are not failures; genuine failures remain failures', () => {
  assert.equal(nflCaptureResultStatus([{ok:false,deferred:true}]), 425)
  assert.equal(nflCaptureResultStatus([{ok:false,deferred:true},{ok:false}]), 502)
  assert.equal(nflCaptureResultStatus([{ok:true}]), 200)
  assert.ok(NFL_CAPTURE_REQUEST_TIMEOUT_MS > 230_000)
  assert.ok(NFL_CAPTURE_REQUEST_TIMEOUT_MS < 300_000)
})
test('only completed team-only captures qualify as unpublished props', () => {
  const tab = { scraped_at: now.toISOString(), event: {title:'A @ B'}, sections:{'Game Lines':[], 'Alternate Total Points':[]} }
  assert.equal(emptyNflCaptureStatus([tab]),425)
  assert.equal(emptyNflCaptureStatus([{...tab,incomplete:true}]),502)
  assert.equal(emptyNflCaptureStatus([{...tab,sections:{'Player Receiving Yards':[]}}]),502)
  assert.equal(emptyNflCaptureStatus([]),502)
})
test('retention drains batches and preserves errors instead of claiming success', async () => {
  const rows = [{id:1},{id:2},{id:3}]
  const result = await pruneInBatches(
    async () => ({data: rows.slice(0,2), error:null}),
    async ids => { rows.splice(0,ids.length); return {count:ids.length,error:null} },
    Date.now()+1000,
  )
  assert.deepEqual(result,{count:3,error:null,remaining:false})
  const error = new Error('database unavailable')
  const failed = await pruneInBatches(async()=>({data:null,error}), async()=>({count:0,error:null}), Date.now()+1000)
  assert.equal(failed.error,error)
  assert.equal(failed.remaining,true)
})
test('retention deadline reports unfinished work', async () => {
  const result=await pruneInBatches(async()=>{throw Error('should not query')},async()=>({count:0,error:null}),Date.now()-1)
  assert.equal(result.remaining,true)
})
