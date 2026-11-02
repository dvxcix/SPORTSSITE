import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import { nflKickoffAt } from '../src/app/the-sideline/kickoff.ts'
import * as samples from '../src/lib/nflSample.ts'
import * as markets from '../src/lib/nflSlateEdge.ts'
import { EMPTY_SIDELINE_ODDS } from '../src/lib/nflOddsTypes.ts'
import * as unavailable from '../src/lib/nflResearchUnavailable.ts'
import * as pausedProjection from '../src/lib/nflPausedProjection.ts'
import * as spendingPause from '../src/lib/browserbaseSpendingPause.ts'
import * as scoreIntegrity from '../src/lib/nflScoreIntegrity.ts'
import type { SidelineGame } from '../src/app/the-sideline/types.ts'

const start = Date.parse('2026-10-25T17:00:00Z')
const game = (id='g1', gametime='13:00'): SidelineGame => ({ id, gametime, gameday:'2026-10-25',season:2026,week:8,gameType:'REG',stadium:null,roof:null,surface:null,away:{abbr:'A',name:'A',color:'#000',logo:null},home:{abbr:'B',name:'B',color:'#fff',logo:null} })
async function compiled(file: string, imports: Record<string,unknown>, clock: DateConstructor=Date) {
  const module={exports:{} as any}
  const source=await readFile(new URL(`../${file}`,import.meta.url),'utf8')
  const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText
  new Function('require','module','exports','Date',js)((key:string)=>{assert.ok(key in imports, key);return imports[key]},module,module.exports,clock)
  return module.exports
}
async function archiveHarness() {
  let now=start-1000, row:any=null, writes=0, reads=0
  let readHook: null|(()=>void)=null, writeHook:null|(()=>void)=null
  class Clock extends Date { constructor(value:string|number=now){super(value)} static now(){return now} }
  const db={rpc(name:string,args:any){return {async abortSignal(){
    if(name==='read_nfl_pregame_research'){reads++; const before=structuredClone(row); readHook?.();return {data:before,error:null}}
    assert.equal(name,'capture_nfl_pregame_research');writes++;writeHook?.()
    if(now<Date.parse(args.p_kickoff)&&(!row||Date.parse(row.observed_at)<Date.parse(args.p_observed_at))) row={payload:args.p_payload,observed_at:args.p_observed_at,kickoff_at:args.p_kickoff,source:'capture'}
    return {data:structuredClone(row),error:null}
  }}}}
  const api=await compiled('src/lib/nflPregameResearchData.ts',{'server-only':{},'./supabase/admin':{createAdminClient:()=>db},'@/app/the-sideline/kickoff':{nflKickoffAt}},Clock as DateConstructor)
  return {api,clock:Clock,setTime:(n:number)=>{now=n},getRow:()=>structuredClone(row),setRow:(value:any,observed=start-5000,kickoff=start)=>{row={payload:value,observed_at:new Date(observed).toISOString(),kickoff_at:new Date(kickoff).toISOString(),source:'capture'}},setReadHook:(f:()=>void)=>{readHook=f},setWriteHook:(f:()=>void)=>{writeHook=f},metrics:()=>({writes,reads})}
}
test('closed research cannot invoke current loaders, missing archives are explicit',async()=>{
  const h=await archiveHarness();h.setTime(start)
  await assert.rejects(h.api.nflPregameResearch(game(),'board-lens:regular',async()=>{assert.fail('current loader')}),h.api.NflPregameResearchUnavailable)
  h.setRow({season:2026,average:7})
  assert.equal((await h.api.nflPregameResearch(game(),'board-lens:regular',async()=>{assert.fail('current loader')})).value.average,7)
  assert.equal(h.metrics().writes,0)
})
test('cross-kickoff loader and delayed read resolve only the final archive',async()=>{
  const h=await archiveHarness();h.setRow({average:3})
  const result=await h.api.nflPregameResearch(game(),'board-lens:regular',async()=>{h.setRow({average:9});h.setTime(start);return {value:{average:999},observedAt:new Date(start-1).toISOString()}})
  assert.equal(result.value.average,9);assert.equal(h.metrics().writes,0)
  const read=await archiveHarness();read.setRow({average:3});let called=false
  read.setReadHook(()=>{if(!called){called=true;read.setRow({average:9});read.setTime(start)}})
  assert.equal((await read.api.readNflPregameResearch(game(),'board-lens:regular')).value.average,9)
})
test('invalid timestamps never write and callers receive isolated values',async()=>{
  const h=await archiveHarness();h.setRow({average:4})
  for(const observedAt of ['invalid',new Date(start).toISOString(),new Date(start+1000).toISOString()]) await h.api.saveNflPregameResearch(game(),'board-lens:regular',{value:{average:999},observedAt})
  assert.equal(h.metrics().writes,0)
  const first=await h.api.readNflPregameResearch(game(),'board-lens:regular');first.value.average=999
  assert.equal((await h.api.readNflPregameResearch(game(),'board-lens:regular')).value.average,4)
})
test('same-observation captures coalesce, and database winner controls results',async()=>{
  const h=await archiveHarness();h.setTime(start-100);h.setRow({average:8},start-500)
  const results=await Promise.all(Array.from({length:20},()=>h.api.saveNflPregameResearch(game(),'board-lens:regular',{value:{average:1},observedAt:new Date(start-5000).toISOString()})))
  assert.equal(h.metrics().writes,1);assert.ok(results.every(row=>row.value.average===8))
})

