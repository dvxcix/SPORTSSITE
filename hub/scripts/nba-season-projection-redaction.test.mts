import assert from 'node:assert/strict'
import test from 'node:test'
import {nbaSelectedSeasonEstimate,nbaValidatedEstimate,type NbaModelReport} from '../src/lib/nbaModel.ts'
import type {PaintStat} from '../src/lib/nbaPaint.ts'
const report: NbaModelReport={ready:true,version:'nba-rolling-v1',market:'points',method:'blend',recentWeight:.5,modelKey:'fixture',trainingSeasons:[2023,2024],trainingGames:20000,trainingPlayers:500,trainingMae:4,trainedThrough:'2025-04-13',validationSeason:2025,validationGames:10000,validationPlayers:500,validationMae:4,validationRmse:6,validationBias:0,baselineMae:4.2,validationFrom:'2025-10-20',validationThrough:'2026-04-13'}
function stat(id:number,season:number,day:string,pts:number):PaintStat{return{id,player:{id:9},team:{id:2},game:{id:id+100,date:day,season,postseason:false,status:'Final',home_team_id:1,visitor_team_id:2},min:'15',pts,reb:2,ast:1,fg3m:0,stl:0,blk:0,turnover:1,fga:2,fgm:1,fg3a:1,fta:0,ftm:0}}
const prior=Array.from({length:18},(_,i)=>stat(i+1,2025,`2026-03-${String(i+1).padStart(2,'0')}`,36))
const current=[stat(100,2026,'2026-11-01',22),stat(101,2026,'2026-11-02',22)]
test('withholds the actual mixed-season rolling value instead of recomputing the old sample',()=>{
 assert.equal(nbaValidatedEstimate([...prior,...current],'points','2026-11-06',report),33.2)
 assert.equal(nbaSelectedSeasonEstimate([...prior,...current],'points','2026-11-06',2026,report),null)
 const currentOnly=Array.from({length:12},(_,i)=>stat(i+201,2026,`2026-10-${String(i+1).padStart(2,'0')}`,20+i))
 assert.equal(nbaSelectedSeasonEstimate(currentOnly,'points','2026-11-06',2026,report),nbaValidatedEstimate(currentOnly,'points','2026-11-06',report))
 assert.equal(nbaSelectedSeasonEstimate([...currentOnly,...prior],'points','2026-11-06',2026,{...report,method:'last10'}),nbaValidatedEstimate([...currentOnly,...prior],'points','2026-11-06',{...report,method:'last10'}))
 assert.equal(nbaSelectedSeasonEstimate([...currentOnly,...prior],'points','2026-11-06',2026,report),null)
})
test('explicit 2025 board may use 2025 game records through spring 2026, not 2024',()=>{
 const historicalReport={...report,validationThrough:'2025-04-13',trainedThrough:'2024-04-13'}
 assert.equal(nbaSelectedSeasonEstimate(prior,'points','2026-04-10',2025,historicalReport),36)
 assert.equal(nbaSelectedSeasonEstimate(prior,'points','2026-11-06',2025,historicalReport),null)
 assert.equal(nbaSelectedSeasonEstimate(prior.map(row=>({...row,game:{...row.game,season:2024}})),'points','2026-04-10',2025,historicalReport),null)
})
test('unknown season, inconsistent dates and malformed input fail closed for full and Q1',()=>{
 const logs=Array.from({length:12},(_,i)=>stat(i+201,2026,`2026-10-${String(i+1).padStart(2,'0')}`,20))
 for(const broken of [logs.map(x=>({...x,game:{...x.game,season:undefined}})),logs.map(x=>({...x,game:{...x.game,date:'2026-04-01'}})),logs.map(x=>({...x,game:{...x.game,date:'2026-10-01bad'}}))])assert.equal(nbaSelectedSeasonEstimate(broken,'points','2026-11-06',2026,report),null)
 assert.equal(nbaSelectedSeasonEstimate(logs.map(x=>({...x,game:{...x.game,postseason:true}})),'points','2026-11-06',2026,report),20)
 const quarter=logs.map(row=>({...row,period:1})),qReport={...report,market:'points_1q' as const}
 assert.equal(nbaSelectedSeasonEstimate(quarter,'points_1q','2026-11-06',2026,qReport),20)
 assert.equal(nbaSelectedSeasonEstimate(quarter.map(row=>({...row,game:{...row.game,season:2025}})),'points_1q','2026-11-06',2026,qReport),null)
})
