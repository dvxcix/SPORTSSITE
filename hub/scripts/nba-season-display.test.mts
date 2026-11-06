import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import {resolve} from 'node:path'
import test from 'node:test'
import {build} from 'esbuild'
import {nbaSeasonDisplayBoard} from '../src/lib/nbaSeasonDisplay.ts'
import type {PaintBoard,PaintStat} from '../src/lib/nbaPaint.ts'

const log=(id:number,season:number,date:string,period=0):PaintStat=>({id,period,player:{id:132},team:{id:1},game:{id:id+100,date,season,postseason:false,status:'Final',home_team_id:1,visitor_team_id:2},min:'30',pts:id,reb:1,ast:1,fg3m:0,stl:0,blk:0,turnover:0,fga:1,fgm:1,fg3a:0,fta:0,ftm:0})
const base={game:{id:55,date:'2026-10-25',season:2026,datetime:'2026-10-25T21:00:00Z',status:'Final',status_state:'final',period:4,home_team:{id:1},visitor_team:{id:2}},sampleSeason:2026,baselineSeasons:[2025,2026],teamStatsSeason:2025,teamStats:[{team:{id:1},stats:{pace:100}}],historical:true,statsComplete:true,periodStatsComplete:true,sampleEnd:'2026-10-24',issues:[],fetchedAt:'2026-10-25T20:59:00Z',researchSnapshot:{observedAt:'2026-10-25T20:59:00Z',source:'capture',frozen:true},players:[{id:132,averageSeason:2026,average:{pts:25.5,min:34},logs:[log(1,2026,'2026-10-23'),log(2,2026,'2026-10-21'),log(3,2025,'2026-04-02')],periodLogs:[log(4,2026,'2026-10-23',1),log(5,2025,'2026-04-02',1)],props:[]}]} as unknown as PaintBoard
const clean=(board:PaintBoard)=>({...structuredClone(board),baselineSeasons:[2026],teamStatsSeason:2026,players:board.players.map(player=>({...player,logs:player.logs.filter(row=>row.game.season===2026),periodLogs:player.periodLogs?.filter(row=>row.game.season===2026)}))})
test('response-only view keeps genuine selected-season rows and withholds mixed-season baselines',()=>{
 const original=structuredClone(base),view=nbaSeasonDisplayBoard(base)
 assert.deepEqual(view.players[0].logs.map(row=>row.id),[1,2]);assert.deepEqual(view.players[0].periodLogs?.map(row=>row.id),[4])
 assert.equal(view.players[0].average.pts,null);assert.deepEqual(view.teamStats,[]);assert.equal(view.statsComplete,false);assert.equal(view.periodStatsComplete,false)
 assert.equal(view.sampleSeason,2026);assert.equal(view.players[0].averageSeason,undefined);assert.equal(view.teamStatsSeason,undefined);assert.deepEqual(view.baselineSeasons,[])
 assert.match(view.issues.join(' '),/unavailable for the selected season/);assert.deepEqual(base,original,'saved input was not mutated')
 assert.deepEqual(view.researchSnapshot,base.researchSnapshot);assert.deepEqual(view.players[0].props,base.players[0].props)
})
test('clean current season is unchanged and explicitly selected 2025 history remains available',()=>{
 const current=clean(base);assert.equal(nbaSeasonDisplayBoard(current),current)
 const old=structuredClone(current);old.game.date='2026-04-03';old.game.season=2025;old.sampleSeason=2025;old.baselineSeasons=[2025];old.teamStatsSeason=2025
 old.players[0].averageSeason=2025;old.players[0].logs=[log(3,2025,'2026-04-02')];old.players[0].periodLogs=[log(5,2025,'2026-04-02',1)]
 assert.equal(nbaSeasonDisplayBoard(old),old)
})
test('unknown or contradictory season, late facts and wrong identity fail closed',()=>{
 const board=clean(base);board.players[0].logs.push({...log(8,2026,'2026-10-24'),player:{id:999}},log(9,2026,'2026-10-25'),{...log(10,2026,'2026-10-20'),game:{...log(10,2026,'2026-10-20').game,season:undefined}})
 const view=nbaSeasonDisplayBoard(board);assert.deepEqual(view.players[0].logs.map(row=>row.id),[1,2]);assert.equal(view.statsComplete,false)
})
test('a previously derived partial view cannot promote its uncertain average into a certified season baseline',()=>{
 const partial={...clean(base),statsComplete:false}
 const view=nbaSeasonDisplayBoard(partial);assert.equal(view.players[0].average.pts,null);assert.equal(view.statsComplete,false)
})
test('wrong baseline labels cannot survive on a selected-season partial view',()=>{
 const stale={...structuredClone(base),sampleSeason:2025}
 const view=nbaSeasonDisplayBoard(stale);assert.equal(view.sampleSeason,2026);assert.equal(view.teamStatsSeason,undefined);assert.equal(view.players[0].averageSeason,undefined)
 assert.deepEqual(view.players[0].logs.map(row=>row.id),[1,2]);assert.equal(view.statsComplete,false)
})

