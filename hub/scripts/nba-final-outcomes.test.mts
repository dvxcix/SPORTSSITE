import test from 'node:test'
import assert from 'node:assert/strict'
import { nbaFinalContractResult,nbaFinalLabel,nbaFinalOutcomes,nbaFinalStats,nbaVerifiedFinalGame } from '../src/lib/nbaFinalOutcomes'
import type { PaintGame,PaintStat } from '../src/lib/nbaPaint'
const game={id:1,date:'2026-11-02',season:2026,status:'Final',status_state:'final',datetime:'2026-11-02T23:00:00Z',period:4,home_team:{id:2},visitor_team:{id:3}} as PaintGame
const now=Date.parse('2026-11-03T03:00:00Z')
const gameRow={id:1,game_date:game.date,season:2026,home_team_id:2,visitor_team_id:3,payload:game,fetched_at:'2026-11-03T02:00:00Z'}
const stat={id:7,player:{id:9},team:{id:2},game:{id:1,date:game.date,status:'Final',status_state:'final',home_team_id:2,visitor_team_id:3,season:2026},min:'30:00',pts:22,reb:7,ast:4,fg3m:3,stl:1,blk:0,turnover:1,fga:10,fgm:7,fg3a:5,fta:5,ftm:5} as PaintStat
const row={id:7,game_id:1,player_id:9,team_id:2,game_date:game.date,season:2026,payload:stat,fetched_at:'2026-11-03T02:30:00Z'}
test('only a matching final game with a valid observation permits results',()=>{
  assert.equal(nbaVerifiedFinalGame(game,gameRow,now),true)
  assert.equal(nbaVerifiedFinalGame(game,{...gameRow,home_team_id:3},now),false)
  assert.equal(nbaVerifiedFinalGame(game,{...gameRow,fetched_at:'2026-11-04T00:00:00Z'},now),false)
  assert.equal(nbaVerifiedFinalGame(game,{...gameRow,payload:{...game,status:'Scheduled',status_state:'scheduled'}},now),false)
})
test('final statistics are exact and never enter opening-event outcomes',()=>{
  const rows=nbaFinalStats(game,[row],0,now)
  assert.deepEqual(nbaFinalOutcomes(game,rows,'points'),[{gameId:1,playerId:9,teamId:2,value:22}])
  assert.deepEqual(nbaFinalOutcomes(game,rows,'first_basket'),[])
  assert.deepEqual(nbaFinalOutcomes(game,rows,'points_first3min'),[])
})
test('unknown players, mismatched identities, times and DNP are omitted',()=>{
  for(const invalid of [
    {...row,team_id:3}, {...row,game_id:2}, {...row,player_id:10}, {...row,season:2025},
    {...row,fetched_at:'2026-11-02T22:59:59Z'}, {...row,fetched_at:'2026-11-04T00:00:00Z'},
    {...row,payload:{...stat,min:'0:00',pts:0,reb:0,ast:0,fg3m:0,stl:0,blk:0,turnover:0,fga:0,fgm:0,fg3a:0,fta:0,ftm:0}},
    {...row,payload:{...stat,game:{...stat.game,status:'Scheduled',status_state:'scheduled'}}}
  ]) assert.equal(nbaFinalStats(game,[invalid],0,now).length,0)
  assert.equal(nbaFinalStats(game,[row,row],0,now).length,0)
  assert.equal(nbaFinalStats(game,[],0,now).length,0)
})
test('Q1 comes only from a verified Q1 row and real zero is preserved',()=>{
  const q={...row,period:1,payload:{...stat,period:1,pts:0}}
  assert.deepEqual(nbaFinalOutcomes(game,nbaFinalStats(game,[q],1,now),'points_1q'),[{gameId:1,playerId:9,teamId:2,value:0}])
  assert.equal(nbaFinalStats(game,[row],1,now).length,0)
  assert.equal(nbaFinalStats(game,[q],0,now).length,0)
})

test('binary finals are displayed as Yes or No, not a percentage',()=>{assert.equal(nbaFinalLabel(1,'double_double'),'Yes');assert.equal(nbaFinalLabel(0,'double_double'),'No');assert.equal(nbaFinalLabel(22,'points'),'22')})

test('final result respects the actual selected side and exact contract',()=>{assert.equal(nbaFinalContractResult(20,'points',20,'milestone','over'),'Hit');assert.equal(nbaFinalContractResult(20,'points',20,'over_under','over'),'Push');assert.equal(nbaFinalContractResult(20,'points',20.5,'over_under','under'),'Hit');assert.equal(nbaFinalContractResult(1,'double_double',0.5,'over_under','under'),'Miss');assert.equal(nbaFinalContractResult(20,'points',20,'milestone','under'),null)})
