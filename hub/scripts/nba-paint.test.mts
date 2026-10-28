import * as publicControl from '../src/lib/nbaPublicCaptureControl.ts'
import * as oddsMode from '../src/lib/nbaOddsMode.ts'
import * as primaryProps from '../src/lib/nbaPrimaryProps.ts'
import * as milestoneSignals from '../src/lib/nbaMilestoneSignals.ts'
import * as firstMarkets from '../src/lib/nbaFirstBasketMarkets.ts'
import * as marketSelection from '../src/lib/nbaMarketSelection.ts'
import * as publicEventIdentity from '../src/lib/nbaPublicEventIdentity.ts'
import * as crypto from 'node:crypto'
import { nbaOpeningSequence, nbaFirstBasketResearch } from '../src/lib/nbaFirstBasket.ts'
import { nbaMilestoneMovements } from '../src/lib/nbaMovement.ts'
import assert from 'node:assert/strict'
import test from 'node:test'
import { hasNbaAccess } from '../src/lib/nbaAccessPolicy.ts'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import { nbaPeriod, nbaTarget, nbaMarketLogs, nbaPrice, gradeNbaValue, nbaAverage, nbaDate, nbaHitRate, nbaMinutes, nbaName, nbaReference, nbaSample, nbaSelectionKey, nbaValue, parseNbaSelection, nbaWeightedRank, nbaTeamLogo, type PaintPlayer, type PaintStat, type PaintProp } from '../src/lib/nbaPaint.ts'
import { gradeNbaPick } from '../src/lib/nbaPickGrading.ts'
import type { WatchlistItem } from '../src/lib/watchlist.ts'
import { watchlistPickPayload } from '../src/lib/nflWatchlist.ts'
import { nbaMarketRanks } from '../src/lib/nbaMarketMetrics.ts'
import { nbaEconomicSnapshot,nbaMovement } from '../src/lib/nbaMovement.ts'
import { nbaAttachOpenings, nbaGameEconomicSnapshot } from '../src/lib/nbaOddsHistory.ts'
import { nbaCheatsheet,nbaRole } from '../src/lib/nbaResearch.ts'
import { nbaPublicEventMatches,nbaPublicMarket,normalizeNbaPublic } from '../src/lib/nbaPublic.ts'
import { nbaDefenseProfiles,nbaProductionEstimate,nbaSlipSurgeScore,nbaWalkForward } from '../src/lib/nbaIntelligence.ts'
import { nbaShots,type NbaPlay } from '../src/lib/nbaShots.ts'
import { nbaDivergences } from '../src/lib/nbaDivergence.ts'
import { nbaSlateRows } from '../src/lib/nbaSlate.ts'
import {nbaTrackingRow,nbaTrackingSample,nbaTrackingField} from '../src/lib/nbaTracking.ts'
import { nbaValidatedEstimate,type NbaModelReport } from '../src/lib/nbaModel.ts'
const cachePassthrough={nbaSharedCache:async(_key:string,_ttl:number,_stale:number,load:()=>Promise<unknown>)=>({value:await load(),fetchedAt:new Date().toISOString(),stale:false})}
const unpostedFirstBasket={getNbaFirstOddsForMode:async()=>({rows:[],unmatched:0,eventMatched:false}),getNbaFirstEvents:async()=>[],getNbaFirstOdds:async()=>({rows:[],unmatched:0,eventMatched:false})}
const emptyOpeningImports={'./nbaOddsHistory':{nbaAttachOpenings},'./nbaOddsHistoryData':{getNbaQuoteOpenings:async()=>[]}}
const supplementalProps={nbaSupplementalQuote: (quote: { id: number }) => quote.id <= -1_000_000_000_000, getNbaSupplementalProps:async()=>({props:[],complete:true,accepted:0,unmatched:0,stale:0,eventMatched:true,applicable:true,observedAt:new Date().toISOString(),quota:null}),nbaMergePropSources:(primary:PaintProp[],supplemental:PaintProp[])=>[...primary,...supplemental]}
const propSnapshot=(props:PaintProp[])=>({props,complete:true,coverage:{complete:true,accepted:0,unmatched:0,stale:0,eventMatched:true,applicable:true,observedAt:new Date().toISOString()},issues:[]})
function gameQuote(gameId:number):import('../src/lib/nbaPaint.ts').PaintGameOdds{return{id:gameId+1000,game_id:gameId,vendor:'fanduel',moneyline_home_odds:-140,moneyline_away_odds:120,spread_home_value:'-3.5',spread_away_value:'3.5',total_value:'215.5',updated_at:new Date().toISOString()}}

test('validated NBA estimates require an earlier held-out report, adequate samples and exact market observations',()=>{
  const logs=Array.from({length:20},(_,i)=>({...stat(10+i,`2026-03-${String(i+1).padStart(2,'0')}`),id:i+1}))
  const report={ready:true,version:'nba-rolling-v1',market:'points',method:'blend',recentWeight:.35,modelKey:'test',trainingSeasons:[2023,2024],trainingGames:20000,trainingPlayers:500,trainingMae:4,trainedThrough:'2025-04-13',validationSeason:2025,validationGames:10000,validationPlayers:500,validationMae:4,validationRmse:6,validationBias:0,baselineMae:4.2,validationFrom:'2025-10-20',validationThrough:'2026-04-13'} satisfies NbaModelReport
  assert.equal(nbaValidatedEstimate(logs,'points','2026-10-20',report),20.5)
  assert.equal(nbaValidatedEstimate(logs,'points','2026-10-20',{...report,method:'last10'}),24.5)
  assert.equal(nbaValidatedEstimate(logs,'points','2026-04-01',report),null)
  assert.equal(nbaValidatedEstimate(logs,'rebounds','2026-10-20',report),null)
  assert.equal(nbaValidatedEstimate(logs,'points','2026-10-20',{...report,trainingGames:0}),null)
  assert.equal(nbaValidatedEstimate(logs.slice(0,9),'points','2026-10-20',report),null)
  assert.equal(nbaValidatedEstimate(logs.map((log,i)=>i<11?{...log,pts:null}:log),'points','2026-10-20',report),null)
  assert.equal(nbaValidatedEstimate([...logs,{...stat(1000,'2026-10-20'),id:500}],'points','2026-10-20',report),20.5)
})

test('NBA slate MM uses the full slate, withholds ranks on partial coverage and preserves exact offer sides',()=>{
  const players=[30,20,10].map((pts,i)=>({id:i+1,first_name:'Test',last_name:String(i),position:'G',team:{id:2,abbreviation:'BOS',full_name:'Boston Celtics',name:'Celtics'},average:{pts},logs:Array.from({length:10},(_,n)=>({...stat(pts),id:n+1,player:{id:i+1},game:{...stat(pts).game,id:900+n}})),props:[{...offer,player_id:i+1,line_value:String([10,20,30][i])}],headshot:null,injury:null})) satisfies PaintPlayer[]
  const game={id:123,date:'2026-10-20',season:2026,status:'Scheduled',datetime:'2026-10-20T23:00:00Z',period:0,home_team:players[0].team,visitor_team:{...players[0].team,id:9},home_team_score:0,visitor_team_score:0}
  const meta={sampleSeason:2025,historical:false,sampleEnd:'2026-04-13',statsComplete:true,fetchedAt:'2026-10-19T00:00:00Z',issues:[]}
  const boards=[{...meta,game,players:players.slice(0,2)},{...meta,game:{...game,id:456},players:players.slice(2).map(player=>({...player,props:player.props.map(offer=>({...offer,game_id:456}))}))}] satisfies import('../src/lib/nbaPaint.ts').PaintBoard[]
  const over=nbaSlateRows(boards,'points','fanduel','over',true), under=nbaSlateRows(boards,'points','fanduel','under',true)
  assert.equal(over.find(row=>row.player.id===1)?.mm,2)
  assert.equal(over.find(row=>row.player.id===3)?.mm,-2)
  assert.equal(under.find(row=>row.player.id===1)?.gap,-over.find(row=>row.player.id===1)!.gap!)
  assert.ok(nbaSlateRows(boards,'points','fanduel','over',false).every(row=>row.mm===null))
  assert.equal(nbaSlateRows(boards,'points','draftkings','over',true).length,0)
  const profile={teamId:9,position:'G',market:'points' as const,games:20,minutes:960,per48:30,leaguePer48:25,allowance:.2}
  const contextual=nbaSlateRows(boards,'points','fanduel','over',true,[],[{gameId:123,profiles:[profile]}])
  const expected=nbaSlipSurgeScore(players[0],'points',game.date,profile,null)
  assert.equal(contextual.find(row=>row.player.id===1)?.score,expected.score)
  assert.equal(contextual.find(row=>row.player.id===1)?.coverage,expected.coverage)
  assert.equal(contextual.find(row=>row.player.id===3)?.coverage,over.find(row=>row.player.id===3)?.coverage)
})

test('NBA opposing-market signals keep exact books and price thresholds, and reject future/wrong-game public context',()=>{
  const points={...offer,market:{type:'over_under' as const,over_odds:-120,under_odds:100}}, assists={...offer,id:2,prop_type:'assists',line_value:'5.5',market:{type:'over_under' as const,over_odds:120,under_odds:-140}}
  const frames=[{captured_at:'2026-10-19T01:00:00Z',props:[points,assists]},{captured_at:'2026-10-19T02:00:00Z',props:[{...points,market:{...points.market,over_odds:130}},{...assists,market:{...assists.market,over_odds:-150}}]}]
  const capture={gameId:offer.game_id,capturedAt:'2026-10-19T01:30:00Z',sourceUrl:'https://app.pikkit.com/event/test',unmatched:0,markets:['points','assists'],rows:[{playerId:offer.player_id,market:'points' as const,picks:10},{playerId:offer.player_id,market:'assists' as const,picks:50}]}
  const rows=nbaDivergences(frames,[capture])
  assert.equal(rows.length,1);assert.equal(rows[0].kind,'price');assert.equal(rows[0].primary,'points');assert.equal(rows[0].other,'assists');assert.equal(rows[0].publicHeavierElsewhere,true)
  assert.equal(nbaDivergences(frames,[{...capture,capturedAt:'2026-10-19T03:00:00Z'}])[0].primaryPicks,null)
  assert.equal(nbaDivergences(frames,[{...capture,gameId:999}])[0].publicHeavierElsewhere,null)
  const differentBooks=frames.map(frame=>({...frame,props:frame.props.map(prop=>prop.prop_type==='assists'?{...prop,vendor:'draftkings'}:prop)}))
  assert.equal(nbaDivergences(differentBooks,[capture]).length,0)
  const lineFrames=[frames[0],{...frames[1],props:[{...points,line_value:'22'},{...assists,line_value:'4.5'}]}]
  const lineSignal=nbaDivergences(lineFrames,[capture])[0]
  assert.equal(lineSignal.kind,'line');assert.equal(lineSignal.primaryMovement.priceChange,null);assert.equal(lineSignal.primaryMovement.lineChange,2)
  assert.equal(nbaDivergences(frames.slice(0,1),[capture]).length,0)
})

test('NBA shot chart preserves attempts with invalid locations, isolates shooter and game, and excludes free throws',()=>{
  const play:NbaPlay={game_id:77,order:1,type:'Jump Shot',text:'Test Player misses 25-foot three point jumper',period:1,clock:'11:00',scoring_play:false,shooting_play:true,score_value:null,team:{id:2},coordinate_x:25,coordinate_y:25,participants:[22]}
  const player={id:22,first_name:'Test',last_name:'Player'}
  const shots=nbaShots([play,{...play,order:2,coordinate_x:-214748340,coordinate_y:-214748365},{...play,order:3,participants:[33,22]},{...play,order:4,game_id:88},{...play,order:5,type:'Free Throw',text:'Test Player makes free throw 1 of 2',score_value:1,scoring_play:true},{...play,order:6,coordinate_y:70}],77,player)
  assert.equal(shots.length,3);assert.equal(shots[0].points,3);assert.equal(shots[0].made,false)
  assert.equal(shots[0].x,25);assert.equal(shots[0].y,25);assert.equal(shots[0].halfCourt,true)
  assert.equal(shots[1].x,null);assert.equal(shots[1].y,null);assert.equal(shots[1].halfCourt,false)
  assert.equal(shots[2].halfCourt,false);assert.equal(shots[2].y,70)
  assert.deepEqual(nbaShots([play,play],77,player),[shots[0]])
  const blocked={...play,text:"Other Defender blocks Test Player 's 3-foot layup",participants:[22,33]}
  assert.equal(nbaShots([blocked],77,player).length,1)
  assert.equal(nbaShots([blocked],77,player)[0].made,false)
  assert.equal(nbaShots([{...blocked,participants:[33,22]}],77,player).length,0)
})

