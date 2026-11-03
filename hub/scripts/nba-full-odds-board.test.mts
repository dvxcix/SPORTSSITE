import assert from 'node:assert/strict'
import test from 'node:test'
import { nbaBeforeCapture,nbaBoardMove,nbaBoardMoveLabel,nbaFullBoardCells,nbaLiveBoardQuotes,nbaPackFullBoard,nbaSelectPackedBoard,nbaUnpackFullBoard } from '../src/lib/nbaFullOddsBoard.ts'
import type { PaintProp } from '../src/lib/nbaPaint.ts'
import type { NbaQuoteOpeningRow } from '../src/lib/nbaOddsHistory.ts'

const current:PaintProp={id:1,game_id:12,player_id:4,vendor:'draftkings',prop_type:'points',line_value:'20',market:{type:'milestone',odds:150},updated_at:'2026-10-20T16:00:00Z'}
const opening:NbaQuoteOpeningRow={game_id:12,player_id:4,vendor:'draftkings',market:'points',market_type:'milestone',line:20,side:'over',odds:200,observed_at:'2026-10-20T14:00:00Z'}
const old:PaintProp={...current,market:{type:'milestone',odds:175},updated_at:'2026-10-20T15:00:00Z'}

test('Live accepts only actual quotes at or after the conservative cutoff and rejects malformed or early frames',()=>{
 const cutoff='2026-10-20T15:00:00.000001Z',frame='2026-10-20T16:00:00Z'
 const quotes=[old,{...old,updated_at:cutoff},{...current,updated_at:'2026-10-20T16:00:00.000001Z'},current]
 assert.deepEqual(nbaLiveBoardQuotes(quotes,frame,cutoff),[quotes[1],current])
 assert.deepEqual(nbaLiveBoardQuotes([],frame,cutoff),[],'complete withdrawal must not resurrect a prior quote')
 assert.throws(()=>nbaLiveBoardQuotes(quotes,'2026-10-20T14:59:59Z',cutoff))
 assert.throws(()=>nbaLiveBoardQuotes(quotes,frame,'invalid'))
 assert.deepEqual(nbaFullBoardCells(12,'points',[],[old],[]),[],'a withdrawn latest contract stays absent')
})

