import test from 'node:test'
import assert from 'node:assert/strict'
import { nbaMatrixSeasonGuard, nbaMatrixUnsafePipelineStep } from '../src/lib/nbaMatrixSeason.ts'
import { nbaMatrixCandidates, type NbaMatrixFactor, type NbaMatrixPipelineStep } from '../src/lib/nbaMatrix.ts'
import type { PaintBoard, PaintPlayer, PaintStat } from '../src/lib/nbaPaint.ts'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import * as matrixLib from '../src/lib/nbaMatrix.ts'
import * as seasonLib from '../src/lib/nbaMatrixSeason.ts'

const teams = [{id: 1, abbreviation: 'A', full_name: 'A', name: 'A'}, {id: 2, abbreviation: 'B', full_name: 'B', name: 'B'}]
const log = (playerId: number, season = 2026): PaintStat => ({
  id: playerId + 100, player: {id: playerId}, team: {id: 1},
  game: {id: playerId + 100, season, date: season === 2026 ? '2026-10-15' : '2025-10-15', status: 'Final', status_state: 'final', home_team_id: 1, visitor_team_id: 2},
  min: '30:00', pts: 20, reb: 5, ast: 3, fg3m: 2, stl: 1, blk: 1, turnover: 2, fga: 14, fgm: 7, fg3a: 4, fta: 2, ftm: 2,
})
const player = (id: number, season = 2026): PaintPlayer => ({
  id, first_name:'A', last_name:'B', team:teams[0], position:'G', headshot:null, injury:null,
  average:{pts:20}, averageSeason:2026, logs:[log(id, season)], periodLogs:[],
  props:[{id, game_id:9, player_id:id, vendor:'fanduel', prop_type:'points', line_value:'15',
    market:{type:'milestone', odds:150}, opening:{over:{odds:200, at:'2026-10-20T10:00:00Z'}}, updated_at:'2026-10-20T11:00:00Z'}],
})
const board = (players = [player(1)]): PaintBoard => ({
  game:{id:9, season:2026, date:'2026-10-20', status:'Scheduled', datetime:'2026-10-20T23:00:00Z', period:0, home_team:teams[0], visitor_team:teams[1],home_team_score:0, visitor_team_score:0},
  players, sampleSeason:2026, baselineSeasons:[2026], historical:false, sampleEnd:'2026-10-19', fetchedAt:'2026-10-20T11:00:00Z', issues:[], statsComplete:true, periodStatsComplete:true,
  teamStatsSeason:2026, teamStats:[],
})
const factor = (patch: Partial<NbaMatrixFactor> = {}): NbaMatrixFactor => ({
  id:'f',category:'stats',field:'points',operator:'gte',value:10,window:'l1',vendor:'fanduel',
  propType:'points',marketValue:null,marketLine:15,marketKind:'milestone',marketSide:'over',location:'all',...patch,
})
const step = (patch: Partial<NbaMatrixPipelineStep> = {}): NbaMatrixPipelineStep => ({
  ...factor(),kind:'filter',join:'and',direction:'highest',scope:'team',keep:1,...patch,
})
const defense = {season:2026,before:'2026-10-20',ready:true,profiles:[]}

