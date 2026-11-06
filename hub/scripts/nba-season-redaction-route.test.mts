import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import ts from 'typescript'
import * as paint from '../src/lib/nbaPaint.ts'
import * as model from '../src/lib/nbaModel.ts'
import type {PaintStat} from '../src/lib/nbaPaint.ts'
const report={ready:true,version:'nba-rolling-v1',market:'points',method:'blend',recentWeight:.5,modelKey:'fixture',trainingSeasons:[2023,2024],trainingGames:20000,trainingPlayers:500,trainingMae:4,trainedThrough:'2025-04-13',validationSeason:2025,validationGames:10000,validationPlayers:500,validationMae:4,validationRmse:6,validationBias:0,baselineMae:4.2,validationFrom:'2025-10-20',validationThrough:'2026-04-13'}
function stat(id:number,season:number,date:string,pts:number):PaintStat{return{id,player:{id:9},team:{id:2},game:{id:100+id,date,season,postseason:false,status:'Final',home_team_id:1,visitor_team_id:2},min:'15',pts,reb:2,ast:1,fg3m:0,stl:0,blk:0,turnover:1,fga:2,fgm:1,fg3a:1,fta:0,ftm:0}}
const prior=Array.from({length:18},(_,i)=>stat(i+1,2025,`2026-03-${String(i+1).padStart(2,'0')}`,36)),current=[stat(100,2026,'2026-11-01',22),stat(101,2026,'2026-11-02',22)]
async function routeFor(season:number,date:string,logs:PaintStat[],rep=report) {
 const source=await readFile(new URL('../src/app/the-paint/estimate/route.ts',import.meta.url),'utf8'),output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 const board={game:{id:123,season,date},players:[{id:9,logs}],fetchedAt:'2026-11-05T12:00:00Z'}
 const imports:Record<string,unknown>={'next/server':{NextResponse:{json:Response.json}},'@/lib/nbaOddsMode':{nbaOddsMode:(x:string)=>x==='live'?'live':'pregame'},'@/lib/paintAccess':{requirePaintAccess:async()=>({})},'@/lib/nbaPaintData':{getPaintGame:async()=>board.game,getPaintBoard:async()=>board},'@/lib/nbaPaint':paint,'@/lib/nbaModel':model,'@/lib/nbaResearchResources':{getNbaResearchModels:async()=>[rep]},'@/lib/nbaResearchBundle':{resolveNbaResearchBundle:async(initial:unknown,_mode:string,load:(x:unknown)=>Promise<unknown>)=>({board:initial,value:await load(initial)})}}
 const m={exports:{} as {GET:(x:unknown)=>Promise<Response>}}
 new Function('require','exports','module',output)((name:string)=>{assert.ok(name in imports,name);return imports[name]},m.exports,m)
 return async(mode='pregame')=>{const res=await m.exports.GET({nextUrl:new URL(`https://example.test/?game=123&player=9&market=points&mode=${mode}`)});assert.equal(res.status,200);return res.json()}
}
test('real estimate route withholds actual mixed-season inputs in pregame and live',async()=>{
 const run=await routeFor(2026,'2026-11-06',[...prior,...current]);assert.equal((await run()).estimate,null);assert.equal((await run('live')).estimate,null)
})
test('real estimate route preserves same-season 2026 and explicitly selected 2025 results',async()=>{
 const same=Array.from({length:12},(_,i)=>stat(201+i,2026,`2026-10-${String(i+1).padStart(2,'0')}`,20))
 assert.equal((await (await routeFor(2026,'2026-11-06',same))()).estimate,20)
 const oldReport={...report,validationThrough:'2025-04-13',trainedThrough:'2024-04-13'}
 assert.equal((await (await routeFor(2025,'2026-04-10',prior,oldReport))()).estimate,36)
})