test('opening and previous compare exact same contract and real observation times',()=>{
  const [row]=nbaFullBoardCells(12,'points',[current],[old],[opening])
  assert.equal(row.opening?.odds,200);assert.equal(row.previous?.odds,175)
  assert.ok((nbaBoardMove(row,'opening')??0)>0);assert.ok((nbaBoardMove(row,'previous')??0)>0)
})
test('a repeated later capture does not hide the actual first-seen Live move',()=>{
  // A real saved OKC–CLE 10+ contract: an unchanged later frame should not
  // replace its separate, immutable Live first-observed price.
  const live:PaintProp={...current,game_id:21718012,player_id:1028027372,vendor:'fanduel',line_value:'10',market:{type:'milestone',odds:1400},updated_at:'2026-11-03T02:30:30.017Z'}
  const repeated:PaintProp={...live,updated_at:'2026-11-03T02:29:30.017Z'}
  const first:NbaQuoteOpeningRow={...opening,game_id:21718012,player_id:1028027372,vendor:'fanduel',line:10,odds:-310,observed_at:'2026-11-03T00:15:15.426684Z'}
  const [row]=nbaFullBoardCells(21718012,'points',[live],[repeated],[first],'2026-11-03T02:30:57.112939Z')
  assert.equal(nbaBoardMove(row,'previous'),0)
  assert.ok(Math.abs(nbaBoardMove(row,'opening')! - (-68.9430894308943)) < 1e-9)
  assert.equal(row.opening?.at,first.observed_at)
})
test('different game, player, book, market, rung, type or side cannot supply a baseline',()=>{
  const variants:NbaQuoteOpeningRow[]=[{...opening,game_id:13},{...opening,player_id:5},{...opening,vendor:'other'},{...opening,market:'rebounds'},{...opening,line:25},{...opening,market_type:'over_under'},{...opening,side:'under'}]
  const previous=[{...old,line_value:'25'},{...old,vendor:'other'},{...old,player_id:5},{...old,market:{type:'over_under' as const,over_odds:175}}]
  const [row]=nbaFullBoardCells(12,'points',[current],previous,variants)
  assert.equal(row.opening,null);assert.equal(row.previous,null);assert.equal(nbaBoardMove(row,'opening'),null)
})
test('first observation has no fabricated movement, while repeated unchanged odds are zero',()=>{
  const [first]=nbaFullBoardCells(12,'points',[current],[],[{...opening,odds:150,observed_at:current.updated_at}])
  assert.equal(first.opening?.odds,150);assert.equal(nbaBoardMove(first,'opening'),null);assert.equal(nbaBoardMove(first,'previous'),null)
  const [repeat]=nbaFullBoardCells(12,'points',[current],[{...old,market:{type:'milestone',odds:150}}],[{...opening,odds:150}])
  assert.equal(nbaBoardMove(repeat,'opening'),0);assert.equal(nbaBoardMove(repeat,'previous'),0)
  const [observed]=nbaFullBoardCells(12,'points',[current],[],[{...opening,odds:150,observed_at:'2026-10-20T16:01:00Z'}],'2026-10-20T16:01:00Z')
  assert.equal(observed.opening?.odds,150);assert.equal(nbaBoardMove(observed,'opening'),null)
  const [future]=nbaFullBoardCells(12,'points',[current],[],[{...opening,odds:150,observed_at:'2026-10-20T16:02:00Z'}],'2026-10-20T16:01:00Z')
  assert.equal(future.opening,null)
})
test('absent latest contracts, inconsistent same-time openings and ambiguous prices stay absent',()=>{
  assert.deepEqual(nbaFullBoardCells(12,'points',[],[old],[opening]),[])
  const [row]=nbaFullBoardCells(12,'points',[current],[],[{...opening,observed_at:current.updated_at}]);assert.equal(row.opening,null)
  assert.deepEqual(nbaFullBoardCells(12,'points',[current,{...current,market:{type:'milestone',odds:180}}],[],[]),[])
  assert.deepEqual(nbaFullBoardCells(12,'points',[current],[{...old,updated_at:current.updated_at}],[]),[])
  assert.deepEqual(nbaFullBoardCells(12,'points',[current],[{...old,updated_at:'2026-10-20T17:00:00Z'}],[]),[])
  assert.deepEqual(nbaFullBoardCells(12,'points',[{...current,line_value:''}],[],[]),[])
})
test('packed slate keeps exact timestamps and selects a book without copying other quotes',()=>{
  const cells=nbaFullBoardCells(12,'points',[{...current,updated_at:'2026-10-20T16:00:00.123456Z'},{...current,vendor:'other'}],[old],[opening])
  const packed=nbaPackFullBoard({date:'2026-10-20',games:[],players:[],cells,failed:[],unavailable:[],complete:true})
  const selected=nbaSelectPackedBoard(packed,'draftkings'),expanded=nbaUnpackFullBoard(selected,'points')
  assert.equal(expanded.cells.length,1);assert.equal(expanded.cells[0].current.at,'2026-10-20T16:00:00.123456Z');assert.equal(expanded.cells[0].opening?.at,opening.observed_at)
  assert.deepEqual(selected.books,['draftkings','other'])
})
test('a requested absent sportsbook does not silently receive another book',()=>{
  const cells=nbaFullBoardCells(12,'points',[current],[old],[opening])
  const packed=nbaPackFullBoard({date:'2026-10-20',games:[],players:[],cells,failed:[],unavailable:[],complete:true})
  const absent=nbaSelectPackedBoard(packed,'fanduel')
  assert.equal(absent.selectedBook,'fanduel');assert.deepEqual(absent.books,['draftkings']);assert.equal(absent.quotes.length,0)
  assert.equal(nbaUnpackFullBoard(absent,'points').cells.length,0)
  assert.equal(nbaSelectPackedBoard(packed,'draftkings').quotes.length,1)
})
test('packed responses reject malformed indexes, duplicate contracts and excessive dimensions',()=>{
  const [cell]=nbaFullBoardCells(12,'points',[current],[old],[opening])
  const make=()=>nbaPackFullBoard({date:'2026-10-20',games:[],players:[],cells:[cell],failed:[],unavailable:[],complete:true})
  const badTime=make();badTime.quotes[0][4]=999;assert.throws(()=>nbaUnpackFullBoard(badTime,'points'))
  const badPrefix=make();badPrefix.times[0][0]=999;assert.throws(()=>nbaUnpackFullBoard(badPrefix,'points'));assert.throws(()=>nbaSelectPackedBoard(badPrefix,'draftkings'))
  const badBook=make();badBook.quotes[0][1]=-1;assert.throws(()=>nbaUnpackFullBoard(badBook,'points'))
  const badPlayer=make();badPlayer.quotes[0][0]=999;assert.throws(()=>nbaUnpackFullBoard(badPlayer,'points'))
  const duplicate=make();duplicate.quotes.push([...duplicate.quotes[0]]);assert.throws(()=>nbaUnpackFullBoard(duplicate,'points'))
  const excessive=make();excessive.quotes=Array.from({length:12001},()=>[...excessive.quotes[0]]);assert.throws(()=>nbaUnpackFullBoard(excessive,'points'))
  const badChronology=make();badChronology.quotes[0][8]=badChronology.quotes[0][4];assert.throws(()=>nbaUnpackFullBoard(badChronology,'points'))
})
test('same-millisecond observations keep their exact predecessor and compare correctly',()=>{
  assert.equal(nbaBeforeCapture('2026-10-20T16:00:00.123456+00:00'),'2026-10-20T16:00:00.123455Z')
  assert.equal(nbaBeforeCapture('2026-10-20T16:00:00.123456789Z'),null)
  const latest={...current,updated_at:'2026-10-20T16:00:00.123456Z'},prior={...old,updated_at:'2026-10-20T16:00:00.123400Z'}
  const [cell]=nbaFullBoardCells(12,'points',[latest],[prior],[])
  assert.equal(cell.previous?.at,prior.updated_at);assert.ok((nbaBoardMove(cell,'previous')??0)>0)
})
test('a small real long-odds move is not displayed as zero',()=>{
  const [row]=nbaFullBoardCells(12,'points',[{...current,market:{type:'milestone',odds:120000}}],[],[{...opening,odds:150000}])
  const change=nbaBoardMove(row,'opening');assert.ok(change!=null&&change>0);assert.equal(nbaBoardMoveLabel(change),'+<0.1 pp');assert.equal(nbaBoardMoveLabel(0),'0.0 pp')
})
