import test from 'node:test'
import assert from 'node:assert/strict'
import { nbaMergeBookHistory, type NbaBookHistoryContract, type NbaBookHistoryFrame } from '../src/lib/nbaBookHistory.ts'
import type { PaintProp } from '../src/lib/nbaPaint.ts'
import { nbaFirstMovements } from '../src/lib/nbaFirstBasketMovement.ts'
import type { FirstBasketRow } from '../src/lib/nbaFirstBasketOdds.ts'

const t=(minute:number)=>`2026-10-24T12:${String(minute).padStart(2,'0')}:00.000Z`
const quote=(odds:number,at=10,extra:Partial<PaintProp>={}):PaintProp=>({id:1,game_id:123,player_id:375,vendor:'betmgm',prop_type:'points',line_value:'30',market:{type:'milestone',odds},updated_at:t(at),...extra})
const panel=(quotes:PaintProp[],at=20,extra:Partial<NbaBookHistoryContract>={}):NbaBookHistoryContract=>({book:'betmgm',market:'points',market_type:'milestone',line:30,observed_at:t(at),quotes,...extra})
const frame=(quotes:PaintProp[],contracts:NbaBookHistoryContract[],base=15):NbaBookHistoryFrame=>({captured_at:t(30),base_captured_at:t(base),base_absence_complete:true,quotes,book_contracts:contracts,fingerprint:'base'})

test('a later aggregate cannot override a newer actual book observation with an older API quote',()=>{
  const result=nbaMergeBookHistory(frame([quote(350,10)],[panel([quote(400,20)])],25))
  assert.equal((result.quotes[0] as PaintProp).market.odds,400);assert.equal(result.quotes[0].updated_at,t(20))
  const newer=nbaMergeBookHistory(frame([quote(425,25)],[panel([quote(400,20)])],26))
  assert.equal((newer.quotes[0] as PaintProp).market.odds,425);assert.equal(newer.quotes[0].updated_at,t(25))
})
test('an exact direct scope is independently durable without a complete base feed',()=>{
  const result=nbaMergeBookHistory({...frame([],[panel([quote(400,20)])]),base_captured_at:null})
  assert.equal(result.quotes.length,1);assert.equal((result.quotes[0] as PaintProp).market.odds,400)
})
test('full-feed absence after a book observation withdraws it, but an older absent feed does not',()=>{
  assert.equal(nbaMergeBookHistory(frame([],[panel([quote(400,20)])],25)).quotes.length,0)
  assert.equal(nbaMergeBookHistory(frame([],[panel([quote(400,20)])],15)).quotes.length,1)
})
test('an omitted quote in a partial First Basket feed does not become a withdrawal',()=>{
  const result=nbaMergeBookHistory({...frame([],[panel([quote(400,20)])],25),base_absence_complete:false})
  assert.equal(result.quotes.length,1)
  assert.equal(nbaMergeBookHistory({...frame([quote(400,10)],[panel([])],25),base_absence_complete:false}).quotes.length,0,'explicit complete book withdrawal remains authoritative')
})
test('empty complete panels withdraw only their exact book, market, type and threshold',()=>{
  const unaffected=[quote(200,10,{line_value:'25'}),quote(200,10,{vendor:'draftkings'}),quote(200,10,{prop_type:'rebounds'}),quote(200,10,{market:{type:'over_under',over_odds:200}})]
  const result=nbaMergeBookHistory(frame([quote(400,10),...unaffected],[panel([])]))
  assert.equal(result.quotes.length,4);assert.ok((result.quotes as PaintProp[]).every(p=>p.market.odds!==400))
  const newer=nbaMergeBookHistory(frame([quote(425,25)],[panel([])],26));assert.equal(newer.quotes.length,1)
})
test('O/U sides preserve exact timestamps and never synthesize a shared timestamp',()=>{
  const contract=panel([quote(0,20,{line_value:'0.5',prop_type:'blocks',market:{type:'over_under',over_odds:150}})],20,{market:'blocks',market_type:'over_under',line:.5})
  const base=quote(0,25,{line_value:'0.5',prop_type:'blocks',market:{type:'over_under',under_odds:-160}})
  const result=nbaMergeBookHistory(frame([base],[contract],15)).quotes as PaintProp[]
  assert.equal(result.length,2);assert.equal(result.find(q=>q.market.over_odds===150)?.updated_at,t(20));assert.equal(result.find(q=>q.market.under_odds===-160)?.updated_at,t(25))
})
test('unrelated canonical O/U rows keep both sides, identity and timestamp intact',()=>{
  const both=quote(0,10,{id:42,vendor:'fanduel',line_value:'14.5',market:{type:'over_under',over_odds:150,under_odds:-160}})
  const result=nbaMergeBookHistory(frame([both],[panel([quote(400,20)])])).quotes as PaintProp[]
  assert.deepEqual(result.find(q=>q.vendor==='fanduel'),both)
})
test('malformed, duplicate or future complete scopes fail closed',()=>{
  const good=panel([quote(400,20)])
  for(const contracts of [[good,good],[panel([quote(400,19)])],[panel([quote(400,20,{line_value:'25'})])],[panel([],31)]])assert.throws(()=>nbaMergeBookHistory(frame([],contracts)),/Invalid|Duplicate/)
})
test('unchanged prices retain equal economic fingerprints despite independent timestamps',()=>{
  const a=nbaMergeBookHistory(frame([],[panel([quote(400,20)])],15))
  const b=nbaMergeBookHistory(frame([],[panel([quote(400,25)],25)],15))
  assert.equal(a.fingerprint,b.fingerprint);assert.notEqual(a.quotes[0].updated_at,b.quotes[0].updated_at)
})
test('unrelated contract observations do not replace a First Basket price previous observation',()=>{
  const first=(odds:number,minute:number)=>quote(0,minute,{vendor:'draftkings',prop_type:'first_score',line_value:'0.5',market:{type:'over_under',over_odds:odds}})
  const prior=first(980,10),current=first(940,20)
  const row={game:{id:123},player:{id:375},offer:current} as FirstBasketRow
  const frames=[{captured_at:t(10),props:[prior]},{captured_at:t(20),props:[current]},{captured_at:t(21),props:[current]},{captured_at:t(22),props:[current]}]
  const result=nbaFirstMovements([row],[],{captures:50,frames},Date.parse(t(30)))[0]
  assert.equal(result.movement?.previousOdds,980);assert.equal(result.movement?.previousAt,t(10));assert.equal(result.movement?.latestAt,t(20));assert.ok(result.movement!.previousChange!>0)
  const withdrawn=nbaFirstMovements([row],[],{captures:51,frames:[...frames,{captured_at:t(23),props:[]}]},Date.parse(t(30)))[0]
  assert.equal(withdrawn.movement?.previousOdds,null);assert.equal(withdrawn.movement?.latestAt,t(20))
})
