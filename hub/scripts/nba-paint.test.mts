import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import { gradeNbaValue, nbaAverage, nbaDate, nbaHitRate, nbaMinutes, nbaName, nbaReference, nbaSample, nbaSelectionKey, nbaValue, parseNbaSelection, nbaWeightedRank, nbaTeamLogo, type PaintPlayer, type PaintStat, type PaintProp } from '../src/lib/nbaPaint.ts'
import { gradeNbaPick } from '../src/lib/nbaPickGrading.ts'
import type { WatchlistItem } from '../src/lib/watchlist.ts'
import { watchlistPickPayload } from '../src/lib/nflWatchlist.ts'
import { nbaMarketRanks } from '../src/lib/nbaMarketMetrics.ts'
import { nbaEconomicSnapshot,nbaMovement } from '../src/lib/nbaMovement.ts'
import { nbaCheatsheet,nbaRole } from '../src/lib/nbaResearch.ts'
import { nbaPublicEventMatches,nbaPublicMarket,normalizeNbaPublic } from '../src/lib/nbaPublic.ts'
import { nbaDefenseProfiles,nbaProductionEstimate,nbaSlipSurgeScore,nbaWalkForward } from '../src/lib/nbaIntelligence.ts'
import { nbaShots,type NbaPlay } from '../src/lib/nbaShots.ts'
import { nbaDivergences } from '../src/lib/nbaDivergence.ts'
import { nbaSlateRows } from '../src/lib/nbaSlate.ts'
import { nbaValidatedEstimate,type NbaModelReport } from '../src/lib/nbaModel.ts'
const cachePassthrough={nbaSharedCache:async(_key:string,_ttl:number,_stale:number,load:()=>Promise<unknown>)=>({value:await load(),fetchedAt:new Date().toISOString(),stale:false})}

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
  const players=[30,20,10].map((pts,i)=>({id:i+1,first_name:'Test',last_name:String(i),position:'G',team:{id:2,abbreviation:'BOS',full_name:'Boston Celtics',name:'Celtics'},average:{pts},logs:Array.from({length:10},(_,n)=>({...stat(pts),id:n+1})),props:[{...offer,player_id:i+1,line_value:String([10,20,30][i])}],headshot:null,injury:null})) satisfies PaintPlayer[]
  const game={id:123,date:'2026-10-20',season:2026,status:'Scheduled',datetime:'2026-10-20T23:00:00Z',period:0,home_team:players[0].team,visitor_team:{...players[0].team,id:9},home_team_score:0,visitor_team_score:0}
  const meta={sampleSeason:2025,historical:false,sampleEnd:'2026-04-13',statsComplete:true,fetchedAt:'2026-10-19T00:00:00Z',issues:[]}
  const boards=[{...meta,game,players:players.slice(0,2)},{...meta,game:{...game,id:456},players:players.slice(2).map(player=>({...player,props:player.props.map(offer=>({...offer,game_id:456}))}))}] satisfies import('../src/lib/nbaPaint.ts').PaintBoard[]
  const over=nbaSlateRows(boards,'points','fanduel','over',true), under=nbaSlateRows(boards,'points','fanduel','under',true)
  assert.equal(over.find(row=>row.player.id===1)?.mm,2)
  assert.equal(over.find(row=>row.player.id===3)?.mm,-2)
  assert.equal(under.find(row=>row.player.id===1)?.gap,-over.find(row=>row.player.id===1)!.gap!)
  assert.ok(nbaSlateRows(boards,'points','fanduel','over',false).every(row=>row.mm===null))
  assert.equal(nbaSlateRows(boards,'points','draftkings','over',true).length,0)
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
  const imports={'next/server':{NextResponse:{json:Response.json}},'node:crypto':{},'@/lib/cron-auth':{requireCronAuth:()=>Response.json({},{status:401})},'@/lib/pipelineHealth':{withPipelineHealth:(_name:string,run:unknown)=>run},'@/lib/supabase/admin':{createAdminClient:()=>{reads++;throw new Error('Unexpected read')}},'@/lib/nbaIngestion':{},'@/lib/nbaPaintData':{},'@/lib/nbaIntelligenceData':{},'@/lib/nbaIntelligence':{},'@/lib/nbaModel':{},'@/lib/nbaSharedCache':{},'@/lib/nbaPaint':{}}
  for(const job of ['nba-research-sync','nba-model-validate','nba-research-snapshot']){
    const route=await compiled(`../src/app/api/cron/${job}/route.ts`,imports)
    assert.equal((await(route.GET as(r:Request)=>Promise<Response>)(new Request(`https://test/api/cron/${job}`))).status,401)
  }
  const model=await compiled('../src/app/the-paint/models/route.ts',{...imports,'@/lib/paintAccess':{requirePaintAccess:async()=>({error:Response.json({},{status:403})})}})
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
  const provider=await compiled('../src/lib/nbaPaintData.ts',{'server-only':{},'@/lib/balldontlie':{bdlHeaders:{}},'./nbaPaint':{...pure,nbaToday:()=>'2026-10-19'},'./nbaSharedCache':cachePassthrough},fetcher)
  const board=await (provider.getPaintBoard as (game:unknown)=>Promise<import('../src/lib/nbaPaint.ts').PaintBoard>)({id:123,date:'2026-10-21',season:2026,home_team:team,visitor_team:{...team,id:9}})
  assert.deepEqual(board.baselineSeasons,[2025,2026]);assert.equal(board.statsComplete,true)
  assert.deepEqual(board.players[0].logs.map(row=>row.pts),[24,20]);assert.equal(board.players[0].average.pts,24);assert.equal(board.players[0].averageSeason,2026)
  assert.equal(board.players[1].average.pts,16);assert.equal(board.players[1].averageSeason,2025)
  assert.equal(board.players[2].average.pts,null);assert.equal(board.players[2].logs.length,0)
})

