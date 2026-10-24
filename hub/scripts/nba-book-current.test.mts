import test from 'node:test'
import assert from 'node:assert/strict'
import { nbaCurrentBookQuotes, type NbaCurrentBookFrame } from '../src/lib/nbaBookCurrent.ts'
import { nbaMergeBookHistory } from '../src/lib/nbaBookHistory.ts'
import type { PaintGame, PaintProp } from '../src/lib/nbaPaint.ts'

const now=Date.parse('2026-10-24T12:00:00Z'),time=(age:number)=>new Date(now-age).toISOString()
const game={id:123,date:'2026-10-24',datetime:'2026-10-24T23:00:00Z',status:'Scheduled',status_state:'scheduled',period:0} as PaintGame
const quote=(price:number,age=1000,extra:Partial<PaintProp>={}):PaintProp=>({id:-5_000_000_000_434,game_id:123,player_id:434,vendor:'betmgm',prop_type:'points',line_value:'30',market:{type:'milestone',odds:price},updated_at:time(age),...extra})
const frame=(props:PaintProp[],age=1000,complete=true):NbaCurrentBookFrame=>({book:'betmgm',contract:{market:'points',type:'milestone',line:30},observedAt:time(age),complete,props})
const current=(primary:PaintProp[],frames:NbaCurrentBookFrame[])=>{const result=nbaCurrentBookQuotes(game,primary,frames,now);return{...result,all:[...(result.retainedPrimary??primary),...result.props]}}

test('newer actual direct price replaces an older API side and agrees with archived selection',()=>{
  const api=quote(350,60000,{id:42}),direct=quote(400),panel=frame([direct])
  const result=current([api],[panel])
  assert.deepEqual(result.all,[direct]);assert.equal(result.complete,true)
  const history=nbaMergeBookHistory({captured_at:time(0),base_captured_at:time(500),quotes:[api],fingerprint:'base',book_contracts:[{book:panel.book,market:panel.contract.market,market_type:panel.contract.type,line:panel.contract.line,observed_at:panel.observedAt,quotes:panel.props}]})
  assert.deepEqual(result.all,history.quotes)
  assert.equal(api.market.odds,350,'source objects remain untouched')
})

test('First Score and First FG retain distinct identities while newer exact prices replace',()=>{
  const first=(price:number,age:number,type='first_score',book='draftkings')=>quote(0,age,{vendor:book,prop_type:type,line_value:'0.5',market:{type:'over_under',over_odds:price}})
  const api=first(900,60000),direct=first(1060,1000),fg=first(950,60000,'first_field_goal','betmgm'),team=first(350,60000,'team_first_score')
  const result=current([api,fg,team],[{...frame([direct]),book:'draftkings',contract:{market:'first_score',type:'over_under',line:.5}}])
  assert.deepEqual(result.all,[fg,team,direct]);assert.equal(result.all.filter(q=>q.prop_type==='first_score').length,1)
})

test('API observations at the same time or newer win without comparing payouts',()=>{
  for(const age of [1000,500]){
    const api=quote(300,age),result=current([api],[frame([quote(400)])])
    assert.deepEqual(result.all,[api]);assert.deepEqual(result.props,[])
  }
})

test('fresh complete scope withdraws only older exact API sides',()=>{
  const older=quote(400,60000),different=[quote(400,60000,{vendor:'draftkings'}),quote(400,60000,{line_value:'25'}),quote(400,60000,{prop_type:'rebounds'}),quote(400,60000,{market:{type:'over_under',over_odds:400}}),quote(400,60000,{game_id:999})]
  assert.deepEqual(current([older,...different],[frame([])]).all,different)
  assert.deepEqual(current([older],[frame([],1000,false)]).all,[older])
  for(const age of [1000,500]){const api=quote(400,age);assert.deepEqual(current([api],[frame([])]).all,[api])}
})

test('partial Yes updates keep the separately observed No without timestamp stitching',()=>{
  const extra={prop_type:'double_double',line_value:'0.5'}
  const api=quote(0,60000,{...extra,market:{type:'over_under',over_odds:250,under_odds:-300}}),yes=quote(0,1000,{...extra,market:{type:'over_under',over_odds:275}})
  const panel={...frame([yes],1000,false),contract:{market:'double_double',type:'over_under' as const,line:.5}}
  const result=current([api],[panel])
  assert.equal(result.complete,false);assert.equal(result.all.length,2)
  assert.deepEqual(result.all[0].market,{type:'over_under',under_odds:-300});assert.equal(result.all[0].updated_at,time(60000))
  assert.deepEqual(result.all[1],yes)
  const complete=current([api],[{...panel,complete:true}]);assert.deepEqual(complete.all,[yes])
})

test('expired or future direct panels cannot replace or withdraw current API prices',()=>{
  const api=quote(350,60000)
  for(const age of [300001,-1]){
    assert.deepEqual(current([api],[frame([quote(400,age)],age)]).all,[api])
    assert.deepEqual(current([api],[frame([],age)]).all,[api])
    assert.equal(current([],[frame([quote(400,age)],age)]).complete,false)
  }
})

test('a recent partial attempt does not freshen its retained stale sibling',()=>{
  const stale=quote(400,300001),fresh=quote(450,1000,{player_id:435})
  const result=current([],[frame([stale,fresh],1000,false)])
  assert.deepEqual(result.all,[fresh]);assert.equal(result.complete,false)
})
