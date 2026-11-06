import assert from 'node:assert/strict'
import test from 'node:test'
import { nbaBoardCaptureWarnings } from '../src/lib/nbaBoardCaptureWarning.ts'
import type { PaintGame } from '../src/lib/nbaPaint.ts'

const tip=Date.parse('2026-11-05T23:00:00Z'), now=tip-3_600_000
const game={id:12,datetime:new Date(tip).toISOString(),status:'Scheduled',status_state:'scheduled',period:0} as PaintGame
const other={...game,id:13}
const frame='2026-11-05T21:00:00.123456Z'
const row=(key='market-attempt:v4:pregame:12',status='failed',at='2026-11-05T21:59:00.123456Z')=>({key,payload:{status,private:'secret'},fetched_at:at})
type Receipt = {key:string;payload:unknown;fetched_at:string|null}
const warn=(scopes:{game:PaintGame;capturedAt:string|null;fingerprint?:string|null}[]=[{game,capturedAt:frame,fingerprint:'a'.repeat(64)}],mode:'pregame'|'live'='pregame',receipts:Receipt[]|null=[row()],at=now)=>nbaBoardCaptureWarnings(scopes,mode,receipts,at)

test('only affected exact game and phase receive a generic warning',()=>{
  assert.deepEqual(warn([{game,capturedAt:frame},{game:other,capturedAt:frame}]),[12,13])
  assert.deepEqual(warn(undefined,'pregame',[row('market-attempt:v4:live:12')]),[12])
  assert.deepEqual(warn(undefined,'pregame',[row('market-attempt:v4:pregame:13')]),[12])
  // A game-lines-only success cannot establish a successful props capture.
  for(const status of ['captured','unchanged','deferred'])assert.deepEqual(warn(undefined,'pregame',[row(undefined,status)]),[12])
  for(const status of ['captured','unchanged']){
    const verified={...row(undefined,status),payload:{status,playerFingerprint:'a'.repeat(64),playerObservedAt:'2026-11-05T21:58:00Z',private:'secret'}}
    assert.deepEqual(warn(undefined,'pregame',[verified]),[])
    assert.deepEqual(warn(undefined,'pregame',[{...verified,payload:{...verified.payload,playerObservedAt:'2026-11-05T22:00:00Z'}}]),[12])
    assert.deepEqual(warn([{game,capturedAt:frame,fingerprint:'b'.repeat(64)}],'pregame',[verified]),[12])
    assert.deepEqual(warn([{game,capturedAt:frame}],'pregame',[verified]),[12])
    // The cron timestamps its observation before the database commits a new
    // frame; unchanged frames may instead predate the observation.
    assert.deepEqual(warn([{game,capturedAt:'2026-11-05T21:58:30Z',fingerprint:'a'.repeat(64)}],'pregame',[verified]),[])
    assert.deepEqual(warn([{game,capturedAt:'2026-11-05T21:59:30Z',fingerprint:'a'.repeat(64)}],'pregame',[verified]),[12])
  }
  // A newer direct panel does not prove that the failed whole feed recovered.
  assert.deepEqual(warn([{game,capturedAt:'2026-11-05T21:59:30Z'}]),[12])
})
test('a closed pregame board ignores all current receipt state',()=>{
  assert.deepEqual(warn(undefined,'pregame',[row()],tip),[])
  assert.deepEqual(warn([{game:{...game,status_state:'in_progress',period:1},capturedAt:frame}]),[])
  assert.deepEqual(warn(undefined,'pregame',null,tip),[])
})
test('live and final never attach mutable receipt warnings',()=>{
  const active={...game,status:'In Progress',status_state:'in_progress',period:1}, live=tip+60_000
  const scope=[{game:active,capturedAt:'2026-11-05T23:00:10Z'}]
  assert.deepEqual(warn(scope,'live',[row('market-attempt:v4:live:12','failed','2026-11-05T23:00:30Z')],live),[])
  assert.deepEqual(warn(scope,'live',[row('market-attempt:v4:live:12','failed','2026-11-05T22:59:59.999999Z')],live),[])
  assert.deepEqual(warn(scope,'live',[row()],live),[])
  assert.deepEqual(warn([{game:{...active,status:'Final',status_state:'final'},capturedAt:frame}],'live',null,live),[])
})
test('at or after tip and future receipts are not admitted',()=>{
  assert.deepEqual(warn(undefined,'pregame',[row(undefined,'failed','2026-11-05T22:00:00.000001Z')]),[12])
  assert.deepEqual(warn(undefined,'pregame',[row(undefined,'failed','2026-11-05T23:00:00Z')]),[12])
})
test('read failure warns only visible open games with a saved frame',()=>{
  assert.deepEqual(warn([{game,capturedAt:frame},{game:other,capturedAt:frame}],'pregame',null),[12,13])
  assert.deepEqual(warn([{game,capturedAt:null}],'pregame',null),[])
  assert.deepEqual(warn([{game,capturedAt:null}]),[])
  assert.deepEqual(warn(undefined,'pregame',[]),[12])
  assert.deepEqual(warn(undefined,'pregame',[row(),row()]),[12])
})