test('NBA shared cache coalesces cold readers across leases and retains source time on stale failure',async()=>{
  let entry:Record<string,unknown>|null=null,lease:string|null=null,loads=0,reads=0
  const admin={from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>{reads++;return{data:entry,error:null}}})}),update:()=>({eq:()=>({eq:async()=>{lease=null;return{error:null}}})})}),rpc:async(name:string,args:Record<string,unknown>)=>{
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
  const players=[30,20,10].map((pts,i)=>({id:i+1,first_name:'Test',last_name:String(i),position:'G',team:{id:2,abbreviation:'BOS',full_name:'Boston Celtics',name:'Celtics'},average:{pts},logs:Array.from({length:10},(_,n)=>({...stat(pts),id:n+1})),props:[{...offer,player_id:i+1,line_value:String([10,20,30][i])}],headshot:null,injury:null})) satisfies PaintPlayer[]
  const rows=nbaCheatsheet(players,'fanduel','over')
  assert.deepEqual(rows.map(r=>r.mm),[2,0,-2])
  assert.equal([...rows].sort((a,b)=>b.mm!-a.mm!)[0].player.id,1)
  assert.equal([...rows].sort((a,b)=>a.mm!-b.mm!)[0].player.id,3)
  assert.equal(nbaCheatsheet(players,'draftkings').length,0)
  assert.equal(nbaCheatsheet(players,'fanduel','under')[0].gap,-rows[0].gap!)
  assert.equal(rows[1].hit.rate,null)
  assert.equal(nbaCheatsheet(players.map(p=>({...p,logs:p.logs.slice(0,4)}))).length,0)
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

test('NBA public counts reject partial periods, fuzzy identities and invalid counts without double-counting',()=>{
  const roster=[{id:1,first_name:'Jalen',last_name:'Williams'},{id:2,first_name:'Jaylin',last_name:'Williams'}] as PaintPlayer[]
  assert.equal(nbaPublicMarket('Points + Rebounds + Assists'),'points_rebounds_assists')
  assert.equal(nbaPublicMarket('Three Pointers Made'),'threes')
  assert.equal(nbaPublicMarket('First Quarter Points'),null)
  const result=normalizeNbaPublic({'Points':{'Jalen Williams':10,'Jaylin Williams':0,'J. Williams':90,'Invented Player':30},'Player Points':{'Jalen Williams':10},'First Quarter Points':{'Jalen Williams':99},'Rebounds':{'Jalen Williams':-5}},roster)
  assert.equal(result.rows.length,2)
  assert.deepEqual(result.rows.map(r=>r.picks),[10,0])
  assert.equal(result.unmatched,2)
})

test('new NBA research APIs reject non-admins and invalid games before loading providers',async()=>{
  for(const file of ['../src/app/the-paint/scouting/route.ts','../src/app/the-paint/public/route.ts','../src/app/the-paint/results/route.ts','../src/app/the-paint/intelligence/route.ts','../src/app/the-paint/shots/route.ts','../src/app/the-paint/slate/route.ts','../src/app/the-paint/divergence/route.ts']){
    let denied=true
    const route=await compiled(file,{'next/server':{NextResponse:{json:Response.json}},'@/lib/paintAccess':{requirePaintAccess:async()=>denied?{error:Response.json({}, {status:403})}:{userId:'admin'}},'@/lib/nbaPaintData':{},'@/lib/nbaIntelligenceData':{},'@/lib/nbaShotsData':{},'@/lib/nbaShots':{},'@/lib/nbaSharedCache':{},'@/lib/nbaSlate':{},'@/lib/nbaDivergence':{},'@/lib/supabase/admin':{},'@/lib/nbaPaint':{}})
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
  const provider=await compiled('../src/lib/nbaPaintData.ts',{'server-only':{},'@/lib/balldontlie':{bdlHeaders:{}},'./nbaPaint':pure,'./nbaSharedCache':cachePassthrough},async()=>{reads++;throw new Error('Unexpected provider read')})
  const scouting=await (provider.getPaintScouting as unknown as(g:unknown)=>Promise<{players:unknown[];issues:string[]}> )({date:'2000-01-01',season:1999})
  assert.equal(reads,0);assert.equal(scouting.players.length,0);assert.ok(scouting.issues.length)
})

test('NBA Pikkit collector denies unauthorized calls before schedule or cloud browser work',async()=>{
  let reads=0
  const route=await compiled('../src/app/api/cron/poll-pikkit-nba-picks/route.ts',{'next/server':{NextResponse:{json:Response.json}},'@/lib/cron-auth':{requireBrowserbaseCronAuth:()=>Response.json({},{status:401})},'@/lib/pipelineHealth':{withPipelineHealth:(_n:string,r:unknown)=>r},'@/lib/nbaPaintData':{getPaintSchedule:()=>{reads++}},'@/lib/nbaPaint':{},'@/lib/supabase/admin':{},'@/lib/pikkitBrowserLease':{},'@/lib/browserbase':{},'@/lib/scrapers/gameMatch':{},'@/lib/scrapers/nbaPikkitScraper':{},'@/lib/nbaPublicServer':{},'@/lib/nbaPublic':{}})
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
test('reference lines use main markets and the most widely quoted numeric line', () => {
  const ladder = { ...offer, line_value: '10', market: { type: 'milestone' as const, odds: 200 } }
  const more = { ...offer, vendor: 'draftkings', line_value: '20.5' }
  assert.equal(nbaReference([ladder], 'points'), null)
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

async function compiled(file: string, imports: Record<string, unknown>, fetcher: typeof fetch = fetch) {
  const source = await readFile(new URL(file, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
  const target = { exports: {} as Record<string, (...args: never[]) => unknown> }
  new Function('require', 'exports', 'module', 'fetch', outputText)((name: string) => { assert.ok(name in imports, name); return imports[name] }, target.exports, target, fetcher)
  return target.exports
}
test('server authorization fails closed for guests, regular members and failed role reads', async () => {
  for (const [id, role, error, status] of [[null, null, null, 401], ['u', 'member', null, 403], ['u', 'admin', 'db error', 403], ['u', 'admin', null, undefined]] as const) {
    const gate = await compiled('../src/lib/paintAccess.ts', { 'server-only': {}, 'next/server': { NextResponse: { json: Response.json } }, '@/lib/requireTier': { resolveAuthedClient: async () => ({ userId: id, supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { account_type: role }, error }) }) }) }) } }) } })
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
  const adapter = await compiled('../src/lib/nbaPaintData.ts', { 'server-only': {}, '@/lib/balldontlie': { bdlHeaders: { Authorization: 'test-only' } }, './nbaPaint': pure, './nbaSharedCache':cachePassthrough }, fetcher)
  const board = await (adapter.getPaintBoard as unknown as (game: unknown) => Promise<import('../src/lib/nbaPaint.ts').PaintBoard>)({ id: 123, date: '2026-10-20', season: 2026, status: '2026-10-20T23:00:00Z', datetime: '2026-10-20T23:00:00Z', home_team: team, visitor_team: { ...team, id: 9, abbreviation: 'DET' } })
  assert.equal(board.sampleSeason, 2025)
  assert.equal(board.statsComplete, false)
  assert.ok(board.issues.some(i => i.includes('incomplete')), JSON.stringify({issues:board.issues,players:board.players.length,urls}))
  assert.equal(board.players[0].logs.length, 1)
  assert.equal(board.players[0].logs[0].pts, 22)
  assert.ok(urls.some(u => u.includes('end_date=2026-07-01')))
})