async function slateHarness() {
  let now=start-1000, version=1, openingOnly:any=undefined, saveHook:null|((g:SidelineGame,resource:string)=>void)=null, loadHook:null|((g:SidelineGame)=>void)=null
  const stored=new Map<string,any>(), calls:string[]=[], sources:string[]=[]
  class Clock extends Date {constructor(value:string|number=now){super(value)} static now(){return now}}
  class Unavailable extends Error{}
  const snapshot=(g:SidelineGame,value:any)=>({value:structuredClone(value),observedAt:new Date(now).toISOString(),source:'capture',frozen:now>=nflKickoffAt(g)!.getTime()})
  const read=async(g:SidelineGame,r:string)=>structuredClone(stored.get(g.id+':'+r)??null)
  const save=async(g:SidelineGame,r:string,e:any)=>{calls.push(g.id+':'+r);saveHook?.(g,r);if(now<nflKickoffAt(g)!.getTime())stored.set(g.id+':'+r,snapshot(g,e.value));return read(g,r)}
  const archive={NflPregameResearchUnavailable:Unavailable,nflPregameOpen:(g:SidelineGame)=>now<nflKickoffAt(g)!.getTime(),readNflPregameResearch:read,saveNflPregameResearch:save,
    nflPregameResearch:async(g:SidelineGame,r:string,load:()=>Promise<any>)=>{if(now>=nflKickoffAt(g)!.getTime()){const prior=await read(g,r);if(!prior)throw new Unavailable();return prior}return save(g,r,await load())}}
  const boards={getSidelineGames:async()=>({games:[game(),game('g2','16:00')]}),getCachedSidelineCheatsheetLens:async()=>({status:'calculated'}),
    getSidelineOddsBundle:async(g:SidelineGame)=>{sources.push(g.id);loadHook?.(g);return {odds:{status:'ready',players:[{id:1,gsisId:g.id,name:g.id,team:'A',position:'WR',markets:[]}],gameLines:[],openingOnly}}},
    getCachedSidelineBoardLens:async(g:SidelineGame)=>({status:'calculated',windows:{season:{teams:[],players:[{id:g.id,name:g.id,index:g.id==='g1'?50:version===1?20:90,games:5,dvp:{}}]}}})}
  const api=await compiled('src/lib/nflSlateData.ts',{'server-only':{},'next/cache':{unstable_cache:(fn:any)=>fn},'./nflPregameResearchData':archive,'@/lib/nflMarketMath':{americanImpliedProbability:(n:number)=>n==null?null:100/(n+100)},'@/lib/nflContextScore':{contextualNflScore:(p:any)=>({score:p.index})},'@/lib/nflPrimaryMarket':{nflPrimaryMarket:()=>({line:5,offers:[{vendor:'fanduel',type:'milestone',current:{odds:200},opening:{odds:150}}]})},'@/lib/nflAvailability':{nflAvailability:()=>({eligible:true})},'@/lib/browserbaseSpendingPause':{...spendingPause,NFL_PAUSED_PROJECTION_ENFORCE_ENABLED:true},'@/lib/nflScoreIntegrity':scoreIntegrity,'@/lib/nflWatchlist':{nflWatchlistSelection:()=>null},'@/lib/nflPlayerName':{normalizeNflPlayerName:(s:string)=>s.toLowerCase()},'@/lib/nflSample':samples,'@/lib/nflSlateEdge':markets,'@/app/the-sideline/data':boards},Clock as DateConstructor)
  return {api,stored,calls,sources,setTime:(n:number)=>{now=n},setVersion:(n:number)=>{version=n},setOpeningOnly:(value:any)=>{openingOnly=value},setSaveHook:(f:typeof saveHook)=>{saveHook=f},setLoadHook:(f:typeof loadHook)=>{loadHook=f},seed:(g:SidelineGame,r:string,value:any)=>stored.set(g.id+':'+r,snapshot(g,value))}
}
test('later games update while an earlier game retains original whole-slate MM and scores',async()=>{
  const h=await slateHarness(), games=[game(),game('g2','16:00')]
  const first=await h.api.getNflSlatePayload(games,'2026-10-25',null)
  h.setTime(start+1);h.setVersion(2)
  const second=await h.api.getNflSlatePayload(games,'2026-10-25','regular')
  assert.deepEqual(second.entries.find((p:any)=>p.gameId==='g1'),first.entries.find((p:any)=>p.gameId==='g1'))
  assert.notDeepEqual(second.entries.find((p:any)=>p.gameId==='g2').mm,first.entries.find((p:any)=>p.gameId==='g2').mm)
  assert.deepEqual(second.unavailableGames,[])
  assert.ok(h.calls.every(key=>!key.includes(':auto')),'default and explicit regular use the same archive')
})
test('missing closed pool does not recompute a matchup or partial slate rank',async()=>{
  const h=await slateHarness();await h.api.getNflSlatePayload([game(),game('g2','16:00')],'2026-10-25','regular')
  h.stored.delete('g1:slate-pool:2026-10-25:regular');h.setTime(start+1)
  const result=await h.api.getNflSlatePayload([game(),game('g2','16:00')],'2026-10-25','regular')
  assert.ok(Object.values(result.entries[0].mm).every(value=>value===null));assert.deepEqual(result.unavailableGames,['g1'])
})
test('legacy frozen slate scores and prices remain original and are labelled unverified',async()=>{
  const h=await slateHarness(), games=[game(),game('g2','16:00')]
  await h.api.getNflSlatePayload(games,'2026-10-25','regular')
  const key='g1:slate-pool:2026-10-25:regular', legacy=h.stored.get(key)
  delete legacy.value.verified
  const saved=structuredClone(legacy);h.setTime(start+1)
  const result=await h.api.getNflSlatePayload(games,'2026-10-25','regular')
  const row=result.entries.find((item:any)=>item.gameId==='g1')
  assert.ok(result.legacyUnverifiedGames.includes('g1'));assert.deepEqual(row, saved.value.entries.find((item:any)=>item.gameId==='g1'))
  assert.deepEqual(h.stored.get(key),saved)
})
test('opening-only market and game lines cannot create a new slate MM or score',async()=>{
  const h=await slateHarness()
  h.setOpeningOnly({offers:[{playerId:1,propType:'first_td',offer:{vendor:'fanduel',type:'milestone',line:1,current:{odds:200}}}],lines:[{vendor:'fanduel',isOpeningOnly:true}]})
  const result=await h.api.getNflSlatePayload([game(),game('g2','16:00')],'2026-10-25','regular')
  for(const row of result.entries) { assert.ok(Object.values(row.score).every(value=>value===null));assert.equal(row.mm.first_td,null) }
  const saved=structuredClone(h.stored.get('g1:slate-pool:2026-10-25:regular'));h.setTime(start+1)
  const frozen=await h.api.getNflSlatePayload([game(),game('g2','16:00')],'2026-10-25','regular')
  assert.ok(Object.values(frozen.entries.find((item:any)=>item.gameId==='g1').score).every(value=>value===null));assert.deepEqual(h.stored.get('g1:slate-pool:2026-10-25:regular'),saved)
})
test('a final peer observation committed during loading is copied into the future anchor pool',async()=>{
  const h=await slateHarness(), games=[game(),game('g2','16:00')]
  await h.api.getNflSlatePayload(games,'2026-10-25','regular')
  const latest=structuredClone(h.stored.get('g1:slate-entries:regular').value);latest.entries[0].score.receiving_yards=99
  h.setLoadHook(g=>{if(g.id==='g2'){h.seed(game(),'slate-entries:regular',latest);h.setTime(start+1)}})
  await h.api.getNflSlatePayload(games,'2026-10-25','regular')
  assert.equal(h.stored.get('g2:slate-pool:2026-10-25:regular').value.entries.find((p:any)=>p.gameId==='g1').score.receiving_yards,99)
})
test('a response crossing kickoff during another anchor save rereads the final pool',async()=>{
  const h=await slateHarness(), games=[game(),game('g2','16:00')]
  await h.api.getNflSlatePayload(games,'2026-10-25','regular')
  const last=structuredClone(h.stored.get('g1:slate-pool:2026-10-25:regular').value);last.entries[0].mm.receiving_yards=77;h.setVersion(2)
  h.setSaveHook((g,r)=>{if(g.id==='g2'&&r.startsWith('slate-pool')){h.seed(game(),r,last);h.setTime(start+1)}})
  const result=await h.api.getNflSlatePayload(games,'2026-10-25','regular')
  assert.equal(result.entries.find((p:any)=>p.gameId==='g1').mm.receiving_yards,77)
})
test('existing scheduled warmer rotates successful games and only reads peers for pools',async()=>{
  const h=await slateHarness()
  const a=await h.api.warmNflPregameResearch('2026-10-25',start+100000)
  h.setTime(start-500)
  const b=await h.api.warmNflPregameResearch('2026-10-25',start+100000)
  assert.deepEqual([a.gameId,b.gameId],['g1','g2']);assert.deepEqual(h.sources,['g1','g2'])
})