test('NBA production scoring is market-specific, bounded, sample-aware and excludes future games',()=>{
  const logs=Array.from({length:30},(_,i)=>({...stat(20,`2026-03-${String(30-i).padStart(2,'0')}`),id:i+1,fga:18,fta:5,fg3a:8,fg3m:3,reb:7,ast:6}))
  const player={id:1,team:{id:2},logs} as PaintPlayer
  const score=nbaSlipSurgeScore(player,'points','2026-04-01')
  assert.ok(score.score!>=0&&score.score!<=100);assert.equal(score.games,30)
  assert.ok(score.coverage<1);assert.equal(score.parts.find(part=>part.key==='matchup')?.value,null)
  assert.notEqual(score.parts[0].value,nbaSlipSurgeScore(player,'threes','2026-04-01').parts[0].value)
  const future={...logs[0],id:500,pts:500,fga:500,game:{...logs[0].game,date:'2026-04-01'}}
  assert.deepEqual(nbaSlipSurgeScore({...player,logs:[future,...logs]},'points','2026-04-01'),score)
  assert.equal(nbaSlipSurgeScore({...player,logs:logs.slice(0,4)},'points','2026-04-01').score,null)
  assert.equal(nbaSlipSurgeScore({...player,logs:logs.map(log=>({...log,pts:null}))},'points','2026-04-01').score,null)
  assert.equal(nbaSlipSurgeScore({...player,team:{id:9}} as PaintPlayer,'points','2026-04-01').newTeam,true)
})

test('NBA walk-forward estimates never train on the graded game or later outcomes',()=>{
  const logs=Array.from({length:20},(_,i)=>({...stat(10+i,`2026-03-${String(i+1).padStart(2,'0')}`),id:i+1,game:{...stat(20).game,id:i+1,date:`2026-03-${String(i+1).padStart(2,'0')}`}}))
  const report=nbaWalkForward(logs,'points')
  assert.equal(report.games,10);assert.equal(report.rows[0].date,'2026-03-11')
  assert.equal(report.rows[0].prediction,nbaProductionEstimate(logs.slice(0,10),'points','2026-03-11'))
  assert.ok(report.mae!=null&&report.baselineMae!=null)
  const changed=logs.map((log,i)=>i===19?{...log,pts:10000}:log)
  assert.deepEqual(nbaWalkForward(changed,'points').rows.map(row=>row.prediction),report.rows.map(row=>row.prediction))
  assert.equal(nbaProductionEstimate(logs.slice(0,9),'points','2026-04-01'),null)
})

test('NBA position allowances use historical defensive opponent, valid minutes, shrinkage and minimum games',()=>{
  const logs=Array.from({length:10},(_,i)=>({...stat(i<5?20:10),id:i+1,player:{id:i+1,position:'G'},team:{id:i<5?2:9},game:{...stat(20).game,id:i+1,home_team_id:2,visitor_team_id:9}}))
  const profiles=nbaDefenseProfiles(logs,['points'])
  assert.ok(profiles.find(row=>row.teamId===9)!.allowance!>0)
  assert.ok(profiles.find(row=>row.teamId===2)!.allowance!<0)
  assert.equal(nbaDefenseProfiles(logs.slice(0,4),['points'])[0].allowance,null)
  assert.deepEqual(nbaDefenseProfiles([...logs,...logs],['points']),profiles)
  assert.deepEqual(nbaDefenseProfiles([...logs,{...logs[0],id:500,min:'0:00',pts:10000}],['points']),profiles)
  const incomplete=nbaDefenseProfiles(logs.slice(0,5).map((log,i)=>i===4?{...log,pts:null}:log),['points'])[0]
  assert.equal(incomplete.games,4);assert.equal(incomplete.allowance,null)
})

test('NBA maintenance and model reads deny access before any source or ledger work',async()=>{
  let reads=0
  const imports={'next/server':{NextResponse:{json:Response.json}},'node:crypto':{},'@/lib/cron-auth':{requireCronAuth:()=>Response.json({},{status:401})},'@/lib/pipelineHealth':{withPipelineHealth:(_name:string,run:unknown)=>run},'@/lib/supabase/admin':{createAdminClient:()=>{reads++;throw new Error('Unexpected read')}},'@/lib/nbaIngestion':{},'@/lib/nbaResearchIdentity':{},'@/lib/nbaPaintData':{},'@/lib/nbaTrackingData':{},'@/lib/nbaIntelligenceData':{},'@/lib/nbaMarketSignalData':{},'@/lib/nbaMarketSignal':{},'@/lib/nbaMarketMetrics':{},'@/lib/nbaMilestoneSignals':{},'@/lib/nbaMarketSelection':{},'@/lib/nbaIntelligence':{},'@/lib/nbaModel':{},'@/lib/nbaMovement':{},'@/lib/nbaSharedCache':{},'@/lib/nbaPaint':{}}
  for(const job of ['nba-research-sync','nba-model-validate','nba-research-snapshot']){
    const route=await compiled(`../src/app/api/cron/${job}/route.ts`,imports)
    assert.equal((await(route.GET as(r:Request)=>Promise<Response>)(new Request(`https://test/api/cron/${job}`))).status,401)
  }
  const model=await compiled('../src/app/the-paint/models/route.ts',{...imports,'@/lib/paintAccess':{requirePaintAdmin:async()=>({error:Response.json({},{status:403})})}})
  assert.equal((await(model.GET as()=>Promise<Response>)()).status,403);assert.equal(reads,0)
})

test('rounded zero-minute player actions preserve appearances and exact grading without guessing all-zero rows',()=>{
  const brief={...stat(0,'2025-11-07','0'),stl:1}
  const unknown=stat(0,'2025-11-08','0')
  assert.equal(nbaSample([brief,unknown],10).length,1)
  const pick={id:'p',post_id:null,game_pk:'123',player_id:'bdl:434',player_name:'Test',pick_type:'points',numeric_line:.5,market_side:'under' as const}
  assert.equal(gradeNbaPick(pick,[brief]),'win')
  assert.equal(gradeNbaPick({...pick,pick_type:'steals',market_side:'over'},[brief]),'win')
  assert.equal(gradeNbaPick(pick,[unknown]),null)
  assert.equal(gradeNbaPick(pick,[{...brief,min:null} as unknown as PaintStat]),null)
})

test('NBA fact import preserves historical team identity and rejects malformed identities',async()=>{
  const ingestion=await compiled('../src/lib/nbaIngestion.ts',{'server-only':{},'./balldontlie':{bdlHeaders:{}},'./supabase/admin':{},'./nbaPaint':{nbaToday:()=>'2026-10-19'}})
  const fact=ingestion.nbaFact as (kind:string,row:unknown,season:number|null,at:string)=>Record<string,unknown>
  const source={...stat(20),player:{id:22,position:'G'},team:{id:9},game:{...stat(20).game,id:77,season:2025,date:'2026-03-01',postseason:false}}
  const result=fact('stats',source,2025,'2026-10-19T00:00:00Z')
  assert.equal(result.team_id,9);assert.equal(result.player_id,22);assert.equal(result.game_id,77);assert.equal(result.season,2025)
  assert.equal(result.payload,source)
  assert.throws(()=>fact('stats',{...source,team:{}},2025,''))
  assert.throws(()=>fact('games',{id:5,date:'2026-01-01',season:2025,home_team:{id:2},visitor_team:{id:2}},2025,''))
})

test('NBA season-opening research blends prior appearances without replacing real current averages or inventing rookie data',async()=>{
  const pure=await import('../src/lib/nbaPaint.ts'),team={id:2,abbreviation:'BOS',full_name:'Boston Celtics',name:'Celtics'}
  const current={...stat(24,'2026-10-20'),id:1,player:{id:434},game:{...stat(24).game,id:100,date:'2026-10-20',season:2026}}
  const prior={...stat(20,'2026-04-10'),id:2,player:{id:434},game:{...stat(20).game,id:101,date:'2026-04-10',season:2025}}
  const fetcher:typeof fetch=async input=>{
    const url=String(input);let data:unknown[]=[]
    if(url.includes('espn.com'))return Response.json({athletes:[]})
    if(url.includes('/players/active'))data=[434,500,600].map(id=>({id,first_name:'Test',last_name:String(id),team,position:'G'}))
    if(url.includes('/season_averages/general')&&!url.includes('team_season'))data=[{player:{id:434},stats:{gp:1,pts:24,min:32}},{player:{id:500},stats:{gp:0,pts:0,min:0}},{player:{id:600},stats:{gp:0,pts:0,min:0}}]
    if(url.includes('/stats?'))data=url.includes('seasons[]=2025')?[prior,{...prior,id:3,player:{id:500},pts:16}]:[current,{...current,id:4,pts:1000,game:{...current.game,date:'2026-10-21'}}]
    return Response.json({data,meta:{next_cursor:null}})
  }
  const provider=await compiled('../src/lib/nbaPaintData.ts',{...emptyOpeningImports,'server-only':{},'@/lib/balldontlie':{bdlHeaders:{}},'./nbaPaint':{...pure,nbaToday:()=>'2026-10-19'},'./nbaSharedCache':cachePassthrough},fetcher)
  const board=await (provider.getPaintBoard as (game:unknown)=>Promise<import('../src/lib/nbaPaint.ts').PaintBoard>)({id:123,date:'2026-10-21',season:2026,home_team:team,visitor_team:{...team,id:9}})
  assert.deepEqual(board.baselineSeasons,[2025,2026]);assert.equal(board.statsComplete,true)
  assert.deepEqual(board.players[0].logs.map(row=>row.pts),[24,20]);assert.equal(board.players[0].average.pts,24);assert.equal(board.players[0].averageSeason,2026)
  assert.equal(board.players[1].average.pts,16);assert.equal(board.players[1].averageSeason,2025)
  assert.equal(board.players[2].average.pts,null);assert.equal(board.players[2].logs.length,0)
})

test('NBA shared cache coalesces cold readers across leases and retains source time on stale failure',async()=>{
  let entry:Record<string,unknown>|null=null,lease:string|null=null,loads=0,reads=0
  const admin={from:()=>({select:()=>({eq:()=>({abortSignal:(signal:AbortSignal)=>{assert.ok(signal instanceof AbortSignal);return{maybeSingle:async()=>{reads++;return{data:entry,error:null}}}}})}),update:()=>({eq:()=>({eq:async()=>{lease=null;return{error:null}}})})}),rpc:async(name:string,args:Record<string,unknown>)=>{
    if(name==='claim_nba_source'){if(lease)return{data:false};lease=String(args.p_token);return{data:true}}
    assert.equal(args.p_token,lease)
    entry={payload:args.p_payload,fetched_at:new Date().toISOString(),expires_at:new Date(Date.now()+Number(args.p_ttl)*1000).toISOString()};lease=null;return{data:true}
  }}
  const crypto=await import('node:crypto')
  const instances=await Promise.all(Array.from({length:4},()=>compiled('../src/lib/nbaSharedCache.ts',{'server-only':{},'node:crypto':crypto,'./supabase/admin':{createAdminClient:()=>admin}})))
  const caches=instances.map(instance=>instance.nbaSharedCache as typeof import('../src/lib/nbaSharedCache.ts').nbaSharedCache),cache=caches[0]
  const load=async()=>{loads++;await new Promise(r=>setTimeout(r,10));return{points:25}}
  const results=await Promise.all(Array.from({length:8},(_,i)=>caches[i%4]('test',60,300,load)))
  assert.equal(loads,1);assert.ok(results.every(r=>r.value.points===25&&!r.stale))
  const priorReads=reads;await cache('test',60,300,load);assert.equal(reads,priorReads);assert.equal(loads,1)
  const sourceTime=results[0].fetchedAt
  entry={payload:{points:25},fetched_at:sourceTime,expires_at:new Date(Date.now()-1000).toISOString()}
  const stale=await cache('stale',60,300,async()=>{throw new Error('provider failed')})
  assert.equal(stale.stale,true);assert.equal(stale.fetchedAt,sourceTime)
  entry={payload:{points:25},fetched_at:sourceTime,expires_at:new Date(Date.now()-400000).toISOString()}
  await assert.rejects(()=>cache('expired',60,300,async()=>{throw new Error('provider failed')}),/provider failed/)
})

test('cross-market scans retain complete-pool MM, isolate books and sides, and use push-adjusted denominators',()=>{
  const players=[30,20,10].map((pts,i)=>({id:i+1,first_name:'Test',last_name:String(i),position:'G',team:{id:2,abbreviation:'BOS',full_name:'Boston Celtics',name:'Celtics'},average:{pts},logs:Array.from({length:10},(_,n)=>({...stat(pts),id:n+1,player:{id:i+1},game:{...stat(pts).game,id:900+n}})),props:[{...offer,player_id:i+1,line_value:String([10,20,30][i])}],headshot:null,injury:null})) satisfies PaintPlayer[]
  const rows=nbaCheatsheet(players,'fanduel','over')
  assert.deepEqual(rows.map(r=>r.mm),[2,0,-2])
  assert.equal([...rows].sort((a,b)=>b.mm!-a.mm!)[0].player.id,1)
  assert.equal([...rows].sort((a,b)=>a.mm!-b.mm!)[0].player.id,3)
  assert.equal(nbaCheatsheet(players,'draftkings').length,0)
  assert.equal(nbaCheatsheet(players,'fanduel','under')[0].gap,-rows[0].gap!)
  assert.equal(rows[1].hit.rate,null)
  assert.equal(nbaCheatsheet(players.map(p=>({...p,logs:p.logs.slice(0,4)}))).length,0)
  const incomplete=nbaCheatsheet(players,'fanduel','over','all',{statsComplete:false})
  assert.ok(incomplete.every(row=>row.mm===null))
  assert.deepEqual(incomplete.map(row=>({offer:row.offer,hit:row.hit})),rows.map(row=>({offer:row.offer,hit:row.hit})), 'Incomplete rank coverage must retain actual prices and observed hit samples')
  const quarters=players.map(player=>({...player,average:{...player.average,points_1q:player.average.pts/4},periodLogs:player.logs.map(log=>({...log,period:1,pts:log.pts!/4})),props:[...player.props,{...player.props[0],prop_type:'points_1q',line_value:String(Number(player.props[0].line_value)/4)}]}))
  const quarterIncomplete=nbaCheatsheet(quarters,'fanduel','over','all',{statsComplete:true,periodStatsComplete:false})
  assert.deepEqual(quarterIncomplete.filter(row=>row.market.key==='points').map(row=>row.mm),[2,0,-2])
  assert.equal(quarterIncomplete.filter(row=>row.market.key==='points_1q').length,3)
  assert.ok(quarterIncomplete.filter(row=>row.market.key==='points_1q').every(row=>row.mm===null))
  assert.deepEqual(nbaCheatsheet(quarters,'fanduel','over','all',{statsComplete:true,periodStatsComplete:true}).filter(row=>row.market.key==='points_1q').map(row=>row.mm),[2,0,-2])
})