const shared={board:base,phase:0,profileSeason:2025,shotReads:0}
;(globalThis as typeof globalThis&{seasonDisplayFixture:typeof shared}).seasonDisplayFixture=shared
async function load(path:string){
 const bundle=await build({stdin:{contents:`export * from './src/app/the-paint/${path}/route'`,resolveDir:resolve('.'),loader:'ts'},bundle:true,write:false,platform:'node',format:'cjs',tsconfig:'tsconfig.json',plugins:[{name:'fixture',setup(builder){
  const modules:Record<string,string>={
   'next/server':`export const NextResponse={json:(data,options)=>Response.json(data,options)}`,
   '@/lib/paintAccess':`export async function requirePaintAccess(){return {userId:'member'}}`,
   '@/lib/nbaPaintData':`export async function getPaintGame(){return globalThis.seasonDisplayFixture.board.game};export async function getPaintBoard(){return globalThis.seasonDisplayFixture.board};export async function getPaintFinalStats(){throw Error('unexpected')}`,
   '@/lib/nbaOddsBoardPhaseData':`export async function getNbaOddsBoardPhase(){globalThis.seasonDisplayFixture.phase++;return null}`,
   '@/lib/nbaResearchResources':`export async function getNbaResearchProfile(){return {profile:{season:globalThis.seasonDisplayFixture.profileSeason,shooting:{points:12},advanced:{rating:1}},fetchedAt:'2026-10-25T20:59:00Z',researchSnapshot:{frozen:true}}};export async function getNbaResearchShots(board){globalThis.seasonDisplayFixture.shotReads++;return {originalOldLogPresent:board.players[0].logs.some(x=>x.game.season===2025)}}`,
   '@/lib/nbaShotsData':`export async function getNbaPlays(){throw Error('unexpected')}`,
   '@/lib/nbaShots':`export function nbaShots(){return []}`,
  }
  builder.onResolve({filter:/.*/},args=>args.path in modules?{path:args.path,namespace:'mock'}:undefined)
  builder.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:modules[args.path],loader:'js'}))
 }}]})
 const fixture={exports:{} as {GET:(request:{nextUrl:URL;headers:Headers})=>Promise<Response>}}
 new Function('module','exports','require',bundle.outputFiles[0].text)(fixture,fixture.exports,createRequire(import.meta.url))
 return fixture.exports.GET
}
const request=(url:string,etag?:string)=>({nextUrl:new URL(`https://test/${url}`),headers:new Headers(etag?{'if-none-match':etag}:{})})
test('board refresh hashes sanitized body so the former raw ETag cannot retain old logs',async()=>{
 const get=await load('board'),raw='W/"'+createHash('sha256').update(JSON.stringify({...base,fetchedAt:undefined})).digest('hex')+'"'
 const first=await get(request('board?game=55',raw));assert.equal(first.status,200);assert.notEqual(first.headers.get('etag'),raw)
 const json=await first.json();assert.deepEqual(json.players[0].logs.map((row:PaintStat)=>row.id),[1,2]);assert.equal(json.statsComplete,false)
 const next=await get(request('board?game=55',first.headers.get('etag')!));assert.equal(next.status,304)
})
test('both requested phases filter their own board without changing their mode',async()=>{
 const get=await load('board')
 try{for(const mode of ['pregame','live'] as const){shared.board={...base,oddsMode:mode};const response=await get(request(`board?game=55&mode=${mode}`));assert.equal(response.status,200);const json=await response.json();assert.equal(json.oddsMode,mode);assert.deepEqual(json.players[0].logs.map((row:PaintStat)=>row.id),[1,2])}}
 finally{shared.board=base}
})
test('profile and shot responses reject prior-season data without changing their saved input',async()=>{
 const profile=await load('profile');const response=await profile(request('profile?game=55&player=132'));const p=await response.json();assert.equal(p.season,2026);assert.equal(p.shooting,null);assert.equal(p.advanced,null)
 shared.profileSeason=2026;const correct=await (await profile(request('profile?game=55&player=132'))).json();assert.deepEqual(correct.shooting,{points:12})
 const shots=await load('shots');assert.equal((await shots(request('shots?researchGame=55&game=103&player=132'))).status,404);assert.equal(shared.shotReads,0)
 const valid=await shots(request('shots?researchGame=55&game=101&player=132'));assert.equal(valid.status,200);assert.equal((await valid.json()).originalOldLogPresent,true)
})