async function dataHarness(writesEnabled = true) {
  const h=await archiveHarness(), tables:string[]=[], cutoffs:string[]=[]
  let original:any=null, gameStateHook:null|(()=>void)=null, analyses=0, supplement:any=null, currentFailure=false
  const board={...EMPTY_SIDELINE_ODDS,status:'ready',source:'snapshot',bdlGameId:9,capturedAt:new Date(start-5000).toISOString(),players:[{id:1,name:'Captured Name',team:'A',position:'WR',jersey:7,markets:[],tdBaselines:[{averageOdds:333}]}]}
  let currentBoard:any=board
  const db={from(table:string){tables.push(table);const query:any={select:()=>query,eq:()=>query,order:()=>query,limit:()=>query,range:()=>query,lte:(_k:string,v:string)=>{cutoffs.push(v);return query},abortSignal:()=>query,
    maybeSingle:async()=>({data:table==='nfl_odds_snapshot_history'?original:table==='nfl_odds_current'?{board:currentBoard,captured_at:currentBoard.capturedAt}:null,error:table==='nfl_odds_current' && currentFailure ? {message:'unavailable'} : null}),
    then:(resolve:any)=>Promise.resolve({data:[],error:null}).then(resolve)};return query}}
  const api=await compiled('src/app/the-sideline/data.ts',{'server-only':{},'next/cache':{unstable_cache:(fn:any)=>fn},'@/lib/supabase/admin':{createAdminClient:()=>db},
    '@/lib/nbaSharedCache':{nbaSharedCache:async(_key:string,_ttl:number,_stale:number,load:()=>Promise<unknown>)=>{tables.push('nba_source_cache');return {value:await load()}}},
    '@/lib/nflMarketArchive':{attachNflTdBaselines:(b:any)=>b},'@/lib/nflOddsTypes':{EMPTY_SIDELINE_ODDS},'@/lib/nflPikkit':{attachNflPikkitSnapshot:(b:any)=>b},'@/lib/sidelinePublicBoard':{sidelinePublicBoard:(b:any)=>b},'@/lib/nflFanduel':{attachNflFanduel:(b:any,s:any)=>s??b,loadNflFanduel:async(_id:string,at:string)=>{if(at)cutoffs.push(at);return supplement}},
    '@/lib/browserbaseSpendingPause':{...spendingPause,NFL_PAUSED_PROJECTION_WRITES_ENABLED:writesEnabled,NFL_PAUSED_PROJECTION_ENFORCE_ENABLED:writesEnabled},'@/lib/nflPausedProjection':pausedProjection,
    './analysis':{getSidelineLens:async()=>{analyses++;return {status:'calculated'}}},'./boardAnalysis':{getSidelineBoardLens:async()=>{analyses++;return {status:'calculated'}}},'@/lib/nflSample':samples,'@/lib/nflPregameResearchData':h.api,'@/lib/nflResearchUnavailable':unavailable,'@/lib/nflWeatherServer':{getNflWeather:async()=>''},
    './playerIdentity':{enrichSidelineOddsBoards:async(_g:any,boards:any[])=>boards.map(b=>({...b,players:b.players.map((p:any)=>({...p,jersey:99}))}))},'@/lib/nflPlayerName':{normalizeNflPlayerName:(s:string)=>s},'@/lib/nflMatchupBoard':{nflMatchupBoard:(b:any)=>b},'./scheduleNavigation':{},'@/lib/nflOdds':{getNflBdlDesignations:async()=>[],getNflBdlGame:async()=>{gameStateHook?.();return {status:'In Progress',status_state:'in_progress'}}},'./kickoff':{nflKickoffAt,sidelinePregameCutoff:(g:SidelineGame)=>h.api.nflPregameOpen(g)?null:nflKickoffAt(g)!.toISOString()}},h.clock as DateConstructor)
  return {...h,api,tables,cutoffs,board,setCurrent:(value:any)=>{currentBoard=value},setCurrentFailure:(value:boolean)=>{currentFailure=value},setSupplement:(value:any)=>{supplement=value},setOriginal:(value:any)=>{original=value},setGameStateHook:(f:()=>void)=>{gameStateHook=f},analyses:()=>analyses}
}
test('missing closed odds are unavailable without reading current odds or baseline tables',async()=>{
  const h=await dataHarness();h.setTime(start)
  const result=await h.api.getSidelineOddsBundle(game())
  assert.equal(result.odds.status,'unavailable');assert.deepEqual(result.odds.players,[])
  assert.ok(!h.tables.includes('nfl_odds_current'));assert.ok(!h.tables.includes('nfl_td_baseline_daily'))
  assert.ok(!h.tables.includes('nba_source_cache'))
  assert.ok(h.cutoffs.every(value=>Date.parse(value)<start),'exact-kickoff frames are excluded')
})
test('old original quotes and baselines survive without importing current roster metadata',async()=>{
  const h=await dataHarness();h.setTime(start);h.setOriginal({board:h.board,captured_at:h.board.capturedAt})
  const result=await h.api.getSidelineOddsBundle(game())
  assert.equal(result.odds.players[0].jersey,7);assert.equal(result.odds.players[0].tdBaselines[0].averageOdds,333)
  assert.ok(!h.tables.includes('nfl_td_baseline_daily'))
  assert.ok(!h.tables.includes('nba_source_cache'))
})
test('a live score await crossing kickoff refreshes the final research board',async()=>{
  const h=await dataHarness()
  h.setGameStateHook(()=>{h.setTime(start+1);h.setRow({...h.board,players:[{...h.board.players[0],jersey:12}]},start-500)})
  const result=await h.api.getSidelineOddsBundle(game())
  assert.equal(result.odds.players[0].jersey,12)
})
test('a paused observation archives complete offers, projects current, and stays identical across kickoff',async()=>{
  const h=await dataHarness(), oldTime=new Date(start-6000).toISOString(), freshTime=new Date(start-3000).toISOString()
  const quote=(vendor:string,odds:number,updatedAt:string)=>({vendor,line:1,openingLine:1,type:'milestone',current:{odds},opening:null,updatedAt})
  const direct=quote('fanduel',400,oldTime), fresh=quote('draftkings',350,freshTime)
  const market=(offers:any[])=>({key:'first_td:1',propType:'first_td',label:'First TD',category:'touchdowns',line:1,offers})
  h.setCurrent({...h.board,capturedAt:freshTime,players:[{...h.board.players[0],markets:[market([fresh])]}]})
  h.setSupplement({...h.board,capturedAt:freshTime,players:[{...h.board.players[0],markets:[market([direct,fresh])]}]})
  const first=await h.api.getSidelineOddsBundle(game())
  assert.deepEqual(first.odds.players[0].markets[0].offers,[fresh]);assert.deepEqual(first.odds.lastSeen.offers[0].offer,direct)
  assert.deepEqual(h.getRow().payload.players[0].markets[0].offers,[direct,fresh]);assert.ok(h.getRow().payload.pausedProjection)
  h.setTime(start+1)
  const frozen=await h.api.getSidelineOddsBundle(game())
  assert.deepEqual(frozen.odds,first.odds)
  assert.equal(frozen.odds.lastSeen.offers[0].offer.updatedAt,oldTime)
})
test('reader-first rollout writes no projection and preserves unmarked prices',async()=>{
  const h=await dataHarness(false), kickoff=Date.parse('2026-11-03T02:00:00Z'), time=new Date(kickoff-10000).toISOString()
  const target={...game('g1','21:00'),gameday:'2026-11-02'}
  const offer={vendor:'fanduel',line:1,openingLine:1,type:'milestone',current:{odds:400},opening:null,updatedAt:time}
  h.setCurrent({...h.board,capturedAt:time,players:[{...h.board.players[0],markets:[{key:'first_td:1',propType:'first_td',label:'First TD',category:'touchdowns',line:1,offers:[offer]}]}]})
  h.setTime(kickoff-5000)
  const first=await h.api.getSidelineOddsBundle(target)
  assert.equal(first.odds.status,'ready');assert.deepEqual(first.odds.players[0].markets[0].offers[0],offer)
  assert.equal(h.getRow().payload.pausedProjection,undefined)
  const row=h.getRow();h.setTime(kickoff+1)
  assert.deepEqual((await h.api.getSidelineOddsBundle(target)).odds,first.odds);assert.deepEqual(h.getRow(),row)
})
test('reader-first understands marked archives without changing an unmarked frame',async()=>{
  const h=await dataHarness(false), kickoff=Date.parse('2026-11-03T02:00:00Z'), time=new Date(kickoff-10000).toISOString()
  const target={...game('g1','21:00'),gameday:'2026-11-02'}
  const offer={vendor:'fanduel',line:1,openingLine:1,type:'milestone',current:{odds:400},opening:null,updatedAt:time}
  const original={...h.board,capturedAt:time,players:[{...h.board.players[0],markets:[{key:'first_td:1',propType:'first_td',label:'First TD',category:'touchdowns',line:1,offers:[offer]}]}]}
  const current={...original,players:[{...original.players[0],markets:[]}]}
  const marker=pausedProjection.packNflPausedProjection(pausedProjection.createNflPausedProjection(original as never,current as never,'g1'))
  h.setRow({...original,pausedProjection:marker},kickoff-8000,kickoff);h.setTime(kickoff-5000);h.setCurrentFailure(true)
  const result=await h.api.getSidelineOddsBundle(target)
  assert.equal(result.odds.players[0].markets.length,0);assert.deepEqual(result.odds.lastSeen.offers[0].offer,offer)
  assert.ok(h.getRow().payload.pausedProjection)
})
test('an unmarked fallback stays last-seen across kickoff, even during transient current-feed failure',async()=>{
  const h=await dataHarness(), kickoff=Date.parse('2026-11-03T02:00:00Z')
  const target={...game('g1','21:00'),gameday:'2026-11-02'}
  const offer={vendor:'fanduel',line:1,openingLine:1,type:'milestone',current:{odds:400},opening:null,updatedAt:new Date(kickoff-60000).toISOString()}
  const original={...h.board,capturedAt:offer.updatedAt,players:[{...h.board.players[0],markets:[{key:'first_td:1',propType:'first_td',label:'First TD',category:'touchdowns',line:1,offers:[offer]}]}]}
  h.setRow(original,kickoff-30000,kickoff);h.setTime(kickoff-10000);h.setCurrentFailure(true)
  const before=await h.api.getSidelineOddsBundle(target)
  assert.equal(before.odds.status,'unavailable');assert.deepEqual(before.odds.lastSeen.offers[0].offer,offer)
  h.setTime(kickoff+1)
  const after=await h.api.getSidelineOddsBundle(target)
  assert.deepEqual(after.odds,before.odds);assert.deepEqual(h.getRow().payload,original)
})
test('a successful marked observation recovers after an unmarked fallback without changing its saved times',async()=>{
  const h=await dataHarness(), kickoff=Date.parse('2026-11-03T02:00:00Z')
  const target={...game('g1','21:00'),gameday:'2026-11-02'}
  const original={...h.board,capturedAt:new Date(kickoff-60000).toISOString()}
  h.setRow(original,kickoff-30000,kickoff);h.setTime(kickoff-10000);h.setCurrentFailure(true)
  assert.equal((await h.api.getSidelineOddsBundle(target)).odds.status,'unavailable')
  h.setCurrentFailure(false);h.setTime(kickoff-5000)
  h.setCurrent({...h.board,capturedAt:new Date(kickoff-6000).toISOString()})
  const recovered=await h.api.getSidelineOddsBundle(target)
  assert.equal(recovered.odds.status,'ready');assert.ok(h.getRow().payload.pausedProjection)
  const frozenRow=h.getRow();h.setTime(kickoff+1)
  assert.deepEqual((await h.api.getSidelineOddsBundle(target)).odds,recovered.odds)
  assert.deepEqual(h.getRow(),frozenRow)
})
test('a verified earlier durable kickoff preserves an older frozen board despite a later schedule',async()=>{
  const h=await dataHarness(), target={...game('g1','21:00'),gameday:'2026-11-02'}
  h.setRow(h.board,start-5000,start);h.setTime(Date.parse('2026-11-02T23:00:00Z'))
  const result=await h.api.getSidelineOddsBundle(target)
  assert.deepEqual(result.odds,{...h.board,legacyUnverified:true});assert.equal(result.odds.lastSeen,undefined)
})
test('old frozen opening-only prices stay original and are labelled unverified',async()=>{
  const h=await dataHarness(), time=new Date(start-60000).toISOString()
  const opening={vendor:'fanduel',line:1,openingLine:1,type:'milestone',current:{odds:400},opening:{odds:400},updatedAt:time,isOpeningOnly:true}
  const original={...h.board,capturedAt:time,players:[{...h.board.players[0],markets:[{key:'first_td:1',propType:'first_td',label:'First TD',category:'touchdowns',line:1,offers:[opening]}]}]}
  h.setRow(original,start-30000,start);h.setTime(start+1)
  const saved=h.getRow(), result=await h.api.getSidelineOddsBundle(game())
  assert.deepEqual(result.odds.players[0].markets[0].offers[0],opening)
  assert.equal(result.odds.legacyUnverified,true)
  assert.deepEqual(h.getRow(),saved)
})
test('opening-only quotes stay historical across a new pregame snapshot and kickoff',async()=>{
  const h=await dataHarness(), time=new Date(start-60000).toISOString()
  const opening={vendor:'fanduel',line:1,openingLine:1,type:'milestone',current:{odds:400},opening:{odds:400},updatedAt:time,isOpeningOnly:true}
  const line={vendor:'fanduel',spreadHome:-3,spreadHomeOdds:-110,spreadAway:3,spreadAwayOdds:-110,moneylineHome:-150,moneylineAway:125,total:42,totalOverOdds:-110,totalUnderOdds:-110,opening:null,updatedAt:time,isOpeningOnly:true}
  const original={...h.board,capturedAt:time,gameLines:[line],players:[{...h.board.players[0],markets:[{key:'first_td:1',propType:'first_td',label:'First TD',category:'touchdowns',line:1,offers:[opening]}]}]}
  h.setCurrent(original)
  const before=await h.api.getSidelineOddsBundle(game())
  assert.deepEqual(before.odds.openingOnly.lines,[line]);assert.deepEqual(before.odds.openingOnly.offers[0].offer,opening)
  assert.equal(before.odds.gameLines.length,0);assert.equal(before.odds.players[0].markets.length,0)
  assert.deepEqual(h.getRow().payload.gameLines,[line]);h.setTime(start+1)
  assert.deepEqual((await h.api.getSidelineOddsBundle(game())).odds,before.odds)
})
test('closed missing board and cheatsheet samples are explicit and never invoke analyzers',async()=>{
  const h=await dataHarness();h.setTime(start)
  const board=await h.api.getCachedSidelineBoardLens(game(),[],'regular'), film=await h.api.getCachedSidelineCheatsheetLens(game(),'regular')
  assert.equal(board.status,'awaiting-data');assert.equal(film.status,'awaiting-data');assert.match(board.headline,/Pregame research unavailable/);assert.equal(h.analyses(),0)
})
test('kickoff refresh covers late hydration without refreshing already-frozen pages',async()=>{
  let effect:any, timer:any, refreshes=0
  class Clock extends Date {static now(){return start+100}}
  const module={exports:{} as any}, source=await readFile(new URL('../src/app/the-sideline/NflPregameBoundary.tsx',import.meta.url),'utf8')
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText
  const imports:any={react:{useEffect:(f:any)=>{effect=f}},'next/navigation':{useRouter:()=>({refresh:()=>{refreshes++}})},'./kickoff':{nflKickoffAt}}
  new Function('require','module','exports','Date','window','document',js)((key:string)=>imports[key],module,module.exports,Clock,{setTimeout:(f:any)=>{timer=f;return 1},clearTimeout:()=>{}},{visibilityState:'visible',addEventListener:()=>{},removeEventListener:()=>{}})
  module.exports.NflPregameBoundary({game:game(),wasOpen:true});const clean=effect();timer();timer();assert.equal(refreshes,1);clean()
  timer=null;module.exports.NflPregameBoundary({game:game(),wasOpen:false});effect();assert.equal(timer,null)
})