test('mixed season withholds only affected player stats and the full score and MM pool, while exact odds stay available', () => {
  const b = board([player(1), player(2, 2025)]), guard = nbaMatrixSeasonGuard(b, defense, null)
  assert.equal(guard('1',factor()),true)
  assert.equal(guard('2',factor()),false)
  assert.equal(guard('1',factor({category:'score',field:'mm'})),false)
  assert.equal(guard('1',factor({category:'score',field:'index'})),false)
  const price = factor({category:'market',field:'market',marketValue:'current'})
  assert.equal(guard('2',price),true)
  assert.equal(nbaMatrixCandidates(b)[1].values(price),150)
  assert.equal(guard('2',factor({category:'picks'})),true)
  assert.equal(guard('2',factor({category:'market',field:'market',marketValue:'hit_rate'})),false)
})
test('clean selected season preserves original stats, score, MM and team factor eligibility', () => {
  const b = board(), guard = nbaMatrixSeasonGuard(b, defense, null)
  assert.equal(guard('1',factor()),true)
  assert.equal(nbaMatrixCandidates(b)[0].values(factor()),20)
  for (const field of ['index','mm']) assert.equal(guard('1',factor({category:'score',field})),true)
  assert.equal(guard('1',factor({category:'team',field:'pace'})),true)
})
test('an explicit 2025 view in spring 2026 retains its real 2025 season inputs', () => {
  const p = {...player(1,2025),averageSeason:2025}
  const b = {...board([p]),game:{...board().game,season:2025,date:'2026-01-10'},sampleSeason:2025,baselineSeasons:[2025],teamStatsSeason:2025}
  const guard = nbaMatrixSeasonGuard(b,{season:2025,before:'2026-01-10',ready:true,profiles:[]},null)
  assert.equal(guard('1',factor()),true)
  assert.equal(nbaMatrixCandidates(b)[0].values(factor()),20)
})
test('wrong defense, unknown quarter or team season do not affect unrelated prices', () => {
  const b = {...board(),periodStatsComplete:false,teamStatsSeason:2025}, guard = nbaMatrixSeasonGuard(b,{...defense,season:2025},null)
  assert.equal(guard('1',factor({category:'stats',field:'points_1q'})),false)
  assert.equal(guard('1',factor({category:'team',field:'pace'})),false)
  assert.equal(guard('1',factor({category:'score',field:'index'})),false)
  assert.equal(guard('1',factor({category:'market',marketValue:'opening'})),true)
})
test('tracked game must have an original selected-season witness and complete source', () => {
  const b=board(), row={id:1,playerId:1,gameId:101,teamId:1,values:{usage_percentage:.2}}
  const tracking={rows:[row],seasons:[2026],complete:true,sourceStates:[{key:'advanced:2026',complete:true}],fields:['usage_percentage']}
  assert.equal(nbaMatrixSeasonGuard(b,defense,tracking)('1',factor({category:'tracking'})),true)
  assert.equal(nbaMatrixSeasonGuard(b,defense,{...tracking,rows:[{...row,gameId:999}]})('1',factor({category:'tracking'})),false)
  assert.equal(nbaMatrixSeasonGuard(b,defense,{...tracking,complete:false})('1',factor({category:'tracking'})),false)
})
test('earlier unproven filters cannot silently change later rank or unless populations', () => {
  const guard = (id:string,f:NbaMatrixFactor) => !(id==='2' && f.category==='stats')
  const filtered = step(), rank = step({kind:'rank',category:'market',marketValue:'current'})
  const unless = step({kind:'unless',category:'market',marketValue:'current'})
  const candidates = ['1','2'].map(id => ({id,values:()=>1}))
  assert.equal(nbaMatrixUnsafePipelineStep([filtered,rank],candidates,guard),true)
  assert.equal(nbaMatrixUnsafePipelineStep([filtered,unless],candidates,guard),true)
  assert.equal(nbaMatrixUnsafePipelineStep([filtered],candidates,guard),false)
  assert.equal(nbaMatrixUnsafePipelineStep([rank],candidates,guard),false)
  assert.equal(nbaMatrixUnsafePipelineStep([unless],[{id:'1',values:()=>null}],()=>true),true)
  assert.equal(nbaMatrixUnsafePipelineStep([rank],[{id:'1',values:()=>null}],()=>true),true)
})
test('duplicate player identity and unready defense are never considered proven', () => {
  const duplicate = board([player(1), player(1,2025)])
  assert.equal(nbaMatrixSeasonGuard(duplicate, defense, null)('1',factor({category:'market',marketValue:'current'})),false)
  const b = board(), guard = nbaMatrixSeasonGuard(b,{...defense,ready:false},null)
  assert.equal(guard('1',factor({category:'score',field:'index'})),false)
  assert.equal(guard('1',factor({category:'score',field:'mm'})),true)
  assert.equal(nbaMatrixSeasonGuard(board([player(1,2025)]),defense,null)('1',factor({category:'market',marketValue:null})),false)
})

