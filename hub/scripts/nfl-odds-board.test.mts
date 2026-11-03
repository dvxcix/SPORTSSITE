import test from 'node:test'
import assert from 'node:assert/strict'
import { nflOddsBoardMove, nflOddsBoardQuotes, type NflOddsBoardFrame } from '../src/lib/nflOddsBoard.ts'
import type { NflMarketOffer, SidelineOddsBoard } from '../src/lib/nflOddsTypes.ts'

const cutoff='2026-11-02T23:00:00Z', now=Date.parse('2026-11-03T00:00:00Z')
const offer=(odds:number,updatedAt:string,patch:Partial<NflMarketOffer>={}):NflMarketOffer=>({vendor:'draftkings',type:'milestone',line:25,openingLine:25,current:{odds},opening:{odds:-110},updatedAt,...patch})
const frame=(at:string, offers:NflMarketOffer[], patch:Partial<SidelineOddsBoard>={}):NflOddsBoardFrame=>({capturedAt:at,board:{bdlGameId:7,status:'ready',source:'snapshot',capturedAt:at,gameLines:[],players:[{id:4,name:'Test Player',team:'SEA',position:'WR',markets:[{key:'receiving_yards:25',propType:'receiving_yards',label:'Receiving yards',category:'receiving',line:25,offers}]}],...patch}})
const current=frame('2026-11-02T22:30:00Z',[offer(-140,'2026-11-02T22:29:00Z')]), previous=frame('2026-11-02T21:30:00Z',[offer(-110,'2026-11-02T21:29:00Z')])
const quotes=(sources:NflOddsBoardFrame[][])=>nflOddsBoardQuotes('game',['SEA','CHI'],cutoff,sources,now)
test('compares exact matching saved milestone observations and retains actual times',()=>{const [q]=quotes([[current,previous]]);assert.equal(q.current,-140);assert.equal(q.previous,-110);assert.equal(q.previousAt,'2026-11-02T21:29:00Z');assert.ok(Math.abs(nflOddsBoardMove(q.current,q.previous)!-5.95238)<0.0001)})
test('an embedded opening is never treated as a previous observation',()=>{const [q]=quotes([[current]]);assert.equal(q.previous,null);assert.equal(q.previousAt,null);assert.equal(nflOddsBoardMove(q.current,q.previous),null)})
test('a typed same-line base opening is distinct from unchanged recent observations',()=>{
  const latest=frame('2026-11-02T22:30:00Z',[offer(-870,'2026-11-02T22:29:00Z',{opening:{odds:-940}})])
  const older=frame('2026-11-02T21:30:00Z',[offer(-870,'2026-11-02T21:29:00Z',{opening:{odds:-940}})])
  latest.typedOpeningSource=true;older.typedOpeningSource=true
  const [q]=quotes([[latest,older]])
  assert.equal(q.opening,-940);assert.equal(q.previous,-870);assert.equal(nflOddsBoardMove(q.current,q.previous),0)
  assert.ok(Math.abs(nflOddsBoardMove(q.current,q.opening)!-(-0.6931))<0.01)
  assert.equal('openingAt' in q,false,'opening time was not recorded')
})
test('untyped, different-line, mixed-shape and conflicting openings stay unknown',()=>{
  const untrusted=frame('2026-11-02T22:30:00Z',[offer(-140,'2026-11-02T22:29:00Z')]);assert.equal(quotes([[untrusted]])[0].opening,null)
  for(const patch of [{openingLine:20},{opening:{over:-110}},{opening:{odds:-110,over:-110}}]){
    const invalid=frame('2026-11-02T22:30:00Z',[offer(-140,'2026-11-02T22:29:00Z',patch)]);invalid.typedOpeningSource=true
    assert.equal(quotes([[invalid]])[0].opening,null)
  }
  const a=structuredClone(current),b=structuredClone(previous);a.typedOpeningSource=true;b.typedOpeningSource=true;b.board.players[0].markets[0].offers[0].opening={odds:150}
  assert.equal(quotes([[a,b]])[0].opening,null)
})
test('a newer direct quote can use only an exact typed base opening',()=>{
  const base=frame('2026-11-02T21:30:00Z',[offer(-120,'2026-11-02T21:29:00Z',{opening:{odds:150}})]);base.typedOpeningSource=true
  const direct=frame('2026-11-02T22:30:00Z',[offer(-140,'2026-11-02T22:29:00Z',{opening:{odds:-140}})])
  const [q]=quotes([[base],[direct]]);assert.equal(q.current,-140);assert.equal(q.opening,150);assert.equal(q.previous,-120)
  base.board.players[0].markets[0].offers[0].openingLine=20;assert.equal(quotes([[base],[direct]])[0].opening,null)
  base.board.players[0].markets[0].offers[0].openingLine=25;base.capturedAt='2026-11-02T23:00:00Z';assert.equal(quotes([[base],[direct]])[0].opening,null)
})
test('later observed unchanged prices correctly report zero',()=>{const before=frame('2026-11-02T21:30:00Z',[offer(-140,'2026-11-02T21:29:00Z')]);assert.equal(nflOddsBoardMove(quotes([[current,before]])[0].current,quotes([[current,before]])[0].previous),0)})
test('same timestamp is not a previous observation',()=>{const same=frame('2026-11-02T21:30:00Z',[offer(-140,'2026-11-02T22:29:00Z')]);assert.equal(quotes([[current,same]])[0].previous,null)})
test('different book, player, team, market, type or line cannot become previous',()=>{
  for (const prior of [frame('2026-11-02T21:30:00Z',[offer(-110,'2026-11-02T21:29:00Z',{vendor:'fanduel'})]),frame('2026-11-02T21:30:00Z',[offer(-110,'2026-11-02T21:29:00Z',{type:'over_under',current:{over:-110}})]),frame('2026-11-02T21:30:00Z',[offer(-110,'2026-11-02T21:29:00Z',{line:20})])]) assert.equal(quotes([[current,prior]])[0].previous,null)
  const changed=structuredClone(previous);changed.board.players[0].id=8;assert.equal(quotes([[current,changed]])[0].previous,null)
  changed.board.players[0].id=4;changed.board.players[0].team='CHI';assert.equal(quotes([[current,changed]])[0].previous,null)
})
test('rejects future, post-frame, post-cutoff, opening-only, noninteger and duplicate quotes',()=>{
  for(const invalid of [offer(-140,'2026-11-03T01:00:00Z'),offer(-140,'2026-11-02T22:31:00Z'),offer(-140,'2026-11-02T22:29:00Z',{isOpeningOnly:true}),offer(-140,'2026-11-02T22:29:00Z',{line:25.5})]) assert.equal(quotes([[frame('2026-11-02T22:30:00Z',[invalid])]]).length,0)
  assert.equal(quotes([[frame('2026-11-02T23:00:00Z',[offer(-140,'2026-11-02T22:59:00Z')])]]).length,0)
  assert.equal(quotes([[frame('2026-11-02T22:30:00Z',[offer(-140,'2026-11-02T22:29:00Z'),offer(-150,'2026-11-02T22:29:00Z')])]]).length,0)
})
test('later partial frames never resurrect an absent old quote',()=>{const empty=frame('2026-11-02T22:30:00Z',[]);assert.equal(quotes([[empty,previous]]).length,0)})
test('without a withdrawal ledger a missing panel retains only its actual last-seen observation',()=>{const empty=frame('2026-11-02T22:30:00Z',[]);const [q]=nflOddsBoardQuotes('game',['SEA','CHI'],cutoff,[[empty,previous]],now,true);assert.equal(q.current,-110);assert.equal(q.updatedAt,'2026-11-02T21:29:00Z');assert.equal(q.previous,null)})
test('last seen chooses the freshest actual timestamp even across incomplete sources',()=>{const stale=frame('2026-11-02T22:30:00Z',[offer(-120,'2026-11-02T20:29:00Z')]);const empty=frame('2026-11-02T22:30:00Z',[]);const [q]=nflOddsBoardQuotes('game',['SEA','CHI'],cutoff,[[stale],[empty,previous]],now,true);assert.equal(q.current,-110);assert.equal(q.updatedAt,'2026-11-02T21:29:00Z');assert.equal(q.previous,-120)})
test('conflicting prices at the same source time are unavailable',()=>{const other=frame('2026-11-02T22:30:00Z',[offer(-150,'2026-11-02T22:29:00Z')]);assert.equal(quotes([[current],[other]]).length,0)})
test('small real probability changes remain directional even at very long prices',()=>{const move=nflOddsBoardMove(150000,170000);assert.ok(move!=null&&move>0&&move<0.01);assert.equal(nflOddsBoardMove(15000,15000),0)})