test('MM compares the same priced roster, preserves ties and signs, and excludes missing samples', () => {
  const players = [30, 20, 10].map((pts, i) => ({ id: i + 1, first_name: 'Test', last_name: String(i), position: 'G', team: { id: 2, abbreviation: 'BOS', full_name: 'Boston Celtics', name: 'Celtics' }, average: { pts }, logs: Array.from({ length: 5 }, (_, n) => ({ ...stat(pts), id: n + 1 })), props: [{ ...offer, player_id: i + 1, line_value: String([10, 20, 30][i]) }], headshot: null, injury: null })) satisfies PaintPlayer[]
  const ranks = nbaMarketRanks(players, 'points')
  assert.equal(ranks.get(1)?.mm, 2); assert.equal(ranks.get(3)?.mm, -2)
  assert.equal(nbaMarketRanks(players, 'assists').size, 0)
  assert.equal(nbaMarketRanks(players.map(p => ({ ...p, logs: [] })), 'points').size, 0)
  const consensus = [{ ...offer, line_value: '15', vendor: 'fanduel' }, { ...offer, line_value: '20', vendor: 'fanduel' }, { ...offer, line_value: '20', vendor: 'draftkings' }]
  assert.equal(nbaReference(consensus, 'points', 'fanduel')?.line_value, '20')
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
  const settlement = await compiled('../src/lib/nbaSettlement.ts', { 'server-only': {}, './nbaPickGrading': { gradeNbaPick }, './nbaPaint': { nbaToday: () => '2099-10-20' }, './nbaPaintData': { getPaintGame: async () => ({ status_state: 'final' }), getPaintFinalStats: async () => ({ complete: true, rows: [stat(21)] }) } })
  const chain = { select: () => chain, eq: () => chain, not: () => chain, lte: () => chain, order: () => chain, limit: async () => ({ data: picks, error: null }) }
  const settled = await (settlement.settleNbaPicks as unknown as (client: unknown) => Promise<{ graded: number }>)({ from: () => chain, rpc: async (name: string, args: Record<string, unknown>) => { assert.equal(name, 'settle_nba_pick_exact'); assert.deepEqual(args, { p_pick_id: 'pick-0', p_result: 'win' }); return { data: true, error: null } } })
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
    const chain = { select: () => chain, eq: () => chain, not: () => chain, lte: () => chain, order: () => chain, limit: async () => ({ data: [pending], error: null }) }
    const settlement = await compiled('../src/lib/nbaSettlement.ts', { 'server-only': {}, './nbaPickGrading': { gradeNbaPick }, './nbaPaint': { nbaToday: () => '2099-10-20' }, './nbaPaintData': {
      getPaintGame: async () => { if (scenario === 'provider') throw new Error('provider'); return { status_state: scenario === 'live' ? 'in_progress' : 'final' } },
      getPaintFinalStats: async () => ({ complete: scenario !== 'partial', rows: scenario === 'missing' ? [] : [{ ...stat(21), player: { id: scenario === 'identity' ? 999 : 434 } }] }),
    } })
    const report = await (settlement.settleNbaPicks as unknown as (client: unknown) => Promise<{ graded: number }> )({ from: () => chain, rpc: async () => { calls++; return { data: null, error: { message: 'write unavailable' } } } })
    assert.equal(report.graded, 0); assert.equal(calls, scenario === 'rpc' ? 1 : 0)
  }
})

