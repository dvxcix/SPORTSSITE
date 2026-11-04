import assert from 'node:assert/strict'
import test from 'node:test'
import { nbaPublicCaptureDecision, nbaPublicCohortHold, nbaNextPublicControl, nbaPublicGameControlKey } from '../src/lib/nbaPublicCaptureControl.ts'
import type { PaintGame } from '../src/lib/nbaPaint.ts'

const minute = 60_000, hour = 60 * minute
const origin = Date.parse('2026-11-04T00:00:00Z')
const parser = 'fixture', none = () => null
const game = (id:number, offset:number, date='2026-11-04') => ({ id, date, datetime:new Date(origin+24*hour+offset*minute).toISOString(), status:'Scheduled', status_state:'scheduled', period:0 }) as PaintGame
const empty = new Map()

test('saved 14-game slate groups eligible day-before checks without early reads', () => {
  const sizes = [2,3,3,1,2,1,1,1]
  let id = 0
  const games = sizes.flatMap((size, index) => Array.from({ length:size }, () => game(++id,index*30)))
  const captured = new Set<number>(), batches:number[][] = []
  for (let offset=6;offset<=246;offset+=30) {
    const now=origin+offset*minute
    const due=games.filter(g=>!captured.has(g.id) && nbaPublicCaptureDecision(g,null,undefined,now).due)
    if (!due.length || nbaPublicCohortHold(due,games,empty,parser,none,now)!==null) continue
    batches.push(due.map(g=>g.id))
    for(const g of due)captured.add(g.id)
    assert.ok(due.every(g=>Date.parse(g.datetime!) - 24*hour<=now))
  }
  assert.deepEqual(batches.map(batch=>batch.length),[5,4,3,2])
  assert.equal(captured.size,14)
})

test('unvisited tail, retries and urgent near-tip slots never wait for a cohort', () => {
  const first=game(1,0), second=game(2,30), now=origin+36*minute
  assert.equal(nbaPublicCohortHold([first,second],[first,second],empty,parser,none,now),null)
  const last=game(3,60), retry=game(4,90), controls=new Map()
  controls.set(nbaPublicGameControlKey(last,parser),nbaNextPublicControl(undefined,'failed',origin+60*minute,Date.parse(last.datetime!)))
  assert.equal(nbaPublicCohortHold([last],[last,retry],controls,parser,none,origin+96*minute),null)
  assert.equal(nbaPublicCohortHold([first],[first,second],empty,parser,none,Date.parse(first.datetime!)-hour),null)
})

test('does not hold past Eastern day-before midnight, including DST changes', () => {
  // Across fall-back, T-24h lands at 01:15 EDT the prior day; the hold is safe.
  const first={...game(1,0,'2026-11-02'),datetime:'2026-11-02T05:15:00Z'}
  const second={...first,id:2,datetime:'2026-11-02T05:35:00Z'}
  assert.equal(nbaPublicCohortHold([first],[first,second],empty,parser,none,Date.parse('2026-11-01T05:20:00Z')),Date.parse('2026-11-01T05:35:00Z'))
  // A 23:50 Eastern game has a day-before boundary near midnight.
  const easternLate={...first,date:'2026-11-04',datetime:'2026-11-05T04:50:00Z'}
  const next={...easternLate,id:3,datetime:'2026-11-05T05:10:00Z'}
  assert.equal(nbaPublicCohortHold([easternLate],[easternLate,next],empty,parser,none,Date.parse('2026-11-04T04:55:00Z')),null)
  const justBefore={...first,date:'2026-11-04',datetime:'2026-11-05T04:17:00Z'}
  const close={...justBefore,id:4,datetime:'2026-11-05T04:27:00Z'}
  assert.equal(nbaPublicCohortHold([justBefore],[justBefore,close],empty,parser,none,Date.parse('2026-11-04T04:20:00Z')),null,'the run itself must fit before midnight')
})

test('single, closed and ineligible games never cause a delay', () => {
  const first=game(1,0), later=game(2,30)
  assert.equal(nbaPublicCohortHold([first],[first],empty,parser,none,origin+6*minute),null)
  assert.equal(nbaPublicCohortHold([first],[first,{...later,status_state:'in_progress',period:1}],empty,parser,none,origin+6*minute),null)
  assert.equal(nbaPublicCohortHold([first],[first,{...later,status_state:'cancelled'}],empty,parser,none,origin+6*minute),null)
  assert.equal(nbaPublicCohortHold([first],[first,later],empty,parser,()=>new Date(origin-hour).toISOString(),origin+6*minute),null)
})
