import test from 'node:test'
import assert from 'node:assert/strict'
import { nflOddsBoardPicks, nflFilterPickLadder, nflUniqueBoardPicks, type NflBoardPick } from '../src/lib/nflOddsBoardPicks'
import { fitNflGamePicks, fitNflResponsePicks } from '../src/lib/nflOddsBoardBudget'
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
test('a quote later than its source frame cannot influence the Props ladder anchor',()=>{
 const p=player(), altered={...p,markets:p.markets.map(m=>m.line===4?{...m,offers:m.offers.map(o=>({...o,updatedAt:'2026-11-04T20:31:00.000Z'}))}:m)}
 const safe=nflFilterPickLadder(board(altered),'2026-11-04T20:30:00.000Z',cutoff,now)!
 assert.equal(safe.players[0].markets.some(m=>m.line===4),false)
 assert.deepEqual(nflOddsBoardPicks('game',['SEA','CHI'],safe,cutoff,now).map(row=>[row[5],row[6]]),[...estimateLadderPicks(safe.players[0],'receptions','fanduel')].map(([key,count])=>[Number(key.split(':')[1]),count]))
 assert.equal(nflFilterPickLadder(board(altered),cutoff,cutoff,now),null)
})
test('optional picks are shed before prices at both game and response size boundaries',()=>{
 const quote=['saved-price'], identities=['saved-player'], picks:NflBoardPick[]=[['game',1,'SEA','receptions','fanduel',5,100,true]]
 const without=Buffer.byteLength(JSON.stringify([quote,[],identities])), withPicks=Buffer.byteLength(JSON.stringify([quote,picks,identities]))
 assert.ok(withPicks>without);const game=fitNflGamePicks(quote,picks,identities,without);assert.deepEqual(game.picks,[]);assert.equal(game.bytes,without)
 const response={quotes:quote,picks}, limit=Buffer.byteLength(JSON.stringify({...response,picks:[]}))
 assert.deepEqual(fitNflResponsePicks(response,limit),{quotes:quote,picks:[]});assert.deepEqual(fitNflResponsePicks(response,withPicks+100),response)
})