test('rotation trends compare non-overlapping windows, exclude DNP and retain unknown tracking',()=>{
  const logs=Array.from({length:20},(_,i)=>({...stat(20,`2026-04-${String(20-i).padStart(2,'0')}`,i<10?'36:00':'24:00'),id:i+1}))
  const player={logs} as PaintPlayer
  assert.equal(nbaRole(player).minutes,36)
  assert.equal(nbaRole(player).minutesChange,12)
  assert.equal(nbaRole(player).per36('points'),20)
  assert.equal(nbaRole({logs:logs.slice(0,4)} as PaintPlayer).minutesChange,null)
  assert.equal(nbaRole({logs:[]} as unknown as PaintPlayer).fga,null)
})

test('alternate selections preserve threshold, side, book, milestones and zeroes',()=>{
  const alt={...offer,line_value:'24.5'}, milestone={...offer,line_value:'25',market:{type:'milestone' as const,odds:200}}
  const keys=[nbaSelectionKey(434,offer,'over'),nbaSelectionKey(434,alt,'over'),nbaSelectionKey(434,alt,'under'),nbaSelectionKey(434,milestone,'over')]
  assert.equal(new Set(keys).size,4)
  assert.equal(parseNbaSelection(keys[1])?.numeric_line,24.5)
  assert.equal(parseNbaSelection(keys[2])?.market_side,'under')
  assert.equal(parseNbaSelection(keys[3])?.market_side,'milestone')
  assert.equal(gradeNbaValue(25,25,'milestone'),'win')
})

test('NBA public counts isolate supported periods, reject fuzzy identities and avoid double-counting',()=>{
  const roster=[{id:1,first_name:'Jalen',last_name:'Williams'},{id:2,first_name:'Jaylin',last_name:'Williams'}] as PaintPlayer[]
  assert.equal(nbaPublicMarket('Points + Rebounds + Assists'),'points_rebounds_assists')
  assert.equal(nbaPublicMarket('Three Pointers Made'),'threes')
  assert.equal(nbaPublicMarket('First Quarter Points'),'points_1q');assert.equal(nbaPublicMarket('Second Quarter Points'),null);assert.equal(nbaPublicMarket('Double Double'),'double_double')
  const result=normalizeNbaPublic({'Points':{'Jalen Williams':10,'Jaylin Williams':0,'J. Williams':90,'Invented Player':30},'Player Points':{'Jalen Williams':10},'First Quarter Points':{'Jalen Williams':99},'Rebounds':{'Jalen Williams':-5}},roster)
  assert.equal(result.rows.length,3)
  assert.deepEqual(result.rows.filter(r=>r.market==='points').map(r=>r.picks),[10,0]);assert.equal(result.rows.find(r=>r.market==='points_1q')?.picks,99)
  assert.equal(result.unmatched,2)
  const threes=normalizeNbaPublic({'Three Pointers Made':{'Jalen Williams Three Pointers Made':12,'Jaylin Williams 3-Pointers':4,'J. Williams Three Pointers Made':90,'Jalen Williams Points':77}},roster)
  assert.deepEqual(threes.rows.map(row=>[row.playerId,row.market,row.picks]),[[1,'threes',12],[2,'threes',4]])
  assert.equal(threes.unmatched,2)
  const nested=normalizeNbaPublic({'Points':{'Jalen Williams Points':300,'Jalen Williams Points 1st Quarter':27,'Jaylin Williams Points 2nd Quarter':99},'Three Pointers':{'Jalen Williams Made Threes':21}},roster)
  assert.deepEqual(nested.rows.map(row=>[row.playerId,row.market,row.picks]),[[1,'points',300],[1,'points_1q',27],[1,'threes',21]])
  assert.equal(nested.unmatched,1)
})

test('NBA research APIs reject denied access and invalid games before loading providers',async()=>{
  for(const file of ['../src/app/the-paint/tracking/route.ts','../src/app/the-paint/scouting/route.ts','../src/app/the-paint/public/route.ts','../src/app/the-paint/results/route.ts','../src/app/the-paint/intelligence/route.ts','../src/app/the-paint/shots/route.ts','../src/app/the-paint/slate/route.ts','../src/app/the-paint/divergence/route.ts','../src/app/the-paint/first-basket/route.ts']){
    let denied=true
    const route=await compiled(file,{'next/server':{NextResponse:{json:Response.json}},'@/lib/paintAccess':{requirePaintAccess:async()=>denied?{error:Response.json({}, {status:403})}:{userId:'admin'}},'@/lib/nbaPublicData':{},'@/lib/nbaPaintData':{},'@/lib/nbaTrackingData':{},'@/lib/nbaIntelligenceData':{},'@/lib/nbaMarketSignalData':{},'@/lib/nbaMarketSignal':{},'@/lib/nbaMarketMetrics':{},'@/lib/nbaIntelligence':{},'@/lib/nbaShotsData':{},'@/lib/nbaFirstBasket':{},'@/lib/balldontlie':{},'@/lib/nbaShots':{},'@/lib/nbaSharedCache':{},'@/lib/nbaSlate':{},'@/lib/nbaDivergence':{},'@/lib/nbaOddsHistoryData':{getNbaQuoteOpenings:async()=>{throw new Error('Unexpected history read before access/parameter checks')}},'@/lib/supabase/admin':{},'@/lib/nbaPaint':{}})
    const get=route.GET as unknown as(r:unknown)=>Promise<Response>
    assert.equal((await get({nextUrl:new URL('https://test/the-paint/scouting?game=123')})).status,403)
    denied=false
    assert.equal((await get({nextUrl:new URL('https://test/the-paint/scouting?game=no')})).status,400)
  }
})

test('NBA public results stay game-exact and distinguish zero production from DNP and unknown minutes',async()=>{
  const pure=await import('../src/lib/nbaPaint.ts')
  const route=await compiled('../src/app/the-paint/results/route.ts',{'next/server':{NextResponse:{json:Response.json}},'@/lib/paintAccess':{requirePaintAccess:async()=>({userId:'admin'})},'@/lib/nbaPaint':pure,'@/lib/nbaPaintData':{getPaintGame:async()=>({id:123,status:'Final'}),getPaintFinalStats:async()=>({complete:true,rows:[{...stat(0),player:{id:1}},{...stat(0,'2026-04-01','0:00'),player:{id:2}},{...stat(0),player:{id:3},min:null},{...stat(50),game:{...stat(50).game,id:456}}]})}})
  const response=await (route.GET as unknown as(r:unknown)=>Promise<Response>)({nextUrl:new URL('https://test/the-paint/results?game=123')})
  const json=await response.json();assert.equal(json.status,'final');assert.equal(json.players.length,3)
  assert.equal(json.players[0].played,true);assert.equal(json.players[0].values.points,0)
  assert.equal(json.players[1].played,null);assert.equal(json.players[2].played,null)
})

test('NBA tracking refuses season-end data on a historical matchup before provider reads',async()=>{
  let reads=0
  const pure=await import('../src/lib/nbaPaint.ts')
  const provider=await compiled('../src/lib/nbaPaintData.ts',{...emptyOpeningImports,'server-only':{},'@/lib/balldontlie':{bdlHeaders:{}},'./nbaPaint':pure,'./nbaSharedCache':cachePassthrough,'./nbaPregameResearchData':{nbaPregameResearch:async()=>{throw new Error('Pregame research snapshot unavailable')}}},async()=>{reads++;throw new Error('Unexpected provider read')})
  await assert.rejects((provider.getPaintScouting as unknown as(g:unknown)=>Promise<unknown>)({date:'2000-01-01',season:1999}),/Pregame research snapshot unavailable/)
  assert.equal(reads,0)
})

test('NBA Pikkit collector denies unauthorized calls before schedule or cloud browser work',async()=>{
  let reads=0
  const route=await compiled('../src/app/api/cron/poll-pikkit-nba-picks/route.ts',{'next/server':{NextResponse:{json:Response.json}},'@/lib/cron-auth':{requireBrowserbaseCronAuth:()=>Response.json({},{status:401})},'@/lib/pipelineHealth':{withPipelineHealth:(_n:string,r:unknown)=>r},'@/lib/nbaPaintData':{getPaintSchedule:()=>{reads++}},'@/lib/nbaPaint':{},'@/lib/supabase/admin':{},'@/lib/pikkitBrowserLease':{},'@/lib/browserbase':{},'@/lib/scrapers/gameMatch':{},'@/lib/scrapers/nbaPikkitScraper':{},'@/lib/nbaPublicServer':{},'@/lib/nbaPublic':{},'@/lib/nbaSharedCache':{}})
  assert.equal((await (route.GET as unknown as(r:Request)=>Promise<Response>)(new Request('https://test/api/cron/poll-pikkit-nba-picks'))).status,401)
  assert.equal(reads,0)
})

const stat = (value: number | null, date = '2026-04-01', minutes = '30:30'): PaintStat => {
  const zero=nbaMinutes(minutes)===0
  return { id: Number(date.replaceAll('-', '')), player: { id: 434 }, team: { id: 2 }, game: { id: 123, date, status: 'Final', status_state: 'final', home_team_id: 2, visitor_team_id: 9 }, min: minutes, pts: value, reb: zero?0:5, ast: zero?0:4, fg3m: zero?0:2, stl: 0, blk: zero?0:1, turnover: zero?0:2, fga: zero?0:15, fgm: zero?0:7, fg3a: zero?0:5, fta: zero?0:3, ftm: zero?0:2 }
}
const offer: PaintProp = { id: 99, game_id: 123, player_id: 434, prop_type: 'points', vendor: 'fanduel', line_value: '20', market: { type: 'over_under', over_odds: -110, under_odds: -105 }, updated_at: '2026-10-18T12:00:00Z' }

test('movement separates threshold changes from price moves, isolates books and leaves missing quotes unknown',()=>{
  const first={captured_at:'2026-10-19T10:00:00Z',props:[offer]}
  const rise={captured_at:'2026-10-19T11:00:00Z',props:[{...offer,line_value:'21'}]}
  assert.equal(nbaMovement([first,rise],434,'points','fanduel').lineChange,1)
  assert.equal(nbaMovement([first,rise],434,'points','fanduel').priceChange,null)
  const shorter={...rise,props:[{...offer,market:{...offer.market,over_odds:-130}}]}
  assert.equal(nbaMovement([first,shorter],434,'points','fanduel').lineChange,0)
  assert.ok(nbaMovement([first,shorter],434,'points','fanduel').priceChange!>0)
  assert.equal(nbaMovement([first,shorter],434,'points','draftkings').latest,null)
  assert.equal(nbaMovement([first,{...rise,props:[]}],434,'points','fanduel').latest,null)
  assert.equal(nbaMovement([first],434,'points','fanduel').lineChange,null)
  assert.deepEqual(nbaEconomicSnapshot([offer]),nbaEconomicSnapshot([{...offer,id:888,updated_at:'2026-10-19T12:00:00Z',line_value:'20.0'}]))
  assert.notDeepEqual(nbaEconomicSnapshot([offer]),nbaEconomicSnapshot(shorter.props))
})