test('historical unavailable research is visible on board, matchup and cheatsheet pages while prices remain intact', async () => {
  let lens:any = unavailable.unavailableNflBoardLens(game(),'regular')
  const board = {...EMPTY_SIDELINE_ODDS,status:'ready',players:[{id:1,name:'Original player',team:'A',position:'WR',markets:[{market:'receiving_yards',offers:[{current:{odds:350}}]}]}]}
  const jsx=(type:any,props:any)=>({type,props})
  const components:any={SidelineBoardClient:'Board',SidelineResearchClient:'Research',SidelineNavigation:'Navigation',SidelineMatchupLab:'Matchup',SidelineCheatsheets:'Cheatsheets'}
  const imports:any={
    'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'Fragment'},
    '@/lib/sidelineWire':{packSidelineBoard:(value:any)=>value},'next/navigation':{notFound:()=>assert.fail('access')},
    '@/lib/nflSample':samples,'@/lib/nflAccess':{requireNflAccess:async()=>({isAdmin:true})},'@/lib/supabase/authErrors':{},
    './data':{getSidelineGames:async()=>({games:[game()],date:'2026-10-25',days:[]}),getSidelineOddsBundle:async()=>({odds:board,gameState:null}),getSidelinePregameWeather:async()=>undefined,getCachedSidelineBoardLens:async()=>lens,getCachedSidelineCheatsheetLens:async()=>lens},
    'lucide-react':{CalendarOff:'CalendarOff'},'@/components/layout/PageState':{PageState:'PageState'},'@/components/product/ProductPage':{ProductHero:'Hero',ProductPageShell:'Shell'},
    '@/lib/nflTouchdownFeed':{getNflTouchdownFeed:async()=>[]},'@/lib/nflPublicResultsServer':{getNflPublicResults:async()=>null},
    '@/lib/nflPregameResearchData':{nflPregameOpen:()=>false},'./NflPregameBoundary':{NflPregameBoundary:'Boundary'},'@/components/sideline/NflScorerBadges':{LiveNflScorerProvider:'Scorers'},
    './NflLastSeen':{NflLastSeen:'LastSeen'},
  }
  for(const [name,value] of Object.entries(components)) imports['./'+name]={[name]:value}
  const page=await compiled('src/app/the-sideline/page.tsx',imports)
  function rendered(node:any):any[] {
    if(!node || typeof node!=='object')return[]
    if(Array.isArray(node))return node.flatMap(rendered)
    if(typeof node.type==='function')return rendered(node.type(node.props))
    return [node,...rendered(node.props?.children)]
  }
  for(const mode of ['', 'research', 'cheatsheets']) {
    const nodes=rendered(await page.default({searchParams:Promise.resolve({date:'2026-10-25',mode})}))
    const notice=nodes.find(node=>node.props?.role==='status')
    assert.ok(notice,'missing research has a visible accessible notice in '+(mode||'board'))
    assert.match(JSON.stringify(notice),/No verified pregame research snapshot/)
    const content=nodes.find(node=>['Board','Matchup','Cheatsheets'].includes(node.type))
    assert.equal(content.props.odds??content.props.board,board,'notice must not replace or alter original prices')
  }
  for(const healthy of [{...lens,status:'calculated'}, {...lens,headline:'Waiting for season sample'}]) {
    lens=healthy
    const nodes=rendered(await page.default({searchParams:Promise.resolve({})}))
    assert.equal(nodes.some(node=>node.props?.role==='status'),false,'specific archive notice must not label transient awaiting states')
  }
})
