import test from 'node:test'
import assert from 'node:assert/strict'
import { nbaScoreWorkloads, nbaScoreNeedsTracking } from '../src/lib/nbaScoreWorkload.ts'
import { nbaGamePace, nbaSlipSurgeScore } from '../src/lib/nbaIntelligence.ts'
import { nbaMatrixCandidates } from '../src/lib/nbaMatrix.ts'
import { nbaSlateRows } from '../src/lib/nbaSlate.ts'
import type { PaintBoard, PaintPlayer } from '../src/lib/nbaPaint.ts'
import type { NbaTrackingRow } from '../src/lib/nbaTracking.ts'
const team={id:1,abbreviation:'ATL',full_name:'Atlanta Hawks',name:'Hawks'}
const game={id:100,date:'2026-11-19',season:2026,status:'Scheduled',datetime:'2026-11-20T01:00:00Z',period:0,home_team:team,visitor_team:{...team,id:2},home_team_score:0,visitor_team_score:0}
function player(id=1):PaintPlayer {
  return {id,first_name:'Test',last_name:String(id),position:'G',team,headshot:null,injury:null,average:{},averageSeason:2026,
    logs:Array.from({length:20},(_,i)=>({id:id*100+i,player:{id},team:{id:1},game:{id:1000+i,date:`2026-10-${String(30-i).padStart(2,'0')}`,season:2026,status:'Final',status_state:'final',home_team_id:1,visitor_team_id:2},min:i<2?'36':'30',pts:20,reb:8,ast:5,fg3m:2,fg3a:i<2?10:6,fga:i<2?25:18,fta:0,fgm:8,ftm:0,stl:0,blk:0,turnover:0})),
    props:['points','rebounds','assists','threes','double_double'].map((market,i)=>({id:id*100+i,game_id:game.id,player_id:id,vendor:'fanduel',prop_type:market,line_value:'10',market:{type:'milestone',odds:100},updated_at:'2026-11-19T20:00:00Z'}))}
}
const tracking=(p:PaintPlayer):NbaTrackingRow[]=>p.logs.map((l,i)=>({id:l.id,playerId:p.id,teamId:1,gameId:l.game.id,values:{rebound_chances_total:i<2?10:16,passes:i<2?60:40}}))
const board=(players:PaintPlayer[]):PaintBoard=>({game,players,statsComplete:true,sampleSeason:2026,sampleEnd:'2026-11-18',historical:false,fetchedAt:'2026-11-19T20:00:00Z',issues:[],teamStatsSeason:2026})
test('workload changes the existing score, with independent market-specific inputs and unchanged six weights',()=>{
  const p=player(),prepared=nbaScoreWorkloads(board([p]),tracking(p)),scores=['points','rebounds','assists','threes'].map(market=>{
    const key=market as 'points',plain=nbaSlipSurgeScore(p,key,game.date),signal=nbaSlipSurgeScore(p,key,game.date,null,null,undefined,prepared.get(p.id,key))
    assert.deepEqual(signal.parts.map(row=>row.weight),[.35,.20,.20,.10,.10,.05]);assert.notEqual(signal.baseScore,plain.baseScore)
    assert.equal(signal.baseScore,signal.score);assert.equal(signal.beforeWorkload,plain.baseScore)
    return signal.score
  })
  assert.ok(new Set(scores).size>=3)
  assert.ok(prepared.get(p.id,'rebounds').opportunityFactor!<1)
  assert.ok(prepared.get(p.id,'assists').opportunityFactor!>1)
})
test('binary and combo scores use their constituent workloads; missing tracking is never invented',()=>{
  const p=player(),prepared=nbaScoreWorkloads(board([p]),tracking(p))
  assert.equal(prepared.get(p.id,'double_double').components.length,3)
  assert.equal(prepared.get(p.id,'double_double').status,'available')
  assert.notEqual(prepared.get(p.id,'points_rebounds').opportunityFactor,prepared.get(p.id,'points_assists').opportunityFactor)
  const missing=nbaScoreWorkloads(board([p]),[]).get(p.id,'double_double')
  assert.equal(missing.status,'partial');assert.equal(missing.opportunityFactor,null)
  assert.equal(prepared.get(p.id,'points_1q').status,'unsupported')
  assert.equal(nbaScoreNeedsTracking('points'),false);assert.equal(nbaScoreNeedsTracking('double_double'),true)
})
test('confirmed new absences affect the full-roster pool, questionable does not and already absorbed absences are not doubled',()=>{
  const a=player(),b=player(2),t=[...tracking(a),...tracking(b)]
  b.injury={status:'Questionable',description:''}
  assert.equal(nbaScoreWorkloads(board([a,b]),t).get(a.id,'points').availabilityFactor,1)
  b.injury.status='Out'
  assert.equal(nbaScoreWorkloads(board([a,b]),t).get(a.id,'points').availabilityFactor,1.25)
  assert.equal(nbaScoreWorkloads(board([a,b]),t).get(b.id,'points').unavailablePlayer,true)
  const signal=nbaSlipSurgeScore(b,'points',game.date,null,null,undefined,nbaScoreWorkloads(board([a,b]),t).get(b.id,'points'))
  assert.equal(signal.score,null);assert.match(signal.unavailableReason!,/Out/)
  b.logs=b.logs.slice(2)
  assert.equal(nbaScoreWorkloads(board([a,b]),t).get(a.id,'points').availabilityFactor,1)
  const incomplete={...board([a,b]),issues:['Injury coverage incomplete']}
  assert.equal(nbaScoreWorkloads(incomplete,t).get(a.id,'points').availabilityFactor,null)
})
test('score pools are independent of selected contracts and table filtering',()=>{
  const a=player(),b=player(2);b.injury={status:'Out',description:''}
  const full=board([a,b]),prepared=nbaScoreWorkloads(full,[...tracking(a),...tracking(b)])
  const all=nbaSlateRows([full],'points','fanduel','over',true,[],[],[],undefined,new Map([[game.id,prepared]]))
  const selected=nbaSlateRows([{...full,players:[a]}],'points','fanduel','over',true,[],[],[],undefined,new Map([[game.id,prepared]]))
  assert.equal(all.find(row=>row.player.id===a.id)!.score,selected[0].score)
  const factor={id:'s',category:'score' as const,field:'index',operator:'gte' as const,value:0,window:'l10' as const,vendor:'fanduel',propType:'points',marketValue:null}
  const candidate=nbaMatrixCandidates(full,{tracking:[...tracking(a),...tracking(b)]}).find(row=>row.id===String(a.id))
  // Matrix candidate IDs are numeric in older saved definitions.
  const actual=candidate??nbaMatrixCandidates(full,{tracking:[...tracking(a),...tracking(b)]}).find(row=>Number(row.id)===a.id)
  assert.ok(actual)
  assert.equal(actual!.values(factor),all.find(row=>row.player.id===a.id)!.score)
})
test('valid frozen pace survives tip; wrong-season or post-tip observations remain unavailable',()=>{
  const b={...board([player()]),historical:true,teamStats:[{team,stats:{pace:104}},{team:game.visitor_team,stats:{pace:100}}],researchSnapshot:{observedAt:'2026-11-19T20:00:00Z',source:'capture' as const,frozen:true}}
  assert.equal(nbaGamePace(b),102)
  assert.equal(nbaGamePace({...b,teamStatsSeason:2025}),null)
  assert.equal(nbaGamePace({...b,researchSnapshot:{...b.researchSnapshot,observedAt:'2026-11-20T02:00:00Z'}}),null)
  assert.equal(nbaGamePace({...b,researchSnapshot:undefined}),null)
})