test('NBA samples preserve nulls, valid zeroes and exact combined markets', () => {
  assert.equal(nbaValue(stat(20), 'points_rebounds_assists'), 29)
  assert.equal(nbaValue(stat(0), 'points'), 0)
  assert.equal(nbaValue(stat(null), 'points'), null)
  assert.equal(nbaValue(stat(20), 'points_1q'), null)
  assert.equal(nbaMinutes('30:30'), 30.5)
  assert.equal(nbaMinutes(null), null)
  assert.equal(nbaMinutes('DNP'), null)
  assert.equal(nbaAverage([], 'points'), null)
})
test('DNPs are excluded, samples sort newest first, and venue uses the historical game team', () => {
  const logs = [stat(0, '2026-04-02', '0:00'), stat(20), stat(25, '2026-04-03')]
  assert.deepEqual(nbaSample(logs, 10).map(s => s.pts), [25, 20])
  assert.equal(nbaSample(logs, 10, 'away').length, 0)
  assert.equal(nbaSample(logs, 1, 'home')[0].pts, 25)
})
test('hit rates distinguish pushes, overs, unders and milestone equality', () => {
  const logs = [stat(20), stat(21), stat(19)]
  assert.deepEqual(nbaHitRate(logs, 'points', 20, 'over'), { wins: 1, pushes: 1, games: 3, rate: 50 })
  assert.equal(nbaHitRate(logs, 'points', 20, 'under').rate, 50)
  assert.equal(nbaHitRate(logs, 'points', 20, 'over', true).wins, 2)
  assert.equal(nbaHitRate([stat(null)], 'points', 20, 'over').rate, null)
})
test('reference selections prefer posted milestones and retain O/U consensus when milestones are absent', () => {
  const ladder = { ...offer, line_value: '10', market: { type: 'milestone' as const, odds: 200 } }
  const more = { ...offer, vendor: 'draftkings', line_value: '20.5' }
  assert.equal(nbaReference([ladder, offer], 'points'), ladder)
  assert.equal(nbaReference([ladder], 'points', 'all', 'under'), null)
  assert.equal(nbaReference([offer, more, { ...more, vendor: 'caesars' }], 'points')?.line_value, '20.5')
  assert.equal(nbaReference([offer, more], 'points', 'fanduel')?.vendor, 'fanduel')
})
test('NBA selections survive shared watchlist posting without becoming MLB or NFL', () => {
  const key = nbaSelectionKey(434, offer, 'under')
  assert.deepEqual(parseNbaSelection(key), { player_id: 'bdl:434', prop_key: 'points', numeric_line: 20, market_side: 'under', type: 'over_under' })
  const payload = watchlistPickPayload({ sport: 'nba', player_name: 'Player', prop_key: key, prop_label: 'Under 20 Points', game_pk: '123', book: 'fanduel', odds: -105 })
  assert.equal(payload.sport, 'NBA'); assert.equal(payload.player_id, 'bdl:434'); assert.equal(payload.numeric_line, 20); assert.equal(payload.prop_key, 'points')
  for (const invalid of ['nba:434:points:milestone:20:over', 'nba:434:points:over_under:NaN:under', 'nba:434:unknown:over_under:20:over', key + ':extra']) assert.equal(parseNbaSelection(invalid), null)
})
test('grading is final-only, ID-exact, supports pushes and milestone equality, and leaves DNP pending', () => {
  const pick = { id: 'p', post_id: null, game_pk: '123', player_id: 'bdl:434', player_name: 'Player', pick_type: 'points', numeric_line: 20, market_side: 'over' as const }
  assert.equal(gradeNbaPick(pick, [stat(20)]), 'push')
  assert.equal(gradeNbaPick(pick, [stat(21)]), 'win')
  assert.equal(gradeNbaPick(pick, [stat(19)]), 'loss')
  assert.equal(gradeNbaPick(pick, [stat(0, '2026-04-01', '0')]), null)
  assert.equal(gradeNbaPick({ ...pick, player_id: 'bdl:435' }, [stat(21)]), null)
  assert.equal(gradeNbaPick(pick, [{ ...stat(21), game: { ...stat(21).game, status_state: 'in_progress', status: '4th Qtr' } }]), null)
  assert.equal(gradeNbaValue(20, 20, 'milestone'), 'win')
  assert.equal(gradeNbaValue(null, 20, 'over'), null)
})
test('date and artwork identity normalization reject invalid dates and fuzzy name substitutions', () => {
  assert.equal(nbaDate('2026-02-30', '2026-10-20'), '2026-10-20')
  assert.equal(nbaName('Nikola Jokić'), nbaName('Nikola Jokic'))
  assert.equal(nbaName('Ron Harper Jr.'), nbaName('Ron Harper'))
  assert.notEqual(nbaName('Jalen Williams'), nbaName('Jaylin Williams'))
})

async function compiled(file: string, imports: Record<string, unknown>, fetcher: typeof fetch = fetch, globals:Record<string,unknown> = {}) {
  imports = { '@/lib/nbaBrowserBudget': { NbaBrowserBudgetError: class extends Error {} }, '@/lib/nbaPublicCaptureControl': publicControl, '@/lib/nbaPublicCaptureControlData': { readNbaPublicControls: async()=>new Map(), saveNbaPublicControl: async()=>{} }, ...imports }
  imports = { '@/lib/nbaResearchBundle': { resolveNbaResearchBundle: async (board: unknown, _mode: unknown, load: (board: unknown) => Promise<unknown>) => ({ board, value: await load(board) }) }, ...imports }
  imports = { '@/lib/nbaResearchResources': {}, '@/lib/nbaSlateFreezeData': {}, '@/lib/nbaSlateHeat': {}, '@/lib/nbaPregameResearchData': {}, './nbaPregameResearchData': { readNbaPregameResearch: async () => null, nbaPregameResearch: async (_game: unknown, _resource: string, load: () => Promise<unknown>) => ({ ...await load() as object, source: 'capture', frozen: false }) }, ...imports }
  const source = await readFile(new URL(file, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
  const target = { exports: {} as Record<string, (...args: never[]) => unknown> }
  new Function('require', 'exports', 'module', 'fetch','process','setTimeout','clearTimeout', outputText)((name: string) => { if(name==='./nbaBookPropsData')return {getNbaBookPropEntries:async()=>[],nbaBookPropsSupplement:()=>({props:[],complete:true})}; if(name==='./nbaPrimaryProps')return primaryProps; if(name==='./nbaSupplementalProps')return supplementalProps; if(name==='@/lib/scrapers/pikkitLeagueDate'&&!(name in imports))return {observePikkitLeagueDates:()=>({selectDate:async()=>true,dispose:()=>{}})}; if(name==='@/lib/nbaPublicEventIdentity')return publicEventIdentity; if((name==='./nbaOddsClockData'||name==='@/lib/nbaOddsClockData')&&!(name in imports))return{getNbaOddsGame:async(game:unknown)=>game}; if(name==='@/lib/nbaOddsMode'||name==='./nbaOddsMode')return oddsMode; if(name==='./nbaOddsPhaseData'&&!(name in imports))return {getNbaPhaseSnapshot:async()=>({props:[],gameOdds:[],firstBasket:[],capturedAt:{props:null,gameOdds:null,firstBasket:null}})}; if(name==='node:crypto'&&!(name in imports))return crypto;if(name==='./nbaSharedCache'&&!(name in imports))return cachePassthrough;if(name==='@/lib/nbaMilestoneSignals')return milestoneSignals;if(name==='@/lib/nbaMarketSelection')return marketSelection;if(name==='./nbaFirstBasketMarkets'||name==='@/lib/nbaFirstBasketMarkets')return firstMarkets;if(name==='./nbaFirstBasketFacts')return {};if((name==='./nbaFirstBasketOddsData'||name==='@/lib/nbaFirstBasketOddsData')&&!(name in imports))return unpostedFirstBasket;assert.ok(name in imports, name); return imports[name] }, target.exports, target, fetcher,globals.process??process,globals.setTimeout??setTimeout,globals.clearTimeout??clearTimeout)
  return target.exports
}
test('server authorization fails closed for guests, regular members and failed role reads', async () => {
  for (const [id, role, error, status] of [[null, null, null, 401], ['u', 'member', null, 403], ['u', 'admin', 'db error', 503], ['u', 'admin', null, undefined]] as const) {
    const gate = await compiled('../src/lib/paintAccess.ts', { '@/lib/nbaAccessPolicy': { hasNbaAccess }, 'server-only': {}, 'next/server': { NextResponse: { json: Response.json } }, '@/lib/requireTier': { resolveAuthedClient: async () => ({ userId: id, supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { account_type: role }, error }) }) }) }) } }) } })
    const result = await gate.requirePaintAccess() as { error?: Response; userId?: string }
    assert.equal(result.error?.status, status)
    if (!status) assert.equal(result.userId, id)
  }
})
test('posting rejects changed odds, opposite side, wrong book and wrong player', async () => {
  const validator = await compiled('../src/lib/nbaPickValidation.ts', { 'server-only': {}, './nbaPaintData': {}, './nbaPaint': {} })
  const leg = { player_id: 'bdl:434', game_pk: '123', book: 'fanduel', prop_key: 'points', numeric_line: 20, market_side: 'over', odds: -110 }
  const matches = validator.paintOfferMatches as unknown as (p: PaintProp, l: typeof leg) => boolean
  assert.equal(matches(offer, leg), true)
  for (const change of [{ odds: -109 }, { book: 'draftkings' }, { player_id: 'bdl:435' }, { market_side: 'under' }, { numeric_line: 20.5 }]) assert.equal(matches(offer, { ...leg, ...change }), false)
})


test('custom matrix ranks observed stats, preserves ties, and never invents missing samples', () => {
  const players = [10, 20, 30].map((pts, index) => ({ id: index + 1, first_name: 'Test', last_name: String(index), position: 'G', team: { id: 2, abbreviation: 'BOS', full_name: 'Boston Celtics', name: 'Celtics' }, average: { pts }, logs: [], props: [], headshot: null, injury: null })) satisfies PaintPlayer[]
  assert.equal(nbaWeightedRank(players[0], players, { pts: 100 }), 0)
  assert.equal(nbaWeightedRank(players[1], players, { pts: 100 }), 50)
  assert.equal(nbaWeightedRank(players[2], players, { pts: 100 }), 100)
  assert.equal(nbaWeightedRank(players[0], players, { pts: 0 }), null)
  assert.equal(nbaTeamLogo('BOS'), 'https://a.espncdn.com/i/teamlogos/nba/500/bos.png')
  assert.equal(nbaTeamLogo('GSW'), 'https://a.espncdn.com/i/teamlogos/nba/500/gs.png')
  assert.equal(nbaTeamLogo('../bad'), null)
})

test('provider samples bound dates, exclude future results, and expose truncated cursor coverage', async () => {
  const pure = await import('../src/lib/nbaPaint.ts')
  const team = { id: 2, abbreviation: 'BOS', full_name: 'Boston Celtics', name: 'Celtics' }
  const urls: string[] = []
  const fetcher: typeof fetch = async input => {
    const url = String(input); urls.push(url)
    let data: unknown[] = []
    if (url.includes('espn.com')) return Response.json({ athletes: [{ fullName: 'Test Player', headshot: { href: 'https://a.espncdn.com/test.png' } }] })
    if (url.includes('/players/active')) data = [{ id: 434, first_name: 'Test', last_name: 'Player', team, position: 'G' }]
    if (url.includes('/season_averages/general') && !url.includes('team_season')) data = [{ player: { id: 434 }, stats: { gp: url.includes('season=2026') ? 0 : 50, pts: 22, min: 30 } }]
    if (url.includes('/stats?')) return Response.json({ data: [stat(22), stat(100, '2026-10-19')], meta: { next_cursor: 1 } })
    return Response.json({ data, meta: { next_cursor: null } })
  }
  const adapter = await compiled('../src/lib/nbaPaintData.ts', { ...emptyOpeningImports, 'server-only': {}, '@/lib/balldontlie': { bdlHeaders: { Authorization: 'test-only' } }, './nbaPaint': { ...pure, nbaToday: () => '2026-10-19' }, './nbaSharedCache':cachePassthrough }, fetcher)
  const board = await (adapter.getPaintBoard as unknown as (game: unknown) => Promise<import('../src/lib/nbaPaint.ts').PaintBoard>)({ id: 123, date: '2026-10-20', season: 2026, status: '2026-10-20T23:00:00Z', datetime: '2026-10-20T23:00:00Z', home_team: team, visitor_team: { ...team, id: 9, abbreviation: 'DET' } })
  assert.equal(board.sampleSeason, 2025)
  assert.equal(board.statsComplete, false)
  assert.ok(board.issues.some(i => i.includes('incomplete')), JSON.stringify({issues:board.issues,players:board.players.length,urls}))
  assert.equal(board.players[0].logs.length, 1)
  assert.equal(board.players[0].logs[0].pts, 22)
  assert.ok(urls.some(u => u.includes('end_date=2026-07-01')))
})

test('MM compares the same priced roster, preserves ties and signs, and excludes missing samples', () => {
  const players = [30, 20, 10].map((pts, i) => ({ id: i + 1, first_name: 'Test', last_name: String(i), position: 'G', team: { id: 2, abbreviation: 'BOS', full_name: 'Boston Celtics', name: 'Celtics' }, average: { pts }, logs: Array.from({ length: 5 }, (_, n) => ({ ...stat(pts), id: n + 1, player: { id: i + 1 }, game: { ...stat(pts).game, id: 900 + n } })), props: [{ ...offer, player_id: i + 1, line_value: String([10, 20, 30][i]) }], headshot: null, injury: null })) satisfies PaintPlayer[]
  const ranks = nbaMarketRanks(players, 'points')
  assert.equal(ranks.get(1)?.mm, 2); assert.equal(ranks.get(3)?.mm, -2)
  assert.equal(nbaMarketRanks(players, 'assists').size, 0)
  assert.equal(nbaMarketRanks(players.map(p => ({ ...p, logs: [] })), 'points').size, 0)
  const consensus = [{ ...offer, line_value: '15', vendor: 'fanduel' }, { ...offer, line_value: '20', vendor: 'fanduel' }, { ...offer, line_value: '20', vendor: 'draftkings' }]
  assert.equal(nbaReference(consensus, 'points', 'fanduel')?.line_value, '20')
})

