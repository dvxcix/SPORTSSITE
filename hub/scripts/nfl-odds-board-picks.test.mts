import test from 'node:test'
import assert from 'node:assert/strict'
import { nflOddsBoardPicks, nflFilterPickLadder, nflUniqueBoardPicks, type NflBoardPick } from '../src/lib/nflOddsBoardPicks'
import { fitNflResponsePicks, packNflBoardPicks, unpackNflBoardPicks } from '../src/lib/nflOddsBoardBudget'
import { estimateLadderPicks } from '../src/lib/nflLadders'
import type { NflOddsPlayer, SidelineOddsBoard } from '../src/lib/nflOddsTypes'

const capturedAt='2026-11-04T20:00:00.000Z', cutoff='2026-11-05T01:00:00.000Z', now=Date.parse('2026-11-04T21:00:00.000Z')
const player=():NflOddsPlayer=>({id:1,name:'Receiver',team:'SEA',position:'WR',publicPicks:[{propType:'receptions',label:'Receptions',rawMarket:'Receptions',picks:1000,capturedAt}],markets:[2,3,4,5,6,7,8].map(line=>({key:`receptions:${line}`,propType:'receptions',category:'receiving',label:'Receptions',line,offers:[{vendor:'fanduel',line,openingLine:line,type:line===4?'over_under':'milestone',current:line===4?{over:-110,under:-110}:{odds:line*100},opening:null,updatedAt:capturedAt}]}))})
const board=(p=player()):SidelineOddsBoard=>({bdlGameId:1,status:'ready',capturedAt,source:'snapshot',gameLines:[],picksCapturedAt:capturedAt,players:[p]})

