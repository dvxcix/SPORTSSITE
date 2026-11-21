import test from 'node:test'
import assert from 'node:assert/strict'
import { nbaFirstBookMarkets } from '../src/lib/nbaFirstBookMarkets.ts'
import { nbaFirstQuoteClock, nbaFirstQuoteVisible } from '../src/lib/nbaFirstQuoteFreshness.ts'
import { nbaMergeBookHistory } from '../src/lib/nbaBookHistory.ts'
import type { FirstOddsEvent, FirstBasketRow } from '../src/lib/nbaFirstBasketOdds.ts'
import type { PaintGame, PaintPlayer } from '../src/lib/nbaPaint.ts'

const now=Date.parse('2026-11-21T12:00:00Z'),at=new Date(now-1000).toISOString()
const home={id:1,abbreviation:'BOS',name:'Celtics',full_name:'Boston Celtics'},away={id:2,abbreviation:'DET',name:'Pistons',full_name:'Detroit Pistons'}
const game={id:123,date:'2026-11-21',datetime:new Date(now+3600000).toISOString(),status:'Scheduled',status_state:'scheduled',period:0,home_team:home,visitor_team:away} as PaintGame
const player={id:434,first_name:'Real',last_name:'Player',team:home,position:'G',headshot:null,average:{},props:[],logs:[],injury:null} as PaintPlayer
const panel=(key='player_first_basket',last_update=at)=>({key,last_update,outcomes:[{name:'Real Player',price:700}]})
const event=(bookmakers:FirstOddsEvent['bookmakers']):FirstOddsEvent=>({id:'event',home_team:home.full_name,away_team:away.full_name,commence_time:game.datetime!,bookmakers})

test('an expired sibling book cannot delay or freshen complete published contracts',()=>{
  const source=event([{key:'fanduel',markets:[panel()]},{key:'betmgm',markets:[panel('player_first_basket',new Date(now-300001).toISOString())]},{key:'fanatics',markets:[panel()]}])
  const {frames,coverage}=nbaFirstBookMarkets(source,game,[player],'pregame',now)
  assert.deepEqual(frames.map(row=>[row.book,row.market]),[['fanduel','first_score'],['fanatics','first_field_goal']])
  assert.equal(coverage.find(row=>row.book==='betmgm'&&row.market==='player_first_basket')?.status,'expired')
  assert.ok(frames.every(frame=>frame.observedAt===at&&frame.props.every(quote=>quote.updated_at===at)))
  const merged=nbaMergeBookHistory({captured_at:at,quotes:[],fingerprint:'',base_captured_at:null,book_contracts:frames.map(frame=>({book:frame.book,market:frame.market,market_type:'over_under',line:.5,observed_at:frame.observedAt,quotes:frame.props}))})
  assert.equal(merged.quotes.length,2,'valid books reach durable history without a global capture')
})

test('every supported book and method keeps its own winning contract and original market clock',()=>{
  const source=event(['fanduel','draftkings','williamhill_us','betmgm','fanatics'].map(key=>({key,markets:[panel(),panel('player_first_team_basket'),...(key==='betmgm'||key==='fanatics'?[]:[{...panel('player_method_of_first_basket'),outcomes:[{name:'Dunk',description:'Real Player',price:1600}]}])]})))
  const {frames}=nbaFirstBookMarkets(source,game,[player],'pregame',now)
  assert.equal(frames.length,28)
  assert.equal(new Set(frames.map(frame=>frame.book)).size,5)
  assert.equal(frames.find(frame=>frame.book==='caesars'&&frame.market==='first_score_dunk')?.props[0].market.over_odds,1600)
  assert.ok(frames.filter(frame=>frame.book==='betmgm'||frame.book==='fanatics').every(frame=>frame.market.includes('field_goal')))
  assert.equal(frames.filter(frame=>frame.market==='first_score_3pt').every(frame=>frame.props.length===0),true)
})

test('missing clocks, future clocks, unmatched players, duplicate panels/sides and No-only outcomes never withdraw a contract',()=>{
  const good=panel()
  const invalid=[{...good,last_update:undefined},{...good,last_update:new Date(now+1).toISOString()},{...good,outcomes:[{name:'Unknown Player',price:700}]},{...good,outcomes:[...good.outcomes,...good.outcomes]},{...good,outcomes:[{name:'No',description:'Real Player',price:-900}]}]
  for(const value of invalid){
    const result=nbaFirstBookMarkets(event([{key:'fanduel',last_update:at,markets:[value]}]),game,[player],'pregame',now)
    assert.equal(result.frames.length,0)
    assert.equal(result.coverage[0].status,'invalid')
  }
  assert.equal(nbaFirstBookMarkets(event([{key:'fanduel',markets:[good,good]}]),game,[player],'pregame',now).frames.length,0)
  assert.equal(nbaFirstBookMarkets(event([{key:'fanduel',markets:[good]},{key:'fanduel',markets:[good]}]),game,[player],'pregame',now).frames.length,0)
  assert.equal(nbaFirstBookMarkets(event([{key:'fanduel',markets:[]}]),game,[player],'pregame',now).frames.length,0,'not posted is not a verified empty panel')
  assert.equal(nbaFirstBookMarkets(event([{key:'fanduel',markets:[{...good,outcomes:[]}]}]),game,[player],'pregame',now).frames.length,1,'a published fresh complete empty panel is explicit')
})

test('the exact five-minute and tipoff boundaries apply separately to pregame and Live',()=>{
  assert.equal(nbaFirstBookMarkets(event([{key:'fanduel',markets:[panel('player_first_basket',new Date(now-300000).toISOString())]}]),game,[player],'pregame',now).frames.length,1)
  const live={...game,datetime:new Date(now-2000).toISOString(),status:'Q1',status_state:'in_progress' as const,period:1}
  const source={...event([{key:'fanduel',markets:[panel()]}]),commence_time:live.datetime!}
  assert.equal(nbaFirstBookMarkets(source,live,[player],'live',now).frames.length,1)
  assert.equal(nbaFirstBookMarkets(source,live,[player],'pregame',now).frames.length,0)
  assert.equal(nbaFirstBookMarkets({...source,bookmakers:[{key:'fanduel',markets:[panel('player_first_basket',new Date(now-3000).toISOString())]}]},live,[player],'live',now).frames.length,0)
})

test('browser quote expiry follows the server clock through refresh failure and device-clock skew',()=>{
  const offer=nbaFirstBookMarkets(event([{key:'fanduel',markets:[panel()]}]),game,[player],'pregame',now).frames[0].props[0]
  const row={game,player,offer} as FirstBasketRow
  const clock=(elapsed:number)=>nbaFirstQuoteClock(new Date(now).toISOString(),500,500+elapsed)
  assert.equal(nbaFirstQuoteVisible(row,'pregame',clock(299000)),true)
  assert.equal(nbaFirstQuoteVisible(row,'pregame',clock(299001)),false)
  assert.equal(nbaFirstQuoteVisible(row,'pregame',NaN),false)
  assert.equal(nbaFirstQuoteClock('bad',500,501),NaN)
  assert.equal(nbaFirstQuoteVisible(row,'live',now),false)
  const tip=Date.parse(game.datetime!)
  assert.equal(nbaFirstQuoteVisible(row,'pregame',tip),false,'client tip crossing cannot certify an archive')
  assert.equal(nbaFirstQuoteVisible(row,'pregame',tip,[123]),true,'server-proven pregame close preserves the historical quote')
  assert.equal(nbaFirstQuoteVisible(row,'pregame',now,[123]),false,'a premature archive flag cannot revive a stale current quote')
})