test('MM responds to live lines, prices and production without converting agreement or missing inputs to invented edges', () => {
  const players = [10, 10].map((pts, i) => ({ id: i + 1, first_name: 'Test', last_name: String(i), position: 'G', team: { id: 2, abbreviation: 'BOS', full_name: 'Boston Celtics', name: 'Celtics' }, average: { pts }, logs: Array.from({ length: 5 }, (_, n) => ({ ...stat(pts), id: n + 1, player: { id: i + 1 }, game: { ...stat(pts).game, id: 900 + n } })), props: [{ ...offer, player_id: i + 1, line_value: '10.5' }], headshot: null, injury: null })) satisfies PaintPlayer[]
  const rank = (rows = players) => nbaMarketRanks(rows, 'points', 'all', 'all', { gameId: 123, beforeDate: '2026-10-20' })
  assert.deepEqual([...rank().values()].map(row => row.mm), [0, 0])
  const priced = structuredClone(players)
  priced[0].props[0].market = { type: 'over_under', over_odds: 150, under_odds: -180 }
  assert.equal(rank(priced).get(1)?.mm, 1)
  const moved = structuredClone(players); moved[0].props[0].line_value = '8.5'
  assert.equal(rank(moved).get(1)?.mm, 1)
  const production = structuredClone(players); production[0].average.pts = 20
  assert.equal(rank(production).get(2)?.mm, -1)
  const duplicated = structuredClone(priced)
  duplicated[0].props.push(...Array.from({ length: 20 }, () => ({ ...offer, player_id: 1, line_value: '10.5', updated_at: '2026-10-17T12:00:00Z' })))
  assert.deepEqual(rank(duplicated), rank(priced))
  for (const kind of ['missing', 'foreign-player', 'future', 'partial', 'wrong-game', 'unfinished'] as const) {
    const invalid = structuredClone(players)
    if (kind === 'missing') invalid[0].props = []
    if (kind === 'foreign-player') invalid[0].logs[0].player.id = 99
    if (kind === 'future') invalid[0].logs[0].game.date = '2026-10-21'
    if (kind === 'partial') invalid[0].logs[0].pts = null
    if (kind === 'wrong-game') invalid[0].props[0].game_id = 999
    if (kind === 'unfinished') invalid[0].logs[0].game = { ...invalid[0].logs[0].game, status: 'Live', status_state: 'in_progress' }
    assert.equal(rank(invalid).size, 0, kind)
  }
})

test('milestone movement keeps each N+ threshold exact across captures and never substitutes O/U', () => {
  const rung = (line: number, odds: number): PaintProp => ({...offer,line_value:String(line),market:{type:'milestone',odds}})
  const frames=[{captured_at:'2026-10-19T10:00:00Z',props:[rung(10,-200),rung(20,200),offer]},{captured_at:'2026-10-19T11:00:00Z',props:[rung(10,-250),rung(20,150),{...offer,line_value:'24.5'}]}]
  const rows=nbaMilestoneMovements(frames,434,'points','fanduel')
  assert.deepEqual(rows.map(row=>row.offer.line_value),['10','20'])
  assert.deepEqual(rows.map(row=>row.movement.priceFirstOdds),[-200,200])
  assert.deepEqual(rows.map(row=>row.movement.priceLatestOdds),[-250,150])
  assert.ok(rows.every(row=>row.movement.lineChange===0&&row.movement.priceChange!>0))
  assert.equal(nbaMilestoneMovements(frames,434,'points','draftkings').length,0)
  assert.equal(nbaMilestoneMovements(frames,434,'points','fanduel',[],20).length,1)
  assert.equal(nbaMilestoneMovements(frames,434,'points','fanduel',[],15).length,0)
  assert.deepEqual(marketSelection.nbaSelectedProps([rung(10,-200),rung(20,200),offer],'points',{type:'milestone',line:20}).map(p=>p.line_value),['20'])
})

test('first-basket research separates free throws, field goals and attempts and refuses incomplete openings', () => {
  const play=(order:number,patch:Partial<NbaPlay>={}):NbaPlay=>({game_id:90,order,type:'Jump Shot',text:'Test Player makes jump shot',period:1,clock:'11:45',scoring_play:true,shooting_play:true,score_value:2,team:{id:2},coordinate_x:25,coordinate_y:5,participants:[434],...patch})
  const plays=[play(1,{type:'Jumpball',clock:'12:00',shooting_play:false,scoring_play:false,score_value:null}),play(2,{type:'Free Throw',score_value:1}),play(3,{scoring_play:false,score_value:null}),play(4),play(5,{team:{id:9},participants:[99]})]
  const opening=nbaOpeningSequence([...plays,play(1,{game_id:999})],90)
  assert.equal(opening.tip?.team?.id,2)
  assert.equal(opening.firstScore?.order,2)
  assert.equal(opening.firstFieldGoal?.order,4)
  assert.equal(opening.firstAttempt?.order,3)
  assert.deepEqual(opening.teamFieldGoals.map(p=>p.order).sort(),[4,5])
  assert.equal(nbaOpeningSequence(plays.slice(1),90).firstFieldGoal,undefined)
  assert.equal(nbaOpeningSequence(plays.filter(p=>p.order!==2),90).firstFieldGoal,undefined)
  const team={id:2,abbreviation:'BOS',full_name:'Boston Celtics',name:'Celtics'}
  const board={game:{id:123,date:'2026-10-20',home_team:team,visitor_team:{...team,id:9}},players:[{id:434,team,logs:[{...stat(22),game:{...stat(22).game,id:90}}]}]} as import('../src/lib/nbaPaint.ts').PaintBoard
  const research=nbaFirstBasketResearch(board,plays,[90,91])
  assert.equal(research.coveredGames,1);assert.equal(research.requestedGames,2)
  assert.deepEqual(research.rows[0],{playerId:434,games:1,firstFieldGoals:1,firstScores:1,firstAttempts:1,teamFirstFieldGoals:1})
})

test('save → post API → My Picks → final settlement preserves exact NBA identities', async () => {
  const pure = await import('../src/lib/nbaPaint.ts')
  const saved: Record<string, unknown>[] = [], posts: Record<string, unknown>[] = [], picks: Record<string, unknown>[] = []
  const client = { from: () => ({
    insert: (row: Record<string, unknown>) => ({ select: () => ({ single: async () => { const data = { id: 'saved-1', status: 'pending', ...row }; saved.push(data); return { data, error: null } } }) }),
    select: () => ({ eq: () => ({ order: async () => ({ data: saved, error: null }), in: () => { const query = { order: () => query, limit: () => query, or: () => Promise.resolve({ data: posts, error: null }) }; return query } }) }),
  }) }
  const provider = { getPaintGame: async () => ({ id: 123, date: '2099-10-20', datetime: '2099-10-20T20:00:00Z', status_state: 'scheduled', home_team: { id: 2 }, visitor_team: { id: 9 } }), getPaintProps: async () => [offer], getPaintIdentity: async () => ({ id: 434, first_name: 'Canonical', last_name: 'Player', team: { id: 2, abbreviation: 'BOS' } }) }
  const validation = await compiled('../src/lib/nbaPickValidation.ts', { 'server-only': {}, './nbaPaintData': provider, './nbaPaint': pure })
  const admin = { rpc: async (name: string, args: Record<string, unknown>) => {
    assert.equal(name, 'create_tracked_pick_post')
    posts.push({ id: 'post-1', ...(args.p_post as object) })
    picks.push(...(args.p_picks as object[]).map((row, i) => ({ ...row, id: `pick-${i}`, post_id: 'post-1' })))
    return { data: { id: 'post-1', pickIds: ['pick-0'], picksTracked: true }, error: null }
  } }
  const route = await compiled('../src/app/api/posts/pick/route.ts', {
    '@/lib/pickGrading': {}, '@/lib/nflPickGrading': {}, '@/lib/mlbCaptureWindow': {},
    'next/server': { NextResponse: { json: Response.json } }, '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }) } }) }, '@/lib/supabase/admin': { createAdminClient: () => admin },
    '@slipsurge/core/mlbSchedule': {}, '@slipsurge/core/parlayCalc': { combineOdds: () => -110 }, '@/lib/watchlist': {}, '@/lib/mentions': { notifyMentions: async () => {} }, '@/lib/notify': { notifyFollowers: async () => {} }, '@/app/the-sideline/data': {}, '@/app/the-sideline/kickoff': {}, '@/lib/nflPickOffer': {}, '@/lib/nbaPickValidation': validation, '@/lib/paintAccess': { requirePaintAccess: async () => ({ userId: 'owner' }) },
  })
  const watchlist = await compiled('../src/lib/watchlist.ts', { '@/lib/supabase/client': { createClient: () => client }, '@slipsurge/core/parlayCalc': {}, './nflWatchlist': { watchlistPickPayload } }, async (_input, init) => await (route.POST as unknown as (request: Request) => Promise<Response>)(new Request('https://slipsurge.test/api/posts/pick', init)))
  const item = await (watchlist.addWatchlistItem as unknown as (owner: string, item: unknown) => Promise<WatchlistItem>)('owner', { sport: 'nba', player_name: 'Wrong name', team: 'OLD', game_pk: '123', game_date: '2099-10-20', prop_key: nbaSelectionKey(434, offer, 'over'), prop_label: 'Over 20 Points', line: '999', book: 'fanduel', odds: -110 })
  assert.equal((await (watchlist.fetchWatchlist as unknown as (owner: string) => Promise<WatchlistItem[]>)('owner')).length, 1)
  const posted = await (watchlist.postBetToFeed as unknown as (owner: string, items: WatchlistItem[]) => Promise<{ postId: string }>)('owner', [item])
  assert.equal(posted.postId, 'post-1'); assert.equal(picks[0].sport, 'NBA'); assert.equal(picks[0].player_id, 'bdl:434'); assert.equal(picks[0].numeric_line, 20); assert.equal(picks[0].line, '20'); assert.equal(picks[0].player_name, 'Canonical Player')
  const myPicks = await compiled('../src/lib/myPicks.ts', { '@/lib/supabase/client': { createClient: () => client } })
  assert.equal((await (myPicks.fetchMyPicks as unknown as (owner: string) => Promise<{ id: string }[]>)('owner'))[0].id, 'post-1')
  const settlement = await compiled('../src/lib/nbaSettlement.ts', { 'server-only': {}, './nbaPickGrading': { gradeNbaPick }, './nbaPaint': { nbaPeriod, nbaToday: () => '2099-10-20' }, './nbaPaintData': { getPaintGame: async () => ({ status_state: 'final' }), getPaintFinalStats: async () => ({ complete: true, rows: [stat(21)] }) } })
  const chain = { select: () => chain, eq: () => chain, not: () => chain, lte: () => chain, order: () => chain, limit: async () => ({ data: picks, error: null }), upsert: () => ({ abortSignal: async () => ({ error: null }) }) }
  const settled = await (settlement.settleNbaPicks as unknown as (client: unknown) => Promise<{ graded: number }>)({ from: () => chain, rpc: (name: string, args: Record<string, unknown>) => ({ abortSignal: async (signal: AbortSignal) => { assert.ok(signal instanceof AbortSignal); if(name==='claim_pending_nba_picks')return{data:picks,error:null};assert.equal(name, 'settle_nba_pick_exact'); assert.deepEqual(args, { p_pick_id: 'pick-0', p_result: 'win' }); return { data: true, error: null } } }) })
  assert.equal(settled.graded, 1)
})

test('NBA posting fails closed for stale quotes, started games, duplicates, mixed books and unavailable data', async () => {
  const pure = await import('../src/lib/nbaPaint.ts')
  const leg = { player_id: 'bdl:434', player_name: 'Test', team: 'BOS', game_pk: '123', game_date: '2099-10-20', book: 'fanduel', prop_key: 'points', prop_label: 'Points', numeric_line: 20, market_side: 'over', odds: -110 }
  for (const scenario of ['changed', 'started', 'duplicate', 'mixed', 'missing', 'valid']) {
    const validator = await compiled('../src/lib/nbaPickValidation.ts', { 'server-only': {}, './nbaPaint': pure, './nbaPaintData': {
      getPaintGame: async () => ({ id: 123, datetime: scenario === 'started' ? '2000-01-01T00:00:00Z' : '2099-10-20T20:00:00Z', date: '2099-10-20', status_state: 'scheduled', home_team: { id: 2 }, visitor_team: { id: 9 } }),
      getPaintProps: async () => { if (scenario === 'missing') throw new Error('unavailable'); return [{ ...offer, market: { ...offer.market, over_odds: scenario === 'changed' ? -111 : -110 } }] },
      getPaintIdentity: async () => ({ first_name: 'Test', last_name: 'Player', team: { id: 2, abbreviation: 'BOS' } }),
    } })
    const legs = scenario === 'duplicate' ? [{ ...leg }, { ...leg }] : scenario === 'mixed' ? [{ ...leg }, { ...leg, player_id: 'bdl:435', book: 'draftkings' }] : [{ ...leg }]
    const error = await (validator.validatePaintPickLegs as unknown as (legs: unknown[]) => Promise<string | null>)(legs)
    if (scenario === 'valid') assert.equal(error, null); else assert.equal(typeof error, 'string', scenario)
  }
})