test('real route preserves price matches and withholds an affected ranking pipeline', async () => {
  const saved = board([player(1),player(2,2025)])
  const price = factor({id:'price', category:'market', field:'market', marketValue:'current', operator:'gte', value:100})
  const stats = factor({id:'stats'})
  const matrices = [
    {id:'price',name:'Odds',color:'x',enabled:true,matrix_type:'classic',match_mode:'all',definition:{factors:[price]}},
    {id:'stats',name:'Stats',color:'x',enabled:true,matrix_type:'classic',match_mode:'all',definition:{factors:[stats]}},
    {id:'rank',name:'Rank',color:'x',enabled:true,matrix_type:'pipeline',definition:{steps:[step(),step({...price,kind:'rank'})]}},
    {id:'unless',name:'Unless',color:'x',enabled:true,matrix_type:'pipeline',definition:{steps:[step({kind:'unless',category:'picks',field:'picks'})]}},
  ]
  const query = {select:()=>query,eq:()=>query,order:()=>query,then:(resolve:(v:unknown)=>unknown)=>Promise.resolve(resolve({data:matrices,error:null}))}
  const deps:Record<string,unknown> = {
    '@/lib/nbaOddsMode':{nbaOddsMode:()=> 'pregame'}, 'next/server':{NextResponse:{json:(body:unknown,init?:{status?:number})=>({body,status:init?.status??200})}},
    '@/lib/paintAccess':{requirePaintAccess:async()=>({userId:'owner'})},
    '@/lib/supabase/admin':{createAdminClient:()=>({from:()=>query})},
    '@/lib/nbaPaintData':{getPaintGame:async()=>saved.game,getPaintBoard:async()=>saved},
    '@/lib/nbaResearchResources':{getNbaResearchDefense:async()=>defense,getNbaResearchMarketContext:async()=>null,getNbaResearchTracking:async()=>null},
    '@/lib/nbaResearchBundle':{resolveNbaResearchBundle:async(b:PaintBoard,_mode:unknown,load:(x:PaintBoard)=>Promise<unknown>)=>({board:b,value:await load(b)})},
    '@/lib/nbaMatrix':matrixLib, '@/lib/nbaMatrixSeason':seasonLib,
    '@/lib/nbaPublicData':{getNbaPublicCaptures:async()=>{throw Error('unavailable')}},
  }
  const source=await readFile(new URL('../src/app/api/nba-matrices/evaluate/route.ts',import.meta.url),'utf8')
  const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
  const mod={exports:{} as Record<string,any>}
  new Function('require','exports','module',output)((name:string)=>{assert.ok(name in deps,name);return deps[name]},mod.exports,mod)
  const result=await mod.exports.GET({nextUrl:new URL('https://example.test/?game=9')})
  assert.equal(result.status,200)
  assert.deepEqual(result.body.matches[0].playerIds,[1,2])
  assert.deepEqual(result.body.matches[1].playerIds,[1])
  assert.deepEqual(result.body.matches[2].playerIds,[])
  assert.equal(result.body.matches[2].unavailable,'Required input unavailable')
  assert.deepEqual(result.body.matches[3].playerIds,[])
  assert.ok(result.body.unavailable.includes('Public picks'))
  assert.ok(result.body.unavailable.includes('Some matrix results are unavailable because a required input is missing'))
  assert.deepEqual(saved.players[1].logs,[log(2,2025)])
  saved.players[1].logs = [log(2)]
  saved.players[1].props = []
  matrices.splice(0,matrices.length,{id:'rank',name:'Rank',color:'x',enabled:true,matrix_type:'pipeline',definition:{steps:[step({...price,kind:'rank'})]}})
  const missingQuote=await mod.exports.GET({nextUrl:new URL('https://example.test/?game=9')})
  assert.equal(missingQuote.status,200)
  assert.deepEqual(missingQuote.body.matches[0].playerIds,[])
  assert.ok(missingQuote.body.unavailable.includes('Some matrix results are unavailable because a required input is missing'))
  assert.ok(!missingQuote.body.unavailable.includes('Public picks'))

  // Exercise the real boundary resolver: the final frozen board wins if the
  // game closes while its secondary inputs are loading.
  const open=board([player(1),player(2)]), frozen=board([player(1),player(2,2025)])
  frozen.fetchedAt='2026-10-20T22:59:59Z'
  const resolverSource=await readFile(new URL('../src/lib/nbaResearchBundle.ts',import.meta.url),'utf8')
  const resolverOutput=ts.transpileModule(resolverSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
  const resolver={exports:{} as Record<string,any>}
  const resolverDeps:Record<string,unknown>={'server-only':{},'./nbaPaintData':{getPaintBoard:async()=>frozen},
    './nbaOddsClockData':{getNbaOddsGame:async()=>frozen.game},'./nbaOddsMode':{nbaPregameOpen:()=>false}}
  new Function('require','exports','module',resolverOutput)((name:string)=>{assert.ok(name in resolverDeps,name);return resolverDeps[name]},resolver.exports,resolver)
  deps['@/lib/nbaResearchBundle']=resolver.exports
  deps['@/lib/nbaPaintData']={getPaintGame:async()=>open.game,getPaintBoard:async()=>open}
  matrices.splice(0,matrices.length,{id:'stats',name:'Stats',color:'x',enabled:true,matrix_type:'classic',match_mode:'all',definition:{factors:[stats]}})
  const crossed={exports:{} as Record<string,any>}
  new Function('require','exports','module',output)((name:string)=>{assert.ok(name in deps,name);return deps[name]},crossed.exports,crossed)
  const atTip=await crossed.exports.GET({nextUrl:new URL('https://example.test/?game=9')})
  assert.equal(atTip.status,200)
  assert.equal(atTip.body.fetchedAt,frozen.fetchedAt)
  assert.deepEqual(atTip.body.matches[0].playerIds,[1])
  matrices.splice(0,matrices.length,{id:'score',name:'Score',color:'x',enabled:true,matrix_type:'classic',match_mode:'all',definition:{factors:[factor({category:'score',field:'index'})]}})
  const nullContext=await crossed.exports.GET({nextUrl:new URL('https://example.test/?game=9')})
  assert.equal(nullContext.status,200)
  assert.ok(nullContext.body.unavailable.includes('Market signals'))
  assert.deepEqual(nullContext.body.matches[0].playerIds,[])
})
