import test from 'node:test'
import assert from 'node:assert/strict'
import { nbaPregameLineups, nbaActualLineups, nbaArchivedLineup, NBA_LINEUP_SLOTS } from '../src/lib/nbaLineups.ts'
const team={id:1,abbreviation:'ATL',full_name:'Atlanta Hawks',name:'Hawks'}
const game={id:100,date:'2026-11-19',season:2026,status:'Scheduled',datetime:'2026-11-20T01:00:00Z',period:0,home_team:team,visitor_team:{...team,id:2},home_team_score:0,visitor_team_score:0}
const now=Date.parse('2026-11-20T02:00:00Z')
function projected(){return {id:9,game_id:100,team_id:1,status:'expected',updated_at:'2026-11-20T00:30:00Z',lineup:NBA_LINEUP_SLOTS.map((position,i)=>({position,player:{id:10+i,first_name:'Test',last_name:String(i),position:'F-C'}}))}}
test('immutable pre-tip projection remains expected after tip and exposes tonight slots, not career positions',()=>{
  const p=projected(),teams=nbaPregameLineups([p],game,now)
  assert.equal(teams[0].status,'expected');assert.equal(teams[0].source,'pregame')
  assert.deepEqual(teams[0].players.map(row=>row.position),NBA_LINEUP_SLOTS)
  assert.equal(teams[0].observedAt,'2026-11-20T00:30:00.000Z')
  assert.equal(nbaPregameLineups([{...p,status:'confirmed'}],game,now)[0].status,'confirmed')
})
test('wrong games/teams, post-tip/future updates, duplicate IDs and incomplete or duplicate slots fail closed',()=>{
  const p=projected()
  for(const bad of [{...p,game_id:101},{...p,team_id:3},{...p,updated_at:game.datetime},{...p,updated_at:'2026-11-20T03:00:00Z'},
    {...p,lineup:p.lineup.slice(1)},{...p,lineup:p.lineup.map(row=>({...row,position:'G'}))},{...p,lineup:p.lineup.map(row=>({...row,player:{...row.player,id:10}}))}])assert.deepEqual(nbaPregameLineups([bad],game,now),[])
  assert.deepEqual(nbaPregameLineups([p],game,Date.parse('2026-11-20T00:00:00Z')),[])
  assert.deepEqual(nbaPregameLineups([p,{...p,status:'confirmed'}],game,now),[])
})
test('archive preserves original observation and the earlier stored cutoff',()=>{
  const p=projected(),row={game_id:100,team_id:1,source_updated_at:'2026-11-20T00:30:00+00:00',cutoff_at:game.datetime,payload:p}
  assert.equal(nbaArchivedLineup(row,game,1,now)?.sourceId,9)
  assert.equal(nbaArchivedLineup({...row,cutoff_at:'2026-11-20T00:00:00Z'},game,1,now),null)
  assert.equal(nbaArchivedLineup(row,{...game,datetime:'2026-11-20T00:00:00Z'},1,now),null)
  assert.equal(nbaArchivedLineup({...row,source_updated_at:'2026-11-20T00:40:00Z'},game,1,now),null)
})
test('actual starters require five matching rows and use lineup-row positions without career fallback',()=>{
  const rows=projected().lineup.map((row,i)=>({id:i,game_id:100,team:{id:1},starter:true,position:i===0?'G':row.position,player:row.player}))
  assert.equal(nbaActualLineups(rows,game,now)[0].players[0].position,'G')
  assert.equal(nbaActualLineups(rows.map(row=>({...row,position:undefined})),game,now)[0].players[0].position,null)
  assert.deepEqual(nbaActualLineups(rows,game,Date.parse('2026-11-20T00:00:00Z')),[])
  assert.deepEqual(nbaActualLineups(rows.slice(1),game,now),[])
  assert.deepEqual(nbaActualLineups(rows.map(row=>({...row,game_id:101})),game,now),[])
})