test('milestone estimates equal Props full ladder allocation, including the over/under anchor',()=>{
 const p=player(), expected=estimateLadderPicks(p,'receptions','fanduel')
 const rows=nflOddsBoardPicks('game',['SEA','CHI'],board(p),cutoff,now)
 assert.deepEqual(rows.map(row=>[row[5],row[6],row[7]]),[2,3,5,6,7,8].map(line=>[line,expected.get(`receptions:${line}`),true]))
 assert.ok(rows.find(row=>row[5]===5)![6]>rows.find(row=>row[5]===6)![6])
})
test('exact contract count overrides estimates and real zero stays zero',()=>{
 const p=player();p.publicPicks!.push({propType:'receptions',label:'5+',rawMarket:'5+',picks:0,capturedAt,line:5,side:'over',kind:'milestone'})
 const row=nflOddsBoardPicks('game',['SEA','CHI'],board(p),cutoff,now).find(item=>item[5]===5)
 assert.deepEqual(row,['game',1,'SEA','receptions','fanduel',5,0,false])
})
test('missing counts, wrong team, duplicate player, stale mismatched picks and post-tip timestamps do not invent estimates',()=>{
 const p=player();assert.deepEqual(nflOddsBoardPicks('game',['SEA','CHI'],board({...p,publicPicks:[]}),cutoff,now),[])
 assert.deepEqual(nflOddsBoardPicks('game',['NYJ','CHI'],board(p),cutoff,now),[])
 assert.deepEqual(nflOddsBoardPicks('game',['SEA','CHI'],{...board(p),players:[p,p]},cutoff,now),[])
 assert.deepEqual(nflOddsBoardPicks('game',['SEA','CHI'],board({...p,publicPicks:p.publicPicks!.map(item=>({...item,capturedAt:'2026-11-04T20:01:00.000Z'}))}),cutoff,now),[])
 assert.deepEqual(nflOddsBoardPicks('game',['SEA','CHI'],{...board(p),picksCapturedAt:cutoff},cutoff,now),[])
 assert.deepEqual(nflOddsBoardPicks('game',['SEA','CHI'],board({...p,publicPicks:p.publicPicks!.map(item=>({...item,picks:10000001}))}),cutoff,now),[])
 assert.deepEqual(nflOddsBoardPicks('game',['SEA','CHI'],board({...p,markets:p.markets.map(m=>({...m,offers:m.offers.map(o=>({...o,updatedAt:cutoff}))}))}),cutoff,now),[])
})
test('duplicate cached rung identities are omitted, never silently chosen',()=>{
 const row:NflBoardPick=['game',1,'SEA','receptions','fanduel',5,10,true]
 assert.deepEqual(nflUniqueBoardPicks([row,[...row],['game',1,'SEA','receptions','fanduel',6,0,false]]),[['game',1,'SEA','receptions','fanduel',6,0,false]])
})
test('only a unique named scorer count can populate a scorer row', () => {
  const p = player()
  const scorer = { propType: 'anytime_td', label: 'Anytime touchdown', rawMarket: 'Anytime TD Scorer', picks: 18, capturedAt }
  p.markets = [{
    key: 'anytime_td:0.5', propType: 'anytime_td', category: 'touchdowns', label: scorer.label, line: 0.5,
    offers: [{ vendor: 'fanduel', type: 'milestone', line: 0.5, openingLine: 0.5, current: { odds: 200 }, opening: null, updatedAt: capturedAt }],
  }]
  p.publicPicks = [{ ...scorer, rawMarket: 'TDs', picks: 30 }]
  const counts = () => nflOddsBoardPicks('game', ['SEA', 'CHI'], board(p), cutoff, now)
  assert.deepEqual(counts(), [])
  p.publicPicks.push(scorer)
  assert.deepEqual(counts(), [['game', 1, 'SEA', 'anytime_td', 'fanduel', 0.5, 18, false]])
  p.publicPicks.push({ ...scorer, picks: 22 })
  assert.deepEqual(counts(), [])
})
test('a quote later than its source frame cannot influence the Props ladder anchor',()=>{
 const p=player(), altered={...p,markets:p.markets.map(m=>m.line===4?{...m,offers:m.offers.map(o=>({...o,updatedAt:'2026-11-04T20:31:00.000Z'}))}:m)}
 const safe=nflFilterPickLadder(board(altered),'2026-11-04T20:30:00.000Z',cutoff,now)!
 assert.equal(safe.players[0].markets.some(m=>m.line===4),false)
 assert.deepEqual(nflOddsBoardPicks('game',['SEA','CHI'],safe,cutoff,now).map(row=>[row[5],row[6]]),[...estimateLadderPicks(safe.players[0],'receptions','fanduel')].map(([key,count])=>[Number(key.split(':')[1]),count]))
 assert.equal(nflFilterPickLadder(board(altered),cutoff,cutoff,now),null)
})
test('full-slate cache keeps all game prices, with exact and estimated counts keyed to the saved quote', () => {
  const quotes = Array.from({ length: 13 }, (_, game) => Array.from({ length: 1800 }, (_, index) => [
    `2026_09_GAME_${game}`, index + 1, 'Saved Player', 'SEA', 'WR', 'receiving_yards', 'fanduel', 25,
    -140, '2026-11-08T17:59:00.000Z', -110, '2026-11-08T17:55:00.000Z', 150, false,
  ] as const)).flat()
  const picks: NflBoardPick[] = quotes.map(q => [q[0], q[1], q[3], q[5], q[6], q[7], 42, q[1] !== 1])
  const pool = { quotes, picks, identities: [] }
  const limit = 4 * 1024 * 1024
  assert.ok(Buffer.byteLength(JSON.stringify(pool)) > limit)
  const packed = packNflBoardPicks(pool, limit)
  assert.equal(packed.quotes, quotes)
  assert.ok(Buffer.byteLength(JSON.stringify(packed)) <= limit)
  const restored = unpackNflBoardPicks(packed.quotes, packed.pickCounts)
  assert.equal(restored.length, picks.length)
  assert.deepEqual(restored, picks)
  assert.deepEqual(unpackNflBoardPicks(quotes, [[quotes.length, 9, false]]), [])
  const onlyExact = picks.filter(pick => !pick[7])
  const exactLimit = Buffer.byteLength(JSON.stringify(packNflBoardPicks({ ...pool, picks: onlyExact }, limit)))
  assert.deepEqual(unpackNflBoardPicks(quotes, packNflBoardPicks(pool, exactLimit).pickCounts), onlyExact)
})
test('the final response size guard sheds optional counts before saved prices', () => {
  const response = { quotes: ['saved-price'], picks: [['game',1,'SEA','receptions','fanduel',5,100,true]] as NflBoardPick[] }
  const limit = Buffer.byteLength(JSON.stringify({ ...response, picks: [] }))
  assert.deepEqual(fitNflResponsePicks(response, limit), { ...response, picks: [] })
  assert.deepEqual(fitNflResponsePicks(response, limit + 100), response)
})
