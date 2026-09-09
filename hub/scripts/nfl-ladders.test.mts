import test from 'node:test'
import assert from 'node:assert/strict'
import { estimateLadderPicks, ladderMatrixValue, contractPicks } from '../src/lib/nflLadders'
import { validateNflMatrixDefinition, type NflMatrixFactor } from '../src/lib/nflMatrix'
import type { NflOddsPlayer } from '../src/lib/nflOddsTypes'
import { packSidelineBoard, unpackSidelineBoard } from '../src/lib/sidelineWire'
import type { SidelineOddsBoard } from '../src/lib/nflOddsTypes'
test('wire format preserves every contract and null through JSON transport',()=>{
 const board={players:Array.from({length:20},(_,id)=>({...player(),id})),capturedAt:null} as unknown as SidelineOddsBoard
 const packed=packSidelineBoard(board)
 assert.deepEqual(unpackSidelineBoard(JSON.parse(JSON.stringify(packed))),board)
 assert.ok(JSON.stringify(packed).length<JSON.stringify(board).length)
 assert.equal(unpackSidelineBoard(board),board)
})
const player=():NflOddsPlayer=>({id:1,name:'Receiver',team:'SEA',position:'WR',publicPicks:[{propType:'receptions',label:'Receptions',rawMarket:'Receptions',picks:1000,capturedAt:'2026-09-09'}],markets:[2,3,4,5,6,7,8].map(line=>({key:'receptions:'+line,propType:'receptions',category:'receiving',label:'Receptions',line,offers:[{vendor:'fanduel',line,openingLine:line,type:line===4?'over_under':'milestone',current:line===4?{over:-110,under:-110}:{odds:line*100},opening:line===4?{over:-120,under:100}:{odds:line*100+50},updatedAt:'2026-09-09'}]}))})
test('estimated distribution conserves observed total and decreases above primary',()=>{
 const p=player(),estimated=estimateLadderPicks(p,'receptions','fanduel')
 assert.equal([...estimated.values()].reduce((a,b)=>a+b,0),1000)
 assert.equal(estimated.get('receptions:4'),600)
 assert.ok(estimated.get('receptions:5')!>=estimated.get('receptions:6')!)
 assert.ok(estimated.get('receptions:6')!>=estimated.get('receptions:7')!)
 assert.deepEqual(estimateLadderPicks(p,'receptions','fanduel'),estimated)
 assert.equal(estimateLadderPicks({...p,publicPicks:[]},'receptions','fanduel').size,0)
})
test('observed rung counts are not overwritten or counted twice',()=>{
 const p=player();p.publicPicks!.push({propType:'receptions',label:'5+',rawMarket:'5+',picks:80,capturedAt:'today',line:5,side:'over',kind:'milestone'})
 const estimated=estimateLadderPicks(p,'receptions','fanduel')
 assert.equal(estimated.has('receptions:5'),false)
 assert.equal([...estimated.values()].reduce((a,b)=>a+b,0)+80,1000)
 assert.equal(contractPicks(p,'receptions',5,'under','milestone'),null)
})
test('matrix preserves exact contract, side and estimate opt-in through validation',()=>{
 const factor:NflMatrixFactor={id:'a',category:'market',field:'market',operator:'gte',value:1,window:'season',vendor:'fanduel',propType:'receptions',marketValue:'current',marketLine:4,marketKind:'over_under',marketSide:'under'}
 const validated=validateNflMatrixDefinition('classic',{factors:[factor]})!.factors![0]
 assert.equal(ladderMatrixValue(player(),validated),-110)
 assert.equal(ladderMatrixValue(player(),{...factor,marketLine:99}),null)
 assert.equal(ladderMatrixValue(player(),{...factor,marketValue:'estimated_picks'}),null)
 assert.equal(ladderMatrixValue(player(),{...factor,marketSide:'over',marketValue:'estimated_picks'}),600)
 const p=player();p.markets[2].offers[0].openingLine=3.5
 assert.equal(ladderMatrixValue(p,{...factor,marketValue:'move'}),null)
 assert.equal(ladderMatrixValue(p,{...factor,marketValue:'probability_move'}),null)
})