async function loadPage(path:string){
 const bundle=await build({stdin:{contents:`export {default} from './src/app/${path}/page'`,resolveDir:resolve('.'),loader:'tsx'},bundle:true,write:false,outfile:'season-display-test.cjs',platform:'node',format:'cjs',jsx:'automatic',external:['react','react/jsx-runtime'],tsconfig:'tsconfig.json',loader:{'.css':'empty'},plugins:[{name:'page-fixture',setup(builder){
  const modules:Record<string,string>={
   '@/lib/paintAccess':`export async function requirePaintAccess(){return {userId:'member'}}`,
   '@/lib/nbaPaintData':`export async function getPaintGame(){return globalThis.seasonDisplayFixture.board.game};export async function getPaintBoard(){return globalThis.seasonDisplayFixture.board};export async function getPaintSchedule(){const b=globalThis.seasonDisplayFixture.board;return {games:[b.game],date:b.game.date,days:[b.game.date],complete:true}}`,
   '@/components/nba/NbaAccessFallback':`export function NbaAccessFallback(){return null}`,
   './PaintBoardClient':`export function PaintBoardClient(){return null}`,
   '@/components/nba/NbaMatchupEntity':`export function NbaMatchupTeam(){return null};export function NbaMatchupPlayer(){return null};export function NbaMatchupUnavailable(){return null}`,
   '@/lib/nbaDirectory':`export async function getNbaTeamEntity(){throw Error('unexpected')};export async function getNbaPlayerEntity(){throw Error('unexpected')}`,
   '@/lib/nbaEntities':`export const nbaEntityId=x=>Number(x);export const nbaResearchHref=()=>'';export const nbaPlayerName=()=>''`,
   'next/link':`export default function Link(){return null}`,'next/navigation':`export function notFound(){throw Error('not found')}`,
   'lucide-react':`export const ArrowUpRight=()=>null,ChartNoAxesCombined=()=>null,CircleDot=()=>null,Clock3=()=>null,Crosshair=()=>null,Layers=()=>null,UserRound=()=>null,Waypoints=()=>null,Scale=()=>null,Shield=()=>null,Trophy=()=>null`,
   '@/components/nba/NbaOddsModeContext':`export function NbaOddsModeProvider(){return null}`,
   '@/components/ui/SafeImage':`export function SafeImage(){return null}`,
   '@/lib/nbaTeamColors':`export const nbaTeamGradient=()=>''`,
   '@/app/the-paint/PaintVisuals':`export function TeamLogo(){return null}`,
   '@/components/nba/NbaEntityHistory':`export function NbaEntityHistory(){return null}`,
   '@/components/nba/NbaTeamRoster':`export function NbaTeamRoster(){return null}`,
   '@/components/profile/FavoriteEntityButton':`export function FavoriteEntityButton(){return null}`,
  }
  builder.onResolve({filter:/.*/},args=>args.path in modules?{path:args.path,namespace:'mock'}:undefined)
  builder.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:modules[args.path],loader:'js'}))
 }}]})
 const fixture={exports:{} as {default:(props:unknown)=>Promise<{props:{initial?:PaintBoard;board?:PaintBoard}}>}}
 new Function('module','exports','require',bundle.outputFiles[0].text)(fixture,fixture.exports,createRequire(import.meta.url))
 return fixture.exports.default
}
test('Court and player/team matchup SSR all receive the same sanitized board',async()=>{
 for(const path of ['the-paint','nba/players/[id]','nba/teams/[id]']){
  const page=await loadPage(path),element=await page({params:Promise.resolve({id:'132'}),searchParams:Promise.resolve({game:'55',mode:'pregame'})})
  const board=element.props.initial??element.props.board
  assert.ok(board,`${path} returned a board`);assert.deepEqual(board.players[0].logs.map(row=>row.id),[1,2]);assert.equal(board.statsComplete,false)
 }
})