test('NBA settlement never writes from partial, live, mismatched, missing or failed provider data', async () => {
  for (const scenario of ['partial', 'live', 'identity', 'missing', 'provider', 'rpc']) {
    let calls = 0
    const pending = { id: 'p', game_pk: '123', player_id: 'bdl:434', pick_type: 'points', numeric_line: 20, market_side: 'over' }
    const chain = { select: () => chain, eq: () => chain, not: () => chain, lte: () => chain, order: () => chain, limit: async () => ({ data: [pending], error: null }), upsert: () => ({ abortSignal: async () => ({ error: null }) }) }
    const settlement = await compiled('../src/lib/nbaSettlement.ts', { 'server-only': {}, './nbaPickGrading': { gradeNbaPick }, './nbaPaint': { nbaPeriod, nbaToday: () => '2099-10-20' }, './nbaPaintData': {
      getPaintGame: async () => { if (scenario === 'provider') throw new Error('provider'); return { status_state: scenario === 'live' ? 'in_progress' : 'final' } },
      getPaintFinalStats: async () => ({ complete: scenario !== 'partial', rows: scenario === 'missing' ? [] : [{ ...stat(21), player: { id: scenario === 'identity' ? 999 : 434 } }] }),
    } })
    const report = await (settlement.settleNbaPicks as unknown as (client: unknown) => Promise<{ graded: number }> )({ from: () => chain, rpc: (name:string) => ({ abortSignal: async (signal: AbortSignal) => { assert.ok(signal instanceof AbortSignal); if(name==='claim_pending_nba_picks')return{data:[pending],error:null};calls++; return { data: null, error: { message: 'write unavailable' } } } }) })
    assert.equal(report.graded, 0); assert.equal(calls, scenario === 'rpc' ? 1 : 0)
  }
})

test('NBA collector requires cron authorization, deduplicates schedules and captures the verified phase while excluding final games', async()=>{
  let reads=0,gameReads=0,denied=true
  const writes:string[]=[]
  const crypto=await import('node:crypto')
  const route=await compiled('../src/app/api/cron/nba-market-capture/route.ts',{
    'node:crypto':crypto,'next/server':{NextResponse:{json:Response.json}},'@/lib/cron-auth':{requireCronAuth:()=>denied?Response.json({error:'Unauthorized'},{status:401}):null},'@/lib/pipelineHealth':{withPipelineHealth:(_name:string,run:unknown)=>run},'@/lib/nbaSharedCache':cachePassthrough,'@/lib/supabase/admin':{createAdminClient:()=>({from:()=>({select:()=>({in:async()=>({data:[],error:null})})}),rpc:(name:string,args:Record<string,unknown>)=>({abortSignal:async(signal:AbortSignal)=>{assert.ok(signal instanceof AbortSignal);assert.equal(name,'record_nba_phase_capture');assert.equal(args.p_game_id,123);writes.push(String(args.p_feed));return{data:true,error:null}}})})},'@/lib/nbaPaintData':{getPaintGame:async(id:number)=>({id,date:'2099-10-20',datetime:new Date(Date.now()+3600000).toISOString(),status:'Scheduled',status_state:'scheduled',period:0}),getPaintSchedule:async()=>({games:[{id:123,date:'2099-10-20',datetime:new Date(Date.now()+3600000).toISOString(),status_state:'scheduled'},{id:456,date:'2000-01-01',datetime:'2000-01-01T20:00:00Z',status_state:'final'}]}),getPaintPropSnapshot:async()=>{reads++;return propSnapshot([offer])},getPaintGameOdds:async(id:number)=>{gameReads++;return[gameQuote(id)]}},'@/lib/nbaMovement':{nbaEconomicSnapshot},'@/lib/nbaOddsHistory':{nbaGameEconomicSnapshot},'@/lib/nbaPaint':{nbaToday:()=> '2099-10-20'},
  })
  const get=route.GET as unknown as(request:Request)=>Promise<Response>
  assert.equal((await get(new Request('https://test/api/cron/nba-market-capture'))).status,401)
  assert.equal(reads,0);assert.equal(gameReads,0);assert.equal(writes.length,0)
  denied=false
  assert.equal((await get(new Request('https://test/api/cron/nba-market-capture'))).status,200)
  assert.equal(reads,1);assert.equal(gameReads,1);assert.deepEqual(writes.sort(),['game','props'])
})

test('NBA quote capture covers the third calendar date beyond sixteen games and rotates stored attempts, including failures',async()=>{
 const calls:string[]=[],reads:number[]=[],gameReads:number[]=[],attempts:string[]=[],writes:{name:string;game:number}[]=[]
 const games=Array.from({length:18},(_,index)=>({id:index+1,date:'2099-10-22',datetime:new Date(Date.now()+45*3600000).toISOString(),status_state:'scheduled'}))
 const prior=games.slice(0,8).map(game=>({key:'market-attempt:v4:pregame:'+game.id,fetched_at:new Date().toISOString()}))
 let hit=false
 const route=await compiled('../src/app/api/cron/nba-market-capture/route.ts',{
  'node:crypto':await import('node:crypto'),'next/server':{NextResponse:{json:Response.json}},'@/lib/cron-auth':{requireCronAuth:()=>null},'@/lib/pipelineHealth':{withPipelineHealth:(_name:string,run:unknown)=>run},'@/lib/nbaPaint':{nbaToday:()=> '2099-10-20'},'@/lib/nbaMovement':{nbaEconomicSnapshot},'@/lib/nbaOddsHistory':{nbaGameEconomicSnapshot},
  '@/lib/nbaSharedCache':{nbaSharedCache:async(key:string,_ttl:number,_stale:number,load:()=>Promise<unknown>)=>{attempts.push(key);return{value:hit?{status:'captured',accepted:0,unmatched:0,quotes:0}:await load()}}},
  '@/lib/supabase/admin':{createAdminClient:()=>({from:()=>({select:()=>({in:async()=>({data:prior,error:null})})}),rpc:(name:string,args:{p_game_id:number;p_feed:string})=>({abortSignal:async()=>{assert.equal(name,'record_nba_phase_capture');writes.push({name:args.p_feed,game:args.p_game_id});return{data:true,error:null}}})})},
  '@/lib/nbaPaintData':{getPaintGame:async(id:number)=>({...games.find(game=>game.id===id)!,status:'Scheduled',period:0}),getPaintSchedule:async(date:string)=>{calls.push(date);return{games:date==='2099-10-22'?[...games,{...games[0],id:99,datetime:new Date(Date.now()+49*3600000).toISOString()}]:[]}},getPaintPropSnapshot:async(game:{id:number})=>{reads.push(game.id);if(game.id===9)throw new Error('source unavailable');return propSnapshot([{...offer,game_id:game.id}])},getPaintGameOdds:async(id:number)=>{gameReads.push(id);return[gameQuote(id)]}}
 })
 const get=route.GET as(request:Request)=>Promise<Response>,response=await get(new Request('https://test/capture'))
 assert.equal(response.status,503);assert.deepEqual(calls,['2099-10-19','2099-10-20','2099-10-21','2099-10-22']);assert.equal(reads.length,18);assert.equal(reads[0],9);assert.equal(gameReads.length,18);assert.equal(writes.filter(row=>row.name==='props').length,17);assert.equal(writes.filter(row=>row.name==='game').length,18);assert.ok(writes.some(row=>row.game===9&&row.name==='game'));assert.equal(attempts.filter(key=>key.startsWith('market-attempt:v4:pregame:')).length,18);assert.equal(attempts.filter(key=>key.startsWith('first-basket-attempt:v3:pregame:')).length,18);assert.ok(!reads.includes(99));assert.ok(!gameReads.includes(99))
 assert.equal((await response.json()).failed,1)
 hit=true;reads.length=0;gameReads.length=0;writes.length=0
 const repeated=await get(new Request('https://test/capture')),summary=await repeated.json()
 assert.equal(repeated.status,200);assert.equal(reads.length,0);assert.equal(gameReads.length,0);assert.equal(writes.length,0);assert.equal(summary.captured,0);assert.equal(summary.deferred,18)
})

test('NBA game and player quote captures preserve the healthy archive when either source or archive fails',async()=>{
  for(const failure of ['props-source','game-source','props-write','game-write'] as const){
    const stored:string[]=[],requested:string[]=[]
    const route=await compiled('../src/app/api/cron/nba-market-capture/route.ts',{
      'node:crypto':await import('node:crypto'),'next/server':{NextResponse:{json:Response.json}},'@/lib/cron-auth':{requireCronAuth:()=>null},'@/lib/pipelineHealth':{withPipelineHealth:(_name:string,run:unknown)=>run},'@/lib/nbaPaint':{nbaToday:()=> '2099-10-20'},'@/lib/nbaMovement':{nbaEconomicSnapshot},'@/lib/nbaOddsHistory':{nbaGameEconomicSnapshot},'@/lib/nbaSharedCache':cachePassthrough,
      '@/lib/supabase/admin':{createAdminClient:()=>({from:()=>({select:()=>({in:async()=>({data:[],error:null})})}),rpc:(name:string,args:Record<string,unknown>)=>({abortSignal:async(signal:AbortSignal)=>{
        assert.ok(signal instanceof AbortSignal);assert.equal(args.p_game_id,123);assert.match(String(args.p_fingerprint),/^[a-f0-9]{64}$/)
        const kind=String(args.p_feed)
        assert.equal(name,'record_nba_phase_capture');requested.push(kind)
        if(failure===`${kind}-write`)return{data:null,error:{message:'fixture unavailable'}}
        stored.push(kind);return{data:true,error:null}
      }})})},
      '@/lib/nbaPaintData':{
        getPaintGame:async(id:number)=>({id,date:'2099-10-20',datetime:new Date(Date.now()+3600000).toISOString(),status:'Scheduled',status_state:'scheduled',period:0}),
        getPaintSchedule:async()=>({games:[{id:123,date:'2099-10-20',datetime:new Date(Date.now()+3600000).toISOString(),status_state:'scheduled'}]}),
        getPaintPropSnapshot:async(game:{id:number},mode:string,fresh:boolean)=>{assert.equal(game.id,123);assert.equal(mode,'pregame');assert.equal(fresh,true);if(failure==='props-source')throw new Error('fixture unavailable');return propSnapshot([offer])},
        getPaintGameOdds:async(id:number,fresh:boolean)=>{assert.equal(id,123);assert.equal(fresh,true);if(failure==='game-source')throw new Error('fixture unavailable');return[gameQuote(id)]},
      },
    })
    const response=await(route.GET as(request:Request)=>Promise<Response>)(new Request('https://test/capture'))
    const report=await response.json()
    assert.equal(response.status,503,failure);assert.equal(report.failed,1,failure);assert.equal(report.captured,0,failure)
    assert.deepEqual(stored,[failure.startsWith('props')?'game':'props'],failure)
    assert.equal(requested.length,failure.endsWith('source')?1:2,failure)
  }
})

test('NBA history enforces membership and validates market/game before archive reads',async()=>{
  let denied=true,reads=0,openingReads=0,openingFailed=false
  const openingRows:import('../src/lib/nbaOddsHistory.ts').NbaQuoteOpeningRow[]=[{game_id:123,player_id:434,vendor:'fanduel',market:'points',market_type:'over_under',line:20.5,side:'over',odds:-110,observed_at:'2026-10-19T00:00:00Z'}]
  const pure=await import('../src/lib/nbaPaint.ts')
  const route=await compiled('../src/app/the-paint/history/route.ts',{'next/server':{NextResponse:{json:Response.json}},'@/lib/paintAccess':{requirePaintAccess:async()=>denied?{error:Response.json({error:'Not available'},{status:403})}:{userId:'admin'}},'@/lib/nbaPaint':pure,'@/lib/nbaOddsHistoryData':{getNbaMarketFrames:async(game:number,market:string,player:number|null)=>{assert.equal(game,123);assert.equal(market,'points');assert.equal(player,null);reads++;return[]},getNbaQuoteOpenings:async(game:number)=>{assert.equal(game,123);openingReads++;if(openingFailed)throw new Error('fixture unavailable');return openingRows}}})
  const get=route.GET as unknown as(request:unknown)=>Promise<Response>
  assert.equal((await get({nextUrl:new URL('https://test/the-paint/history?game=123&market=points')})).status,403)
  denied=false
  assert.equal((await get({nextUrl:new URL('https://test/the-paint/history?game=123&market=nope')})).status,400)
  assert.equal(reads,0);assert.equal(openingReads,0)
  const response=await get({nextUrl:new URL('https://test/the-paint/history?game=123&market=points')})
  assert.equal(response.status,200);assert.deepEqual((await response.json()).openingRows,openingRows)
  assert.equal(reads,1);assert.equal(openingReads,1)
  openingFailed=true
  assert.equal((await get({nextUrl:new URL('https://test/the-paint/history?game=123&market=points')})).status,503)
})

test('NBA public event verification rejects the right teams on the wrong date',()=>{const game={date:'2026-10-20',visitor_team:{full_name:'Boston Celtics'},home_team:{full_name:'Detroit Pistons'}} as Parameters<typeof nbaPublicEventMatches>[0];assert.equal(nbaPublicEventMatches(game,'Boston Celtics vs. Detroit Pistons 10/20 2:00 PM'),true);assert.equal(nbaPublicEventMatches(game,'Boston Celtics vs. Detroit Pistons 10/21 2:00 PM'),false);assert.equal(nbaPublicEventMatches(game,'Boston Celtics vs. New York Knicks 10/20 2:00 PM'),false)})