test('NBA collector requires cron authorization, deduplicates schedules and captures only pretipoff games', async()=>{
  let reads=0,writes=0,denied=true
  const crypto=await import('node:crypto')
  const route=await compiled('../src/app/api/cron/nba-market-capture/route.ts',{
    'node:crypto':crypto,'next/server':{NextResponse:{json:Response.json}},'@/lib/cron-auth':{requireCronAuth:()=>denied?Response.json({error:'Unauthorized'},{status:401}):null},'@/lib/pipelineHealth':{withPipelineHealth:(_name:string,run:unknown)=>run},'@/lib/supabase/admin':{createAdminClient:()=>({rpc:async(name:string,args:Record<string,unknown>)=>{assert.equal(name,'record_nba_market_capture');assert.equal(args.p_game_id,123);writes++;return{data:true,error:null}}})},'@/lib/nbaPaintData':{getPaintSchedule:async()=>({games:[{id:123,date:'2099-10-20',datetime:'2099-10-20T20:00:00Z',status_state:'scheduled'},{id:456,date:'2000-01-01',datetime:'2000-01-01T20:00:00Z',status_state:'final'}]}),getPaintProps:async()=>{reads++;return[offer]}},'@/lib/nbaMovement':{nbaEconomicSnapshot},'@/lib/nbaPaint':{nbaToday:()=> '2099-10-20'},
  })
  const get=route.GET as unknown as(request:Request)=>Promise<Response>
  assert.equal((await get(new Request('https://test/api/cron/nba-market-capture'))).status,401)
  assert.equal(reads,0);assert.equal(writes,0)
  denied=false
  assert.equal((await get(new Request('https://test/api/cron/nba-market-capture'))).status,200)
  assert.equal(reads,1);assert.equal(writes,1)
})

