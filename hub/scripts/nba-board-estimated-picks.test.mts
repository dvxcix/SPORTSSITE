import assert from 'node:assert/strict'
import test from 'node:test'
import { nbaBoardEstimatedPicks, nbaBoardPublicTotals } from '../src/lib/nbaBoardEstimatedPicks.ts'
import { nbaPublicHistory } from '../src/lib/nbaPublicHistory.ts'
import type { NbaBoardCell } from '../src/lib/nbaFullOddsBoard.ts'

const quote=(line:number,odds:number):NbaBoardCell=>({gameId:1,playerId:2,vendor:'fanduel',market:'points',line,current:{odds,at:'2026-11-04T17:00:00Z'},opening:null,previous:null})
test('estimated milestone picks use the Props allocation, conserve the category total and keep zero',()=>{
  const cells=[quote(5,-500),quote(10,-200),quote(15,100),quote(20,250),quote(25,500)]
  const result=nbaBoardEstimatedPicks(cells,1000)
  assert.deepEqual([...result.values()],[100,200,600,67,33])
  assert.equal([...result.values()].reduce((sum,value)=>sum+value,0),1000)
  assert.deepEqual([...nbaBoardEstimatedPicks(cells,0).values()],[0,0,0,0,0])
  assert.equal(nbaBoardEstimatedPicks(cells,null).size,0)
  assert.equal(nbaBoardEstimatedPicks([...cells,quote(15,120)],100).size,0)
  assert.equal(nbaBoardEstimatedPicks([cells[0],{...cells[1],gameId:9}],100).size,0)
})
test('category totals stay scoped to game, market and verified identity, across the phase boundary',()=>{
  const capture=(at:string,picks:number,market='points')=>({captured_at:at,snapshot:{gameId:1,capturedAt:at,sourceUrl:'',unmatched:0,normalizationVersion:'nba-public-v5',rows:[{playerId:2,market:market as 'points',picks}],markets:[market],complete:true}})
  const tip=Date.parse('2026-11-04T18:00:00Z'),before=capture('2026-11-04T17:59:00Z',100),after=capture('2026-11-04T18:01:00Z',300)
  const pre=nbaPublicHistory([before,after],1,'pregame',tip,Date.parse('2026-11-04T18:03:00Z'))
  const live=nbaPublicHistory([before,after],1,'live',tip,Date.parse('2026-11-04T18:03:00Z'))
  const now=Date.parse('2026-11-04T18:03:00Z')
  assert.equal(nbaBoardPublicTotals(pre,1,'points','pregame',tip,now).get(2),100)
  assert.equal(nbaBoardPublicTotals(live,1,'points','live',tip,now).get(2),300)
  assert.equal(nbaBoardPublicTotals(live,1,'points','pregame',tip,now).size,0)
  assert.equal(nbaBoardPublicTotals(pre,1,'points','live',tip,now).size,0)
  assert.equal(nbaBoardPublicTotals(pre,1,'points_1q','pregame',tip,now).size,0)
  assert.equal(nbaBoardPublicTotals(pre,9,'points','pregame',tip,now).size,0)
  assert.equal(nbaBoardPublicTotals([],1,'points','pregame',tip,now).size,0)
  assert.equal(nbaBoardPublicTotals([{...pre[0],snapshot:{...pre[0].snapshot,normalizationVersion:'unverified',rows:pre[0].snapshot.rows.map(row=>({...row,normalizationVersion:'unverified'}))}}],1,'points','pregame',tip,now).size,0)
  assert.equal(nbaBoardPublicTotals([{...pre[0],snapshot:{...pre[0].snapshot,rows:pre[0].snapshot.rows.map(row=>({...row,capturedAt:'2026-11-04T18:01:00Z'}))}}],1,'points','pregame',tip,now).size,0)
})
