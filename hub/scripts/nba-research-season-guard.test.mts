import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import ts from 'typescript'
import * as crypto from 'node:crypto'
import * as paint from '../src/lib/nbaPaint.ts'
import * as models from '../src/lib/nbaModel.ts'
import type {PaintStat} from '../src/lib/nbaPaint.ts'
const tip=Date.parse('2026-11-07T00:00:00.000Z'), before=tip-3600000
const team={id:1,abbreviation:'X',full_name:'X',name:'X'},game={id:123,date:'2026-11-06',season:2026,datetime:new Date(tip).toISOString(),status:'Scheduled',status_state:'scheduled',period:0,home_team:team,visitor_team:{...team,id:2},home_team_score:0,visitor_team_score:0}
const report={ready:true,version:'nba-rolling-v1',market:'points',method:'blend',recentWeight:.5,modelKey:'real-report-fixture',trainingSeasons:[2023,2024],trainingGames:20000,trainingPlayers:500,trainingMae:4,trainedThrough:'2025-04-13',validationSeason:2025,validationGames:10000,validationPlayers:500,validationMae:4,validationRmse:6,validationBias:0,baselineMae:4.2,validationFrom:'2025-10-20',validationThrough:'2026-04-13'} as models.NbaModelReport
type LedgerRow={estimate:number|null;model_key:string|null;score:number;quote:{updated_at:string};features:{model:unknown;logIds:number[]};fingerprint:string;captured_at:string}
function stat(i:number,season:number,date:string,pts:number):PaintStat{return{id:i,player:{id:9},team:{id:1},game:{id:i+100,date,season,postseason:false,status:'Final',home_team_id:1,visitor_team_id:2},min:'15',pts,reb:2,ast:1,fg3m:0,stl:0,blk:0,turnover:1,fga:2,fgm:1,fg3a:1,fta:0,ftm:0}}
const old=Array.from({length:18},(_,i)=>stat(i+1,2025,`2026-03-${String(i+1).padStart(2,'0')}`,36)), recent=[stat(100,2026,'2026-11-01',22),stat(101,2026,'2026-11-02',22)]
async function fixture(logs:PaintStat[], previous:boolean, cross=false, quarter=false) {
 let now=before;const ledger:Record<string,unknown>[]=[{id:1,captured_at:'2026-11-06T20:00:00.000Z',estimate:99,fingerprint:'original',quote:{updated_at:'2026-11-06T19:59:00.000Z'}}];const calls:string[]=[]
 class Clock extends Date{constructor(value?:string|number){super(value??now)}static now(){return now}}
 const market=quarter?'points_1q':'points', modelReport={...report,market}
 const quote={id:1,game_id:123,player_id:9,vendor:'draftkings',prop_type:market,line_value:'10',market:{type:'milestone',odds:100},updated_at:'2026-11-06T20:30:00.000Z'}
 const player={id:9,position:'G',team,logs,periodLogs:quarter?logs.map(row=>({...row,period:1})):[],props:[quote],injury:null}; const board={game,players:[player],statsComplete:true,periodStatsComplete:true}
 const query={select:()=>query,in:async()=>({data:[],error:null}),update:()=>query,eq:()=>query}
 const admin={from:()=>query,rpc:async(name:string,args?:{p_rows:Record<string,unknown>[]})=>{calls.push(name)
  if(name==='claim_nba_source')return{data:true,error:null};if(name==='grade_nba_research_snapshots'||name==='prune_nba_source_cache')return{data:0,error:null}
  if(name==='record_nba_research_batch'){if(now>=tip)return{data:null,error:{code:'closed'}};for(const row of args!.p_rows){const prior=ledger.at(-1);if(prior?.fingerprint!==row.fingerprint)ledger.push({...structuredClone(row),id:ledger.length+1,captured_at:new Date(now).toISOString()})}return{data:args!.p_rows.length,error:null}}
  throw Error(`Unexpected ${name}`)}}
 const source=await readFile(new URL('../src/app/api/cron/nba-research-snapshot/route.ts',import.meta.url),'utf8'),output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 const selected=previous?(rows:PaintStat[],market:paint.PaintMarket,date:string,_season:number,model:models.NbaModelReport)=>models.nbaValidatedEstimate(rows,market,date,model):models.nbaSelectedSeasonEstimate
 const imports:Record<string,unknown>={'node:crypto':crypto,'next/server':{NextResponse:{json:Response.json}},'@/lib/cron-auth':{requireCronAuth:()=>null},'@/lib/pipelineHealth':{withPipelineHealth:(_name:string,fn:unknown)=>fn},'@/lib/supabase/admin':{createAdminClient:()=>admin},
 '@/lib/nbaPaintData':{getPaintBoard:async()=>board,getPaintSchedule:async(date:string)=>({date,games:date===game.date?[game]:[],complete:true}),refreshPaintBoardPrices:async(x:unknown)=>x},
 '@/lib/nbaResearchResources':{getNbaResearchDefense:async()=>({profiles:[],ready:false}),getNbaResearchModels:async()=>{if(cross)now=tip;return[modelReport]},getNbaResearchMarketContext:async()=>null,warmNbaResearchResources:async()=>[]},
 '@/lib/nbaMarketSignal':{nbaMarketSupportIdentity:(x:unknown)=>x},'@/lib/nbaIntelligence':{nbaGamePace:()=>null,nbaPosition:()=> 'G',nbaSlipSurgeScore:()=>({version:'v1',score:55,games:10,marketSupport:{}})},
 '@/lib/nbaModel':{nbaSelectedSeasonEstimate:selected},'@/lib/nbaMovement':{nbaEconomicSnapshot:(x:unknown[])=>x},'@/lib/nbaSharedCache':{nbaSharedCache:async(_k:string,_ttl:number,_s:number,load:()=>Promise<unknown>)=>({value:await load()})},
 '@/lib/nbaResearchIdentity':{ensureNbaResearchPlayers:async()=>{}},'@/lib/nbaPaint':{...paint,nbaToday:()=>game.date,PAINT_MARKETS:[{key:market}]},'@/lib/nbaOddsClockData':{getNbaOddsGame:async(x:unknown)=>x},'@/lib/nbaOddsMode':{nbaPregameOpen:()=>now<tip},'@/lib/nbaPregameResearchData':{readNbaPregameResearch:async()=>null},'@/lib/nbaSlateFreezeData':{captureNbaSlatePools:async()=>({full:0,quarter:0})}}
 const m={exports:{} as {GET:(r:Request)=>Promise<Response>}};new Function('require','exports','module','Date',output)((name:string)=>{assert.ok(name in imports,name);return imports[name]},m.exports,m,Clock)
 const original=structuredClone(ledger[0]);const response=await m.exports.GET(new Request('https://example.test'));return{response,ledger,calls,original,quote}
}
test('mixed-season model is withheld only in new pretip ledger row; score, quote and old row remain',async()=>{
 const baseline=await fixture([...old,...recent],true),guarded=await fixture([...old,...recent],false)
 assert.equal(baseline.response.status,200);assert.equal(guarded.response.status,200);const previous=baseline.ledger[1] as unknown as LedgerRow,row=guarded.ledger[1] as unknown as LedgerRow
 assert.equal(previous.estimate,33.2);assert.equal(row.estimate,null);assert.equal(row.model_key,null);assert.equal(row.features.model,null)
 assert.equal(row.score,previous.score);assert.deepEqual(row.quote,previous.quote);assert.equal(row.quote.updated_at,guarded.quote.updated_at);assert.deepEqual(row.features.logIds,previous.features.logIds)
 assert.notEqual(row.fingerprint,previous.fingerprint);assert.deepEqual(guarded.ledger[0],guarded.original);assert.equal(row.captured_at,new Date(before).toISOString())
})
test('same-season qualified model and model identity are preserved exactly',async()=>{
 const current=Array.from({length:12},(_,i)=>stat(i+201,2026,`2026-10-${String(i+1).padStart(2,'0')}`,20))
 const previous=await fixture(current,true),guarded=await fixture(current,false);assert.deepEqual(guarded.ledger[1],previous.ledger[1]);assert.equal(guarded.ledger[1].estimate,20);assert.equal(guarded.ledger[1].model_key,report.modelKey)
})
test('quarter-market mixed sample is withheld without changing its score or quote',async()=>{
 const baseline=await fixture([...old,...recent],true,false,true),guarded=await fixture([...old,...recent],false,false,true)
 assert.equal(baseline.ledger[1].estimate,33.2);assert.equal(guarded.ledger[1].estimate,null)
 assert.equal(guarded.ledger[1].score,baseline.ledger[1].score);assert.deepEqual(guarded.ledger[1].quote,baseline.ledger[1].quote)
})
test('when the database cutoff is crossed, the pending write fails with old row intact',async()=>{
 const h=await fixture([...old,...recent],false,true);assert.equal(h.response.status,503);assert.equal(h.ledger.length,1);assert.deepEqual(h.ledger[0],h.original)
})