test('quarter and binary markets never substitute full-game totals or season averages',()=>{
 const full={...stat(28),reb:11,ast:12,stl:0,blk:0},quarter={...full,period:1,pts:6,reb:2,ast:3}
 assert.equal(nbaValue(full,'points_1q'),null);assert.equal(nbaValue(quarter,'points_1q'),6);assert.equal(nbaValue(quarter,'points'),null)
 assert.equal(nbaValue(full,'double_double'),1);assert.equal(nbaValue(full,'triple_double'),1);assert.equal(nbaValue(quarter,'double_double'),null)
 assert.equal(nbaValue({...full,ast:null,reb:2},'double_double'),null);assert.equal(nbaValue({pts:25,reb:11,ast:10},'triple_double'),null)
 assert.equal(nbaValue({gp:50,dd2:20},'double_double'),.4);assert.equal(nbaValue({gp:0,dd2:0},'double_double'),null)
 const pick={id:'q',post_id:null,game_pk:'123',player_id:'bdl:434',player_name:null,pick_type:'points_1q',numeric_line:6,market_side:'milestone' as const}
 assert.equal(gradeNbaPick(pick,[full]),null);assert.equal(gradeNbaPick(pick,[full,quarter]),'win');assert.equal(gradeNbaPick({...pick,pick_type:'points',numeric_line:28,market_side:'over'},[quarter,full]),'push')
 const dd={...offer,prop_type:'double_double',line_value:'.5',market:{type:'milestone' as const,odds:140}}
 assert.equal(nbaTarget(dd),'Yes');assert.equal(nbaPrice(dd,'under'),undefined);assert.equal(nbaReference([dd],'double_double')?.id,dd.id);assert.equal(nbaReference([dd],'double_double','all','under'),null)
 const q={...dd,prop_type:'points_1q',line_value:'6'};assert.equal(nbaTarget(q),'6+');assert.equal(nbaHitRate([quarter],'points_1q',6,'over',true).rate,100)
 const player={logs:[full],periodLogs:[quarter]} as PaintPlayer;assert.equal(nbaMarketLogs(player,'points_1q')[0],quarter);assert.equal(nbaMarketLogs(player,'points')[0],full)
})

test('quarter provider failure cannot block unrelated full-game settlement',async()=>{
 const pending=[{id:'full',game_pk:'123',player_id:'bdl:434',pick_type:'points',numeric_line:20,market_side:'over'},{id:'quarter',game_pk:'123',player_id:'bdl:434',pick_type:'points_1q',numeric_line:6,market_side:'milestone'}],writes:string[]=[],periods:number[]=[]
 const chain={select:()=>chain,eq:()=>chain,not:()=>chain,lte:()=>chain,order:()=>chain,limit:async()=>({data:pending,error:null}),upsert:()=>({abortSignal:async()=>({error:null})})}
 const settlement=await compiled('../src/lib/nbaSettlement.ts',{'server-only':{},'./nbaPickGrading':{gradeNbaPick},'./nbaPaint':{nbaPeriod,nbaToday:()=> '2099-10-20'},'./nbaPaintData':{getPaintGame:async()=>({status_state:'final'}),getPaintFinalStats:async(_id:number,period:number)=>{periods.push(period);if(period===1)throw new Error('unavailable');return{complete:true,rows:[stat(21)]}}}})
 const result=await (settlement.settleNbaPicks as (admin:unknown)=>Promise<{graded:number;skipped:number}>)({from:()=>chain,rpc:(_name:string,args:{p_pick_id:string})=>({abortSignal:async(signal:AbortSignal)=>{assert.ok(signal instanceof AbortSignal);if(_name==='claim_pending_nba_picks')return{data:pending,error:null};writes.push(args.p_pick_id);return{data:true,error:null}}})})
 assert.deepEqual(periods,[0,1]);assert.deepEqual(writes,['full']);assert.equal(result.graded,1);assert.equal(result.skipped,1)
})
test('quarter and event selections revalidate exact books, targets and canonical labels before posting',async()=>{
 const pure=await import('../src/lib/nbaPaint.ts')
 for(const market of ['double_double','triple_double','points_1q','rebounds_1q','assists_1q']){
  const quote={...offer,prop_type:market,line_value:market.endsWith('_1q')?'6':'.5',market:{type:'milestone' as const,odds:140}}
  const selection=parseNbaSelection(nbaSelectionKey(434,quote,'over'))!;assert.equal(selection.prop_key,market)
  const validator=await compiled('../src/lib/nbaPickValidation.ts',{'server-only':{},'./nbaPaint':pure,'./nbaPaintData':{getPaintGame:async()=>({id:123,datetime:'2099-10-20T20:00:00Z',date:'2099-10-20',status_state:'scheduled',home_team:{id:2},visitor_team:{id:9}}),getPaintProps:async()=>[quote],getPaintIdentity:async()=>({first_name:'Canonical',last_name:'Player',team:{id:2,abbreviation:'BOS'}})}})
  const leg={...selection,player_name:'Test',team:'OLD',game_pk:'123',game_date:'2099-10-20',prop_label:'untrusted',book:'fanduel',odds:140}
  assert.equal(await (validator.validatePaintPickLegs as (legs:unknown[])=>Promise<unknown>)([leg]),null);assert.equal(leg.player_name,'Canonical Player');assert.match(leg.prop_label,market.endsWith('_1q')?/^6\+ First-quarter/:/^Yes /)
 }
})

test('per-game NBA tracking is phase, identity, final-status and historical-team exact, with honest missing windows',()=>{
 const log=stat(20,'2026-04-10'),raw={id:1,period:0,game:{...log.game},player:{id:log.player.id},team:{id:log.team.id},usage_percentage:.25,touches:0,net_rating:-5,matchup_minutes:'7:30',game_id:123}
 const row=nbaTrackingRow(raw,log)!;assert.equal(row.values.touches,0);assert.equal(row.values.net_rating,-5);assert.equal(row.values.matchup_minutes,7.5);assert.equal(row.values.game_id,undefined)
 assert.equal(nbaTrackingRow({...raw,period:1},log),null);assert.equal(nbaTrackingRow({...raw,game:{...raw.game,status:'Live',status_state:'in_progress'}},log),null);assert.equal(nbaTrackingRow({...raw,team:{id:999}},log),null);assert.equal(nbaTrackingRow({...raw,player:{id:999}},log),null)
 const older={...stat(10,'2026-04-09'),id:2,game:{...stat(10,'2026-04-09').game,id:124}},player={logs:[log,older],id:log.player.id} as PaintPlayer
 const sample=nbaTrackingSample(player,[row],'touches',5);assert.equal(sample.games,2);assert.equal(sample.known,1);assert.equal(sample.average,0);assert.equal(sample.observations[1].value,null)
 assert.equal(nbaTrackingField('usage_percentage').percentage,true);assert.equal(nbaTrackingField('touches').percentage,false);assert.equal(nbaTrackingField('matchup_fg_pct').group,'Matchup')
})

