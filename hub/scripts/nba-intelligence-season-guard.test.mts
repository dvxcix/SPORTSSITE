import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import ts from 'typescript'
import type {PaintBoard} from '../src/lib/nbaPaint.ts'
import * as display from '../src/lib/nbaSeasonDisplay.ts'
async function compiled(file:string,imports:Record<string,unknown>){
 const source=await readFile(new URL(file,import.meta.url),'utf8'),out=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 const m={exports:{} as Record<string,any>};new Function('require','exports','module',out)((key:string)=>{assert.ok(key in imports,key);return imports[key]},m.exports,m);return m.exports
}
const makeBoard=(season:number,date:string,frozen=false)=>({game:{id:101,season,date,home_team:{id:1},visitor_team:{id:2}},sampleSeason:season,baselineSeasons:[season],issues:[],players:[{id:1,position:'G',team:{id:1},props:[],averageSeason:season,average:{pts:20},logs:[{id:1,period:0,player:{id:1},team:{id:1},game:{id:10,date:`${season}-10-01`,season,status:'Final',home_team_id:1,visitor_team_id:2}}]}],statsComplete:true,periodStatsComplete:true,fetchedAt:'2026-10-25T18:00:00Z',researchSnapshot:{frozen}}) as unknown as PaintBoard
const offer={game_id:101,player_id:1,vendor:'fanduel',prop_type:'points',updated_at:'2026-10-25T18:00:00Z'}
const defense=(season:number|undefined)=>({ready:true,season,profiles:[{teamId:2,position:'G',market:'points',allowance:1}],games:7,rows:400,quarterRows:100,teams:[{id:2}],before:'2026-10-25',fetchedAt:'2026-10-25T17:30:00Z',stale:false,researchSnapshot:{source:'capture',observedAt:'2026-10-25T17:30:00Z',frozen:true}})
const request=(mode='pregame')=>({nextUrl:new URL(`https://example.test/?game=101&market=points&mode=${mode}`)})
async function route(initial:PaintBoard,raw:ReturnType<typeof defense>|((board:PaintBoard)=>ReturnType<typeof defense>),resolve?:Function){
 let boardReads=0,defenseReads=0,marketReads=0
 const imports:Record<string,unknown>={
  'next/server':{NextResponse:{json:(body:unknown,init?:{status?:number})=>({status:init?.status??200,body})}},
  '@/lib/nbaOddsMode':{nbaOddsMode:(v:string)=>v==='live'?'live':'pregame'},'@/lib/paintAccess':{requirePaintAccess:async()=>({})},
  '@/lib/nbaPaintData':{getPaintGame:async()=>initial.game,getPaintBoard:async()=>{boardReads++;return initial}},
  '@/lib/nbaMarketSelection':{nbaReadSelection:()=>null,nbaSelectedPlayers:(players:unknown)=>players},
  '@/lib/nbaResearchResources':{getNbaResearchDefense:async(b:PaintBoard)=>{defenseReads++;return typeof raw==='function'?raw(b):raw},getNbaResearchMarketContext:async()=>{marketReads++;return {gameId:101}}},
  '@/lib/nbaResearchBundle':{resolveNbaResearchBundle:resolve??(async(b:PaintBoard,_mode:string,load:(b:PaintBoard)=>Promise<unknown>)=>({board:b,value:await load(b)}))},
  '@/lib/nbaMarketSignal':{nbaEmptyMarketContext:()=>({}),nbaMarketSupportView:(v:unknown)=>v,nbaPlayerMarketSignals:()=>({status:'confirmed',signal:{targetPicks:2}})},
  '@/lib/nbaIntelligence':{nbaGamePace:()=>100,nbaPosition:()=> 'G',nbaSlipSurgeScore:()=>({score:77,minutes:30,production:20,newTeam:false,marketSupport:{status:'confirmed'}})},
  '@/lib/nbaPaint':{nbaReference:()=>offer,nbaPeriod:(market:string)=>market.endsWith('_1q')?1:0,PAINT_MARKETS:[{key:'points'},{key:'points_1q'}]},
  '@/lib/nbaMarketMetrics':{nbaMarketRanks:()=>new Map([[1,{mm:3}]])},
  '@/lib/nbaSeasonDisplay':display,
 }
 const api=await compiled('../src/app/the-paint/intelligence/route.ts',imports)
 return {get:api.GET,reads:()=>({boardReads,defenseReads,marketReads})}
}
test('mixed or unknown defense is unavailable without inventing zero, while odds and independent signals remain',async()=>{
 for(const mode of ['pregame','live'])for(const season of [2025,undefined]){
  const b=makeBoard(2026,'2026-10-25',mode==='pregame'),d=defense(season),before=structuredClone(d),h=await route(b,d),r=await h.get(request(mode))
  assert.equal(r.status,200);assert.equal(r.body.season,2026);assert.equal(r.body.ready,false);assert.deepEqual(r.body.profiles,[])
  assert.equal(r.body.games,null);assert.equal(r.body.rows,null);assert.equal(r.body.quarterRows,null);assert.equal(r.body.scores[0].score,null);assert.equal(r.body.scores[0].marketSupport,null)
  assert.deepEqual(r.body.scores[0].offer,offer);assert.equal(r.body.scores[0].mm,3);assert.equal(r.body.scores[0].marketSignals.status,'confirmed')
  assert.ok(r.body.unavailable.includes('Selected-season defense'));assert.deepEqual(d,before);assert.deepEqual(h.reads(),{boardReads:1,defenseReads:1,marketReads:1})
 }
})
test('mixed or unproven player inputs suppress the entire original MM pool and scores, retaining valid defense and odds',async()=>{
 for(const issue of ['prior','missing','in_progress','wrong_team','incomplete','quarter'] as const){
  const b=makeBoard(2026,'2026-10-25',true),log=b.players[0].logs[0]
  if(issue==='prior')log.game.season=2025
  if(issue==='missing')log.game.season=undefined
  if(issue==='in_progress')log.game.status_state='in_progress'
  if(issue==='wrong_team')log.team.id=99
  if(issue==='incomplete')b.statsComplete=false
  if(issue==='quarter')b.periodStatsComplete=false
  const h=await route(b,defense(2026))
  const r=issue==='quarter'?await h.get({nextUrl:new URL('https://example.test/?game=101&market=points_1q')}):await h.get(request())
  assert.equal(r.status,200);assert.equal(r.body.scores[0].score,null);assert.equal(r.body.scores[0].mm,null);assert.equal(r.body.scores[0].minutes,null);assert.equal(r.body.scores[0].production,null);assert.equal(r.body.scores[0].newTeam,null)
  assert.deepEqual(r.body.profiles,defense(2026).profiles);assert.deepEqual(r.body.scores[0].offer,offer);assert.equal(r.body.scores[0].marketSignals.status,'confirmed')
 }
})
test('clean 2026 and explicitly selected 2025 defense retain original captured values',async()=>{
 for(const [season,date] of [[2026,'2026-10-25'],[2025,'2026-04-20']] as const)for(const mode of ['pregame','live']){
  const d={...defense(season),before:date},h=await route(makeBoard(season,date,mode==='pregame'),d),r=await h.get(request(mode))
  assert.equal(r.status,200);assert.equal(r.body.season,season);assert.deepEqual(r.body.profiles,d.profiles);assert.equal(r.body.games,7);assert.equal(r.body.scores[0].score,77);assert.equal(r.body.scores[0].mm,3);assert.deepEqual(r.body.unavailable,[])
 }
})
test('same-season defense must have an honest pregame date',async()=>{
 for(const before of ['2026-10-25','2026-10-01','2026-10-26','2026-02-30','2026-10-25T00:00:00Z','2025-12-01','']){
  const d={...defense(2026),before},h=await route(makeBoard(2026,'2026-10-25',true),d),r=await h.get(request())
  if(before==='2026-10-25'||before==='2026-10-01')assert.equal(r.body.scores[0].score,77)
  else{assert.equal(r.body.scores[0].score,null);assert.deepEqual(r.body.profiles,[])}
 }
})
test('tip-crossing response gates final defense against the final board',async()=>{
 const early=makeBoard(2026,'2026-10-25'),last=makeBoard(2026,'2026-10-25',true);let finalReads=0,clockReads=0
 const bundle=await compiled('../src/lib/nbaResearchBundle.ts',{'server-only':{},'./nbaPaintData':{getPaintBoard:async()=>{finalReads++;return last}},'./nbaOddsClockData':{getNbaOddsGame:async()=>{clockReads++;return last.game}},'./nbaOddsMode':{nbaPregameOpen:()=>false}})
 const h=await route(early,(board:PaintBoard)=>defense(board.researchSnapshot?.frozen?2025:2026),bundle.resolveNbaResearchBundle),r=await h.get(request())
 assert.equal(r.status,200);assert.equal(r.body.scores[0].score,null);assert.deepEqual(r.body.profiles,[]);assert.equal(h.reads().defenseReads,2);assert.equal(finalReads,1);assert.equal(clockReads,1)
})
