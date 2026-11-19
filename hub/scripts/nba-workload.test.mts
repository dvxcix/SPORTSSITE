import test from 'node:test'
import assert from 'node:assert/strict'
import { nbaWorkload, nbaWorkloadBoard, nbaWorkloadGap } from '../src/lib/nbaWorkload.ts'
import type { PaintBoard, PaintPlayer, PaintStat } from '../src/lib/nbaPaint.ts'
import type { NbaTrackingRow } from '../src/lib/nbaTracking.ts'
const team={id:1,abbreviation:'AAA',full_name:'Team A',name:'A'}
const game={id:100,date:'2026-11-19',season:2026,status:'Scheduled',datetime:'2026-11-20T01:00:00Z',period:0,home_team:team,visitor_team:{...team,id:2},home_team_score:0,visitor_team_score:0}
function player(id=1):PaintPlayer{
 const logs:PaintStat[]=Array.from({length:7},(_,i)=>({id:10+i,player:{id},team:{id:1},
  game:{id:10+i,date:`2026-11-${String(18-i).padStart(2,'0')}`,season:2026,status:'Final',status_state:'final',home_team_id:1,visitor_team_id:2},
  min:'30:00',pts:10,reb:3,ast:2,fg3m:2,fg3a:i<2?8:4,fga:i<2?20:10,fta:0,fgm:4,ftm:0,stl:0,blk:0,turnover:0}))
 return {id,first_name:'Test',last_name:String(id),position:'G',team,headshot:null,injury:null,average:{},averageSeason:2026,logs,props:[]}
}
function tracking(p:PaintPlayer):NbaTrackingRow[]{return p.logs.map((l,i)=>({id:l.id,playerId:p.id,teamId:1,gameId:l.game.id,values:{rebound_chances_total:i<2?12:6,passes:i<2?40:20}}))}
function board(players:PaintPlayer[]):PaintBoard{return {game,players,statsComplete:true,sampleSeason:2026,sampleEnd:'2026-11-18',historical:false,fetchedAt:'2026-11-19T20:00:00Z',issues:[]}}

test('workload uses independent prior conversion and last two opportunities in each core market',()=>{
 const p=player(),t=tracking(p)
 assert.equal(nbaWorkload(p,'points',game,t).estimate,20)
 assert.equal(nbaWorkload(p,'threes',game,t).estimate,4)
 assert.equal(nbaWorkload(p,'rebounds',game,t).estimate,6)
 const a=nbaWorkload(p,'assists',game,t)
 assert.equal(a.estimate,4);assert.equal(a.proxy,true);assert.equal(a.opportunityLabel,'Passes (proxy)')
 assert.equal(a.priorGames,5);assert.equal(a.recentGames,2)
})
test('missing tracking stays unavailable; explicit zero opportunities stay zero',()=>{
 const p=player(),t=tracking(p)
 assert.equal(nbaWorkload(p,'rebounds',game,t.slice(1)).status,'unavailable')
 const zero=t.map((r,i)=>i<2?{...r,values:{...r.values,rebound_chances_total:0}}:r)
 assert.equal(nbaWorkload(p,'rebounds',game,zero).estimate,0)
 assert.equal(nbaWorkload(p,'rebounds',game,[]).estimate,null)
})
test('target/future games, prior seasons, old teams and conflicting tracking never enter workload',()=>{
 const p=player(),t=tracking(p),before=nbaWorkload(p,'rebounds',game,t)
 const dirty=structuredClone(p)
 dirty.logs.push({...p.logs[0],id:999,pts:999,reb:999,game:{...p.logs[0].game,id:100,date:'2026-11-19'}})
 dirty.logs.push({...p.logs[0],id:998,reb:999,game:{...p.logs[0].game,id:998,date:'2026-11-20'}})
 dirty.logs.push({...p.logs[0],id:997,reb:999,game:{...p.logs[0].game,id:997,season:2025,date:'2026-11-18'}})
 dirty.logs.push({...p.logs[0],id:996,reb:999,team:{id:2},game:{...p.logs[0].game,id:996,date:'2026-11-18'}})
 assert.deepEqual(nbaWorkload(dirty,'rebounds',game,t),before)
 const conflict=[...t,{...t[0],id:999,values:{rebound_chances_total:99}}]
 assert.equal(nbaWorkload(p,'rebounds',game,conflict).status,'unavailable')
})
test('current game outcomes cannot change same captured pregame workload',()=>{
 const p=player(),original=nbaWorkloadBoard(board([p]),tracking(p))
 const b=board([p]);b.game={...game,status:'Final',home_team_score:150,visitor_team_score:140}
 assert.deepEqual(nbaWorkloadBoard(b,tracking(p)),original)
})
test('team comparison uses all available teammates and excludes confirmed out players',()=>{
 const a=player(),b=player(2);b.logs=b.logs.map((l,i)=>i<2?{...l,fga:l.fga!*2}:l)
 const c=player(3);c.injury={status:'Out',description:'Unavailable'};c.logs=c.logs.map(l=>({...l,pts:1000}))
 const result=nbaWorkloadBoard(board([a,b,c]),[...tracking(a),...tracking(b),...tracking(c)]).filter(x=>x.market==='points')
 assert.equal(result[0].teamPool,2);assert.equal(result[0].teamRank,2);assert.equal(result[1].teamRank,1)
 assert.ok(Math.abs(result[0].teamShare!+result[1].teamShare!-1)<1e-10);assert.equal(result[2].teamShare,null)
})
test('same-game duplicate rows are not additional evidence and invalid dates fail closed',()=>{
 const p=player();p.logs.push({...p.logs[0],id:999})
 assert.equal(nbaWorkload(p,'threes',game).sampleGameIds.length,7)
 assert.equal(nbaWorkload(p,'threes',{...game,date:'2026-02-30'}).estimate,null)
 assert.equal(nbaWorkload(p,'points_1q',game).status,'unsupported')
})
test('exact target gap preserves over/under direction without implying a probability',()=>{
 const w=nbaWorkload(player(),'points',game)
 assert.equal(nbaWorkloadGap(w,15),5);assert.equal(nbaWorkloadGap(w,15,'under'),-5)
 assert.equal(nbaWorkloadGap(w,Infinity),null);assert.equal(nbaWorkloadGap(null,15),null)
})