test('NBA public collection bounds startup, game work and cleanup while preserving its shared browser lease',async()=>{
 const game={id:123,date:new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York'}).format(new Date(Date.now()+6*3600000)),datetime:new Date(Date.now()+6*3600000).toISOString(),status:'Scheduled',status_state:'scheduled',period:0,visitor_team:{full_name:'Boston Celtics',abbreviation:'BOS'},home_team:{full_name:'Detroit Pistons',abbreviation:'DET'}}
 for(const scenario of ['healthy','startup-timeout','game-timeout','close-timeout','release-failed','unlisted','unlisted-rotation','partly-unlisted','auth-expired','auth-delayed']){
  let leagueReady=false,pageUrl='https://app.pikkit.com/leagues/nba'
  let closed=0,released=0,captured=0,openedOptions:unknown,resolveOpening:((browser:unknown)=>void)|undefined
  const never=()=>new Promise<never>(()=>{}),scrape=()=>{}
  const locator={filter:()=>locator,first:()=>locator,click:async()=>{},waitFor:async()=>{}}
  const listeners=new Map<string,Set<(event:unknown)=>unknown>>()
  const eventUrl='https://app.pikkit.com/event/fixture-event'
  const emitEvent=()=>{
    const request={url:()=> 'https://prod-website.pikkit.app/event/fixture-event'}
    const response={url:request.url,status:()=>200,json:async()=>({event:{_id:'fixture-event',start_time:game.datetime,event_info:{league:{short:'NBA'},away:{full:game.visitor_team.full_name,short:'BOS'},home:{full:game.home_team.full_name,short:'DET'}}}}),request:()=>request}
    for(const listener of listeners.get('request')??[])listener(request)
    for(const listener of listeners.get('response')??[])listener(response)
  }
  const browser={page:{setDefaultTimeout:()=>{},setDefaultNavigationTimeout:()=>{},on:(event:string,listener:(value:unknown)=>unknown)=>{if(!listeners.has(event))listeners.set(event,new Set());listeners.get(event)!.add(listener)},off:(event:string,listener:(value:unknown)=>unknown)=>{assert.ok(listeners.get(event)?.delete(listener))},goto:async(url:string)=>{if(scenario==='game-timeout')return never();pageUrl=url;if(url===eventUrl)emitEvent()},url:()=>scenario==='auth-expired'||scenario==='auth-delayed'&&leagueReady?'https://app.pikkit.com/login':pageUrl,waitForFunction:async()=>{leagueReady=true},waitForTimeout:async()=>{},getByText:()=>locator,evaluate:async(fn:unknown)=>fn===scrape?{url:pageUrl,capturedAt:new Date().toISOString(),complete:true,marketStates:[{label:'Points',value:'points',status:'captured',rows:1,observedAt:new Date().toISOString()}],props:{Points:{'Test Player':10}}}:'Boston Celtics Detroit Pistons 6:00 PM'},close:async()=>{closed++;if(scenario==='close-timeout')return never()}}
  const query={select:()=>query,in:()=>query,order:()=>query,limit:async()=>({data:scenario==='unlisted-rotation'?[{key:'public-attempt:nba-public-v2:123',fetched_at:new Date().toISOString()}]:[],error:null})}
  const imports={'@/lib/nbaSharedCache':cachePassthrough,'next/server':{NextResponse:{json:Response.json}},'@/lib/cron-auth':{requireBrowserbaseCronAuth:()=>null},'@/lib/pipelineHealth':{withPipelineHealth:(_name:string,run:unknown)=>run},'@/lib/nbaPaintData':{getPaintSchedule:async()=>({games:['unlisted-rotation','partly-unlisted','auth-expired'].includes(scenario)?[game,{...game,id:456}]:[game]})},'@/lib/nbaPaint':{nbaToday:()=>game.date},'@/lib/supabase/admin':{createAdminClient:()=>({from:()=>query})},'@/lib/pikkitBrowserLease':{acquirePikkitBrowserLease:async()=>({release:async()=>{released++;return scenario!=='release-failed'}})},'@/lib/browserbase':{openPikkitSession:async(_context:string,_metadata:unknown,options:unknown)=>{openedOptions=options;if(scenario==='startup-timeout')return new Promise(resolve=>{resolveOpening=resolve});return browser}},'@/lib/scrapers/gameMatch':{findAndClickPikkitGame:async()=>{if(scenario.startsWith('unlisted')||scenario==='partly-unlisted'&&captured>0)return false;await browser.page.goto(eventUrl);return true}},'@/lib/scrapers/nbaPikkitScraper':{runNbaPikkitScrape:scrape},'@/lib/nbaPublicServer':{importNbaPublic:async()=>{captured++;return{markets:1,rows:1,complete:true,available:true,observedAt:new Date().toISOString(),coverage:{captured:1}}}},'@/lib/nbaPublic':{NBA_PUBLIC_VERSION:'nba-public-v2'}}
  const route=await compiled('../src/app/api/cron/poll-pikkit-nba-picks/route.ts',imports,fetch,{process:{env:{PIKKIT_CONTEXT_ID:'test-only'}},setTimeout:(callback:()=>void)=>setTimeout(callback,5),clearTimeout})
  const response=await (route.GET as unknown as(request:Request)=>Promise<Response>)(new Request('https://test/api/cron/poll-pikkit-nba-picks'))
  const result=await response.json()
  assert.deepEqual(openedOptions,{requestTimeoutMs:15000})
  assert.ok([...listeners.values()].every(set=>set.size===0),'every completed or failed game removes its request and response listeners')
  if(scenario==='healthy'){assert.equal(response.status,200);assert.equal(captured,1);assert.equal(closed,1);assert.equal(released,1);assert.equal(result.results.length,1)}
  if(scenario==='game-timeout'){assert.equal(response.status,502);assert.equal(captured,0);assert.equal(closed,1);assert.equal(released,1);assert.equal(result.results[0].diagnostic.deadline,true)}
  if(scenario==='unlisted'){assert.equal(response.status,425);assert.equal(result.unavailable,1);assert.equal(result.deferred,1);assert.equal(captured,0);assert.equal(released,1)}
  if(scenario==='unlisted-rotation'){assert.equal(response.status,425);assert.deepEqual(result.results.map((row:{game:number})=>row.game),[456,123]);assert.equal(result.unavailable,2);assert.equal(result.deferred,2);assert.equal(captured,0);assert.equal(released,1)}
  if(scenario==='partly-unlisted'){assert.equal(response.status,425);assert.equal(result.failed,0);assert.equal(result.unavailable,1);assert.equal(result.deferred,1);assert.equal(captured,1);assert.equal(released,1)}
  if(scenario.startsWith('auth-')){assert.equal(response.status,503);assert.match(result.reason,/authentication is unavailable/);assert.equal(result.results.length,1);assert.equal(result.results[0].diagnostic.authenticationRequired,true);assert.equal(captured,0);assert.equal(closed,1);assert.equal(released,1)}
  if(scenario==='release-failed'){assert.equal(response.status,503);assert.equal(captured,1);assert.equal(closed,1);assert.equal(released,1);assert.match(result.cleanupIssues[0],/lease release could not be confirmed/)}
  if(scenario==='close-timeout'){assert.equal(response.status,503);assert.equal(released,0);assert.ok(result.cleanupIssues.length>0)}
  if(scenario==='startup-timeout'){assert.equal(response.status,503);assert.equal(released,0);assert.equal(closed,0);resolveOpening?.(browser);await new Promise(resolve=>setTimeout(resolve,10));assert.equal(closed,1)}
 }
})


test('unchanged successful NBA public reads satisfy the latest checkpoint without inventing history captures',async()=>{
 let opens=0,claims=0,currentVersion=true
 const game={id:123,datetime:new Date(Date.now()+3600000).toISOString(),status_state:'scheduled'},old=new Date(Date.now()-3600000).toISOString()
 const route=await compiled('../src/app/api/cron/poll-pikkit-nba-picks/route.ts',{
  'next/server':{NextResponse:{json:Response.json}},'@/lib/cron-auth':{requireBrowserbaseCronAuth:()=>null},'@/lib/pipelineHealth':{withPipelineHealth:(_name:string,run:unknown)=>run},'@/lib/nbaPaintData':{getPaintSchedule:async()=>({games:[game]})},'@/lib/nbaPaint':{nbaToday:()=> '2026-10-19'},'@/lib/nbaSharedCache':{},'@/lib/pikkitBrowserLease':{acquirePikkitBrowserLease:async()=>{claims++;return null}},'@/lib/browserbase':{openPikkitSession:()=>{opens++;throw new Error('unexpected browser')}},'@/lib/scrapers/gameMatch':{},'@/lib/scrapers/nbaPikkitScraper':{},'@/lib/nbaPublicServer':{},'@/lib/nbaPublic':{NBA_PUBLIC_VERSION:'nba-public-v2'},
  '@/lib/supabase/admin':{createAdminClient:()=>({from:(table:string)=>{const query={select:()=>query,in:()=>query,order:()=>query,limit:async()=>({data:table==='nba_public_captures'?[{game_id:123,captured_at:old}]:[{key:currentVersion?'public-success:nba-public-v2:123':'public-success:v1:123',fetched_at:new Date().toISOString()}],error:null})};return query}})}
 },fetch,{process:{env:{PIKKIT_CONTEXT_ID:'test-only'}}})
 const response=await (route.GET as(request:Request)=>Promise<Response>)(new Request('https://test/capture'))
 assert.equal(response.status,200);assert.equal((await response.json()).skipped,'Captures are current');assert.equal(opens,0);assert.equal(claims,0)
 currentVersion=false
 const outdated=await (route.GET as(request:Request)=>Promise<Response>)(new Request('https://test/capture'))
 assert.equal(outdated.status,425);assert.equal((await outdated.json()).stage,'deferred');assert.equal(claims,1);assert.equal(opens,0)
})

test('Pikkit lease release reports RPC failure and keeps a single result without blind retries',async()=>{
 for(const failure of [false,true]){
  const calls:string[]=[]
  const leaseModule=await compiled('../src/lib/pikkitBrowserLease.ts',{
   'node:crypto':await import('node:crypto'),
   '@/lib/supabase/admin':{createAdminClient:()=>({rpc:async(name:string,args:Record<string,unknown>)=>{
    calls.push(name);assert.equal(args.p_lease_key,'pikkit-persisted-context')
    if(name==='try_acquire_browser_automation_lease'){assert.equal(args.p_ttl_seconds,360);return{data:true,error:null}}
    assert.equal(name,'release_browser_automation_lease');assert.equal(args.p_cooldown_seconds,8)
    return{data:!failure,error:failure?{message:'Test schema cache failure'}:null}
   }})},
  })
  const lease=await (leaseModule.acquirePikkitBrowserLease as()=>Promise<{release:()=>Promise<boolean>}> )()
  assert.deepEqual(await Promise.all([lease.release(),lease.release()]),[!failure,!failure])
  assert.equal(await lease.release(),!failure)
  assert.deepEqual(calls,['try_acquire_browser_automation_lease','release_browser_automation_lease'])
 }
})

test('NBA conditional refresh authenticates first, preserves meaningful changes and returns no repeated historical payload',async()=>{
 let denied=true,reads=0
 let board={game:{id:123},fetchedAt:'2026-10-19T07:00:00Z',issues:[] as string[],statsComplete:true,players:[{id:434,injury:null,logs:[stat(20)],props:[offer]}]}
 const route=await compiled('../src/app/the-paint/board/route.ts',{'node:crypto':await import('node:crypto'),'next/server':{NextResponse:{json:Response.json}},'@/lib/paintAccess':{requirePaintAccess:async()=>denied?{error:Response.json({},{status:403})}:{userId:'admin'}},'@/lib/nbaPaintData':{getPaintGame:async()=>{reads++;return{id:123}},getPaintBoard:async()=>board}})
 const get=route.GET as(request:unknown)=>Promise<Response>,request=(etag?:string)=>({nextUrl:new URL('https://test/board?game=123'),headers:new Headers(etag?{'if-none-match':etag}:{})})
 assert.equal((await get(request())).status,403);assert.equal(reads,0)
 denied=false
 const first=await get(request()),etag=first.headers.get('etag')!
 assert.equal(first.status,200);assert.ok(etag);assert.equal(first.headers.get('cache-control'),'private, no-store')
 board={...board,fetchedAt:'2026-10-19T07:01:00Z',players:board.players.map(player=>({...player,props:player.props.map(prop=>({...prop,updated_at:'2026-10-19T07:01:00Z'}))}))}
 const same=await get(request(etag));assert.equal(same.status,304);assert.equal(await same.text(),'');assert.equal(same.headers.get('x-nba-fetched-at'),board.fetchedAt)
 board={...board,players:board.players.map(player=>({...player,logs:[stat(21)]}))}
 const statChange=await get(request(etag));assert.equal(statChange.status,200);assert.notEqual(statChange.headers.get('etag'),etag)
 board={...board,players:board.players.map(player=>({...player,props:player.props.map(prop=>({...prop,market:{...prop.market,over_odds:130}}))}))}
 const priceChange=await get(request(statChange.headers.get('etag')!));assert.equal(priceChange.status,200)
 board={...board,issues:['Quarter coverage incomplete'],statsComplete:false}
 assert.equal((await get(request(statChange.headers.get('etag')!))).status,200)
})

test('cold NBA cache followers wait through a slow healthy owner but respect shorter lease budgets',async()=>{
 let reads=0,waited=0,readyAfter=15000,loads=0
 const entry={payload:{points:25},fetched_at:new Date().toISOString(),expires_at:new Date(Date.now()+60000).toISOString()}
 const admin={
   from:()=>({
     select:()=>({
       eq:()=>({
         abortSignal:(signal:AbortSignal)=>{
           assert.ok(signal instanceof AbortSignal)
           return{maybeSingle:async()=>{reads++;return{data:waited>=readyAfter?entry:null,error:null}}}
         },
       }),
     }),
   }),
   rpc:async()=>({data:false,error:null}),
 }
 const cacheModule=await compiled('../src/lib/nbaSharedCache.ts',{'server-only':{},'node:crypto':await import('node:crypto'),'./supabase/admin':{createAdminClient:()=>admin}},fetch,{setTimeout:(callback:()=>void,ms:number)=>{waited+=ms;queueMicrotask(callback);return 0}})
 const cache=cacheModule.nbaSharedCache as typeof import('../src/lib/nbaSharedCache.ts').nbaSharedCache
 const result=await cache('slow-owner',60,300,async()=>{loads++;return{points:99}})
 assert.equal(result.value.points,25);assert.equal(loads,0);assert.ok(waited>=15000&&waited<=45000);assert.ok(reads<10,'backoff bounds reads while the owner is loading')
 reads=0;waited=0;readyAfter=Infinity
 await assert.rejects(()=>cache('short-owner',60,300,async()=>({points:99}),6),/warming/)
 assert.equal(waited,1000);assert.equal(reads,3)
})

test('NBA cache post-commit and follower reads bypass render-pass memoized initial misses with fresh signals',async()=>{
  type CacheRow={payload:{points:number};fetched_at:string;expires_at:string}
  type ReadBuilder={abortSignal:(next:AbortSignal)=>ReadBuilder;maybeSingle:()=>Promise<{data:CacheRow|null;error:null}>}
  const ready:CacheRow={payload:{points:25},fetched_at:new Date().toISOString(),expires_at:new Date(Date.now()+60000).toISOString()}
  for(const mode of ['owner','follower'] as const){
    let entry:CacheRow|null=null,loads=0,writes=0,waits=0,reads=0
    const signals:AbortSignal[]=[]
    const createScopedClient=()=>{
      let memoized=false,memo:CacheRow|null=null
      // Model Next's render-pass GET dedupe: identical reads without an explicit
      // signal reuse their initial response even after a separate POST commits.
      const select=(signal?:AbortSignal):ReadBuilder=>({
        abortSignal:(next:AbortSignal)=>select(next),
        maybeSingle:async()=>{
          reads++
          if(signal){signals.push(signal);return{data:entry,error:null}}
          if(!memoized){memo=entry;memoized=true}
          return{data:memo,error:null}
        },
      })
      return{from:()=>({select:()=>({eq:()=>select()}),update:()=>({eq:()=>({eq:async()=>({error:null})})})}),rpc:async(name:string,args:Record<string,unknown>)=>{
        if(name==='claim_nba_source')return{data:mode==='owner',error:null}
        assert.equal(name,'finish_nba_source');writes++;entry={...ready,payload:args.p_payload as CacheRow['payload']};return{data:true,error:null}
      }}
    }
    // Demonstrate that this fixture reproduces the original stale-miss behavior.
    const control=createScopedClient().from().select().eq()
    assert.equal((await control.maybeSingle()).data,null)
    entry=ready;assert.equal((await control.maybeSingle()).data,null)
    entry=null;reads=0
    const cacheModule=await compiled('../src/lib/nbaSharedCache.ts',{'server-only':{},'node:crypto':await import('node:crypto'),'./supabase/admin':{createAdminClient:createScopedClient}},fetch,{setTimeout:(callback:()=>void)=>{if(++waits===2)entry=ready;queueMicrotask(callback);return 0}})
    const cache=cacheModule.nbaSharedCache as typeof import('../src/lib/nbaSharedCache.ts').nbaSharedCache
    const result=await cache(`memoized-${mode}`,60,300,async()=>{loads++;return{points:25}})
    assert.equal(result.value.points,25);assert.equal(result.stale,false);assert.equal(result.fetchedAt,ready.fetched_at)
    assert.equal(loads,mode==='owner'?1:0);assert.equal(writes,mode==='owner'?1:0);assert.equal(reads,3)
    assert.equal(signals.length,reads);assert.equal(new Set(signals).size,reads)
    assert.ok(signals.every(signal=>signal instanceof AbortSignal&&!signal.aborted))
  }
})

test('NBA customer projections authenticate first and return results without model internals',async()=>{
  let reads=0, denied=true
  const model={ready:true,version:'nba-rolling-v1',market:'points',method:'blend',recentWeight:.35,modelKey:'internal-method',trainingSeasons:[2023,2024],trainingGames:20000,trainingPlayers:500,trainingMae:4,trainedThrough:'2025-04-13',validationSeason:2025,validationGames:10000,validationPlayers:500,validationMae:4,validationRmse:6,validationBias:0,baselineMae:4.2,validationFrom:'2025-10-20',validationThrough:'2026-04-13'} satisfies NbaModelReport
  const logs=Array.from({length:20},(_,i)=>({...stat(10+i,`2026-03-${String(i+1).padStart(2,'0')}`),id:i+1}))
  const query={select:()=>query,eq:()=>query,order:()=>query,limit:()=>query,abortSignal:async()=>({data:[{report:model}],error:null})}
  const imports={
    'next/server':{NextResponse:{json:Response.json}},
    '@/lib/paintAccess':{requirePaintAccess:async()=>denied?{error:Response.json({},{status:403})}:{}},
    '@/lib/nbaPaintData':{getPaintGame:async()=>{reads++;return{id:123}},getPaintBoard:async()=>({game:{id:123,date:'2026-10-20'},players:[{id:434,logs}],fetchedAt:'2026-10-19T12:00:00Z'})},
    '@/lib/nbaPaint':await import('../src/lib/nbaPaint.ts'),
    '@/lib/nbaModel':{nbaValidatedEstimate},
    '@/lib/nbaResearchResources':{getNbaResearchModels:async()=>{reads++;return[model]}},
    '@/lib/nbaSharedCache':cachePassthrough,
    '@/lib/supabase/admin':{createAdminClient:()=>({from:()=>{reads++;return query}})},
  }
  const route=await compiled('../src/app/the-paint/estimate/route.ts',imports)
  const invoke=(search='game=123&player=434&market=points')=>(route.GET as(r:unknown)=>Promise<Response>)({nextUrl:new URL('https://test/the-paint/estimate?'+search)})
  assert.equal((await invoke()).status,403);assert.equal(reads,0)
  denied=false
  assert.equal((await invoke('game=123&player=434&market=invalid')).status,400);assert.equal(reads,0)
  const response=await invoke(),body=await response.json()
  assert.equal(response.status,200);assert.equal(body.estimate,20.5);assert.equal(body.games,20)
  assert.deepEqual(Object.keys(body).sort(),['estimate','fetchedAt','gameId','games','market','playerId'].sort())
  assert.equal(JSON.stringify(body).includes('internal-method'),false)
  assert.equal((await invoke('game=123&player=999&market=points')).status,404)
})