test('NBA history remains admin-gated and validates market/game before archive reads',async()=>{
  let denied=true,reads=0
  const pure=await import('../src/lib/nbaPaint.ts')
  const route=await compiled('../src/app/the-paint/history/route.ts',{'next/server':{NextResponse:{json:Response.json}},'@/lib/paintAccess':{requirePaintAccess:async()=>denied?{error:Response.json({error:'Not available'},{status:403})}:{userId:'admin'}},'@/lib/supabase/admin':{createAdminClient:()=>({rpc:()=>({abortSignal:async()=>{reads++;return{data:[],error:null}}})})},'@/lib/nbaPaint':pure})
  const get=route.GET as unknown as(request:unknown)=>Promise<Response>
  assert.equal((await get({nextUrl:new URL('https://test/the-paint/history?game=123&market=points')})).status,403)
  denied=false
  assert.equal((await get({nextUrl:new URL('https://test/the-paint/history?game=123&market=nope')})).status,400)
  assert.equal(reads,0)
  assert.equal((await get({nextUrl:new URL('https://test/the-paint/history?game=123&market=points')})).status,200)
  assert.equal(reads,1)
})

test('NBA public event verification rejects the right teams on the wrong date',()=>{const game={date:'2026-10-20',visitor_team:{full_name:'Boston Celtics'},home_team:{full_name:'Detroit Pistons'}} as Parameters<typeof nbaPublicEventMatches>[0];assert.equal(nbaPublicEventMatches(game,'Boston Celtics vs. Detroit Pistons 10/20 2:00 PM'),true);assert.equal(nbaPublicEventMatches(game,'Boston Celtics vs. Detroit Pistons 10/21 2:00 PM'),false);assert.equal(nbaPublicEventMatches(game,'Boston Celtics vs. New York Knicks 10/20 2:00 PM'),false)})
