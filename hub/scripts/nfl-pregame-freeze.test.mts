import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import { nflKickoffAt } from '../src/app/the-sideline/kickoff.ts'
import * as samples from '../src/lib/nflSample.ts'
import * as markets from '../src/lib/nflSlateEdge.ts'
import { EMPTY_SIDELINE_ODDS } from '../src/lib/nflOddsTypes.ts'
import * as unavailable from '../src/lib/nflResearchUnavailable.ts'
import type { SidelineGame } from '../src/app/the-sideline/types.ts'

const start = Date.parse('2026-10-25T17:00:00Z')
const game = (id='g1', gametime='13:00'): SidelineGame => ({ id, gametime, gameday:'2026-10-25',season:2026,week:8,gameType:'REG',stadium:null,roof:null,surface:null,away:{abbr:'A',name:'A',color:'#000',logo:null},home:{abbr:'B',name:'B',color:'#fff',logo:null} })
async function compiled(file: string, imports: Record<string,unknown>, clock: DateConstructor=Date) {
  const module={exports:{} as any}
  const source=await readFile(new URL(`../${file}`,import.meta.url),'utf8')
  const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText
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
  return {api,clock:Clock,setTime:(n:number)=>{now=n},setRow:(value:any,observed=start-5000)=>{row={payload:value,observed_at:new Date(observed).toISOString(),kickoff_at:new Date(start).toISOString(),source:'capture'}},setReadHook:(f:()=>void)=>{readHook=f},setWriteHook:(f:()=>void)=>{writeHook=f},metrics:()=>({writes,reads})}
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
  let now=start-1000, version=1, saveHook:null|((g:SidelineGame,resource:string)=>void)=null, loadHook:null|((g:SidelineGame)=>void)=null
  const stored=new Map<string,any>(), calls:string[]=[], sources:string[]=[]
  class Clock extends Date {constructor(value:string|number=now){super(value)} static now(){return now}}
  class Unavailable extends Error{}
  const snapshot=(g:SidelineGame,value:any)=>({value:structuredClone(value),observedAt:new Date(now).toISOString(),source:'capture',frozen:now>=nflKickoffAt(g)!.getTime()})
  const read=async(g:SidelineGame,r:string)=>structuredClone(stored.get(g.id+':'+r)??null)
  const save=async(g:SidelineGame,r:string,e:any)=>{calls.push(g.id+':'+r);saveHook?.(g,r);if(now<nflKickoffAt(g)!.getTime())stored.set(g.id+':'+r,snapshot(g,e.value));return read(g,r)}
  const archive={NflPregameResearchUnavailable:Unavailable,nflPregameOpen:(g:SidelineGame)=>now<nflKickoffAt(g)!.getTime(),readNflPregameResearch:read,saveNflPregameResearch:save,
    nflPregameResearch:async(g:SidelineGame,r:string,load:()=>Promise<any>)=>{if(now>=nflKickoffAt(g)!.getTime()){const prior=await read(g,r);if(!prior)throw new Unavailable();return prior}return save(g,r,await load())}}
  const boards={getSidelineGames:async()=>({games:[game(),game('g2','16:00')]}),getCachedSidelineCheatsheetLens:async()=>({status:'calculated'}),
    getSidelineOddsBundle:async(g:SidelineGame)=>{sources.push(g.id);loadHook?.(g);return {odds:{status:'ready',players:[{id:1,gsisId:g.id,name:g.id,team:'A',position:'WR',markets:[]}],gameLines:[]}}},
    getCachedSidelineBoardLens:async(g:SidelineGame)=>({status:'calculated',windows:{season:{teams:[],players:[{id:g.id,name:g.id,index:g.id==='g1'?50:version===1?20:90,games:5,dvp:{}}]}}})}
  const api=await compiled('src/lib/nflSlateData.ts',{'server-only':{},'next/cache':{unstable_cache:(fn:any)=>fn},'./nflPregameResearchData':archive,'@/lib/nflMarketMath':{americanImpliedProbability:(n:number)=>n==null?null:100/(n+100)},'@/lib/nflContextScore':{contextualNflScore:(p:any)=>({score:p.index})},'@/lib/nflPrimaryMarket':{nflPrimaryMarket:()=>({line:5,offers:[{vendor:'fanduel',type:'milestone',current:{odds:200},opening:{odds:150}}]})},'@/lib/nflAvailability':{nflAvailability:()=>({eligible:true})},'@/lib/nflWatchlist':{nflWatchlistSelection:()=>null},'@/lib/nflPlayerName':{normalizeNflPlayerName:(s:string)=>s.toLowerCase()},'@/lib/nflSample':samples,'@/lib/nflSlateEdge':markets,'@/app/the-sideline/data':boards},Clock as DateConstructor)
  return {api,stored,calls,sources,setTime:(n:number)=>{now=n},setVersion:(n:number)=>{version=n},setSaveHook:(f:typeof saveHook)=>{saveHook=f},setLoadHook:(f:typeof loadHook)=>{loadHook=f},seed:(g:SidelineGame,r:string,value:any)=>stored.set(g.id+':'+r,snapshot(g,value))}
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

async function dataHarness() {
  const h=await archiveHarness(), tables:string[]=[], cutoffs:string[]=[]
  let original:any=null, gameStateHook:null|(()=>void)=null, analyses=0
  const board={...EMPTY_SIDELINE_ODDS,status:'ready',source:'snapshot',bdlGameId:9,capturedAt:new Date(start-5000).toISOString(),players:[{id:1,name:'Captured Name',team:'A',position:'WR',jersey:7,markets:[],tdBaselines:[{averageOdds:333}]}]}
  const db={from(table:string){tables.push(table);const query:any={select:()=>query,eq:()=>query,order:()=>query,limit:()=>query,range:()=>query,lte:(_k:string,v:string)=>{cutoffs.push(v);return query},abortSignal:()=>query,
    maybeSingle:async()=>({data:table==='nfl_odds_snapshot_history'?original:table==='nfl_odds_current'?{board,captured_at:board.capturedAt}:null,error:null}),
    then:(resolve:any)=>Promise.resolve({data:[],error:null}).then(resolve)};return query}}
  const api=await compiled('src/app/the-sideline/data.ts',{'server-only':{},'next/cache':{unstable_cache:(fn:any)=>fn},'@/lib/supabase/admin':{createAdminClient:()=>db},
    '@/lib/nflMarketArchive':{attachNflTdBaselines:(b:any)=>b},'@/lib/nflOddsTypes':{EMPTY_SIDELINE_ODDS},'@/lib/nflPikkit':{attachNflPikkitSnapshot:(b:any)=>b},'@/lib/sidelinePublicBoard':{sidelinePublicBoard:(b:any)=>b},'@/lib/nflFanduel':{attachNflFanduel:(b:any)=>b,loadNflFanduel:async(_id:string,at:string)=>{if(at)cutoffs.push(at);return null}},
    './analysis':{getSidelineLens:async()=>{analyses++;return {status:'calculated'}}},'./boardAnalysis':{getSidelineBoardLens:async()=>{analyses++;return {status:'calculated'}}},'@/lib/nflSample':samples,'@/lib/nflPregameResearchData':h.api,'@/lib/nflResearchUnavailable':unavailable,'@/lib/nflWeatherServer':{getNflWeather:async()=>''},
    './playerIdentity':{enrichSidelineOddsBoards:async(_g:any,boards:any[])=>boards.map(b=>({...b,players:b.players.map((p:any)=>({...p,jersey:99}))}))},'@/lib/nflPlayerName':{normalizeNflPlayerName:(s:string)=>s},'@/lib/nflMatchupBoard':{nflMatchupBoard:(b:any)=>b},'./scheduleNavigation':{},'@/lib/nflOdds':{getNflBdlDesignations:async()=>[],getNflBdlGame:async()=>{gameStateHook?.();return {status:'In Progress',status_state:'in_progress'}}},'./kickoff':{nflKickoffAt,sidelinePregameCutoff:(g:SidelineGame)=>h.api.nflPregameOpen(g)?null:nflKickoffAt(g)!.toISOString()}},h.clock as DateConstructor)
  return {...h,api,tables,cutoffs,board,setOriginal:(value:any)=>{original=value},setGameStateHook:(f:()=>void)=>{gameStateHook=f},analyses:()=>analyses}
}
test('missing closed odds are unavailable without reading current odds or baseline tables',async()=>{
  const h=await dataHarness();h.setTime(start)
  const result=await h.api.getSidelineOddsBundle(game())
  assert.equal(result.odds.status,'unavailable');assert.deepEqual(result.odds.players,[])
  assert.ok(!h.tables.includes('nfl_odds_current'));assert.ok(!h.tables.includes('nfl_td_baseline_daily'))
  assert.ok(h.cutoffs.every(value=>Date.parse(value)<start),'exact-kickoff frames are excluded')
})
test('old original quotes and baselines survive without importing current roster metadata',async()=>{
  const h=await dataHarness();h.setTime(start);h.setOriginal({board:h.board,captured_at:h.board.capturedAt})
  const result=await h.api.getSidelineOddsBundle(game())
  assert.equal(result.odds.players[0].jersey,7);assert.equal(result.odds.players[0].tdBaselines[0].averageOdds,333)
  assert.ok(!h.tables.includes('nfl_td_baseline_daily'))
})
test('a live score await crossing kickoff refreshes the final research board',async()=>{
  const h=await dataHarness()
  h.setGameStateHook(()=>{h.setTime(start+1);h.setRow({...h.board,players:[{...h.board.players[0],jersey:12}]},start-500)})
  const result=await h.api.getSidelineOddsBundle(game())
  assert.equal(result.odds.players[0].jersey,12)
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
