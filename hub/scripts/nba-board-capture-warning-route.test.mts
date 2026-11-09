import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import { nbaUnpackFullBoard } from '../src/lib/nbaFullOddsBoard.ts'

const originalNow=Date.now, base=originalNow(), tip=base+3600_000
const team={id:1,abbreviation:'AAA',full_name:'Alpha'},away={id:2,abbreviation:'BBB',full_name:'Beta'}
const game={id:12,date:'2026-11-05',datetime:new Date(tip).toISOString(),status:'Scheduled',status_state:'scheduled',period:0,home_team:team,visitor_team:away}
const player={id:4,first_name:'Alex',last_name:'Player',position:'G',team}
const quote=(at:string,odds:number)=>({game_id:12,player_id:4,vendor:'draftkings',prop_type:'points',line_value:'20',market:{type:'milestone',odds},updated_at:at})
const latest={captured_at:new Date(base-60_000).toISOString(),fingerprint:'a'.repeat(64),quotes:[quote(new Date(base-61_000).toISOString(),150)]}
const prior={captured_at:new Date(base-120_000).toISOString(),quotes:[quote(new Date(base-121_000).toISOString(),175)]}
const state={game,player,latest,prior,tip,reads:0,keys:[] as string[],fail:false,correct:false,crossTip:false,phaseCalls:0,flipEarly:false,incomplete:false,rows:[{key:'market-attempt:v4:pregame:12',payload:{status:'failed',private:'DO NOT EXPOSE'},fetched_at:new Date(base-10_000).toISOString()}] as {key:string;payload:{status:string;private:string;playerFingerprint?:string;playerObservedAt?:string};fetched_at:string}[],cache:new Map<string,unknown>()}
;(globalThis as typeof globalThis&{captureWarningRoute:typeof state}).captureWarningRoute=state
const built=await build({stdin:{contents:"export {GET} from './src/app/the-paint/odds-board/route'",resolveDir:resolve('.'),loader:'ts'},bundle:true,write:false,platform:'node',format:'cjs',tsconfig:'tsconfig.json',plugins:[{name:'capture-warning-route',setup(builder){
 const modules:Record<string,string>={
  'next/server':`export const NextResponse={json:(value,options)=>Response.json(value,options)}`,
  '@/lib/paintAccess':`export async function requirePaintAccess(){return {userId:'member'}}`,
  '@/lib/nbaPaintData':`export async function getPaintSchedule(date){return {date,complete:!globalThis.captureWarningRoute.incomplete,games:[globalThis.captureWarningRoute.game]}};export async function getPaintRoster(){return [globalThis.captureWarningRoute.player]};export async function artwork(){return {headshots:new Map(),logo:null}}`,
  '@/lib/nbaOddsClockData':`export async function getNbaOddsGame(game){return game}`,
  '@/lib/nbaOddsBoardPhaseData':`export async function getNbaOddsBoardPhase(date){const s=globalThis.captureWarningRoute;s.phaseCalls++;const flag=(s.flipEarly&&s.phaseCalls>1)||s.game.status_state==='in_progress'||s.game.status_state==='final'?1:0;return {header:'v1|'+date+'|'+Date.now()+'|12,'+s.tip+','+flag,expiresAt:Date.now()+30000}}`,
  '@/lib/nbaOddsPhaseData':`export function nbaPhaseBoundary(game,mode){const start=Date.parse(game.datetime);return {tipoff:new Date(start).toISOString(),key:mode+':'+game.id+':'+start+':'+(Date.now()>=start?'closed':'open')}};export async function getNbaPhaseFrames(game,mode,feed,scope){return [scope.asOf?globalThis.captureWarningRoute.prior:globalThis.captureWarningRoute.latest]}`,
  '@/lib/nbaOddsHistoryData':`export async function getNbaQuoteOpenings(){return []}`,
  '@/lib/nbaBoardPublicData':`export async function getNbaBoardPublicCaptures(){return []}`,
  '@/lib/nbaLiveFirstSeenData':`export async function nbaLiveFirstSeenConfident(){return true}`,
  '@/lib/nbaFullBoardCutoffsData':`export async function nbaFullBoardCutoffs(games){return globalThis.captureWarningRoute.correct?games.map(game=>({...game,datetime:new Date(Date.parse(game.datetime)-60000).toISOString()})):games}`,
  '@/lib/nbaPregameResearchData':`export async function readNbaPregameResearch(){return {value:{players:[globalThis.captureWarningRoute.player]}}}`,
  '@/lib/nbaSupplementalProps':`export const nbaSupplementalQuote=()=>false`,
  '@/lib/supabase/admin':`export function createAdminClient(){return {from(table){if(table!=='nba_source_cache')throw Error('table');return {select(fields){if(fields!=='key,payload,fetched_at')throw Error('fields');return {in(field,keys){const s=globalThis.captureWarningRoute;s.keys=keys;return {async abortSignal(){s.reads++;if(s.crossTip)Date.now=()=>s.tip+1;return s.fail?{error:'offline'}:{data:s.rows,error:null}}}}}}}}}}`,
  '@/lib/nbaSharedCache':`export async function nbaSharedCache(key,ttl,stale,load){const s=globalThis.captureWarningRoute;if(s.cache.has(key))return {value:s.cache.get(key),stale:false};const value=await load();s.cache.set(key,value);return {value,stale:false}}`,
 }
 builder.onResolve({filter:/.*/},args=>args.path in modules?{path:args.path,namespace:'fixture'}:undefined)
 builder.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:modules[args.path],loader:'js'}))
}}]})
const fixture={exports:{} as {GET:(request:{nextUrl:URL})=>Promise<Response>}}
new Function('module','exports','require',built.outputFiles[0].text)(fixture,fixture.exports,createRequire(import.meta.url))
const get=(market='points',book='draftkings',mode='pregame')=>fixture.exports.GET({nextUrl:new URL(`https://test/odds-board?date=2026-11-05&market=${market}&book=${book}&mode=${mode}`)})

test('shared slate returns only a generic warning and preserves exact quotes',async()=>{
 Date.now=()=>base
 try{
  state.cache.clear();state.reads=0
  const response=await get(),raw=await response.text();assert.equal(response.status,200)
  assert.doesNotMatch(raw,/DO NOT EXPOSE|market-attempt|fetched_at/)
  const board=nbaUnpackFullBoard(JSON.parse(raw),'points')
  assert.deepEqual(board.captureWarning,[12]);assert.equal(board.cells[0].current.odds,150)
  assert.equal(board.cells[0].current.at,latest.quotes[0].updated_at)
  assert.equal(state.reads,1);assert.deepEqual(state.keys,['market-attempt:v4:pregame:12'])
  assert.equal((await get('points','fanduel')).status,200);assert.equal(state.reads,1,'one cached slate serves all books')
 }finally{Date.now=originalNow}
})
test('receipt read failure marks the open game uncertain without dropping prices',async()=>{
 Date.now=()=>base;state.cache.clear();state.fail=true
 try{const response=await get(),board=nbaUnpackFullBoard(await response.json(),'points');assert.equal(response.status,200);assert.deepEqual(board.captureWarning,[12]);assert.equal(board.cells[0].current.odds,150)}finally{state.fail=false;Date.now=originalNow}
})
test('a successful newer receipt does not certify a different served frame',async()=>{
 Date.now=()=>base;state.cache.clear()
 const priorRows=state.rows
 const receipt={key:'market-attempt:v4:pregame:12',payload:{status:'captured',private:'DO NOT EXPOSE',playerFingerprint:'b'.repeat(64),playerObservedAt:new Date(base-20_000).toISOString()},fetched_at:new Date(base-10_000).toISOString()}
 try{
  state.rows=[receipt]
  const mismatched=nbaUnpackFullBoard(await (await get()).json(),'points');assert.deepEqual(mismatched.captureWarning,[12])
  state.cache.clear();state.rows=[{...receipt,payload:{...receipt.payload,playerFingerprint:'a'.repeat(64)}}]
  const verified=nbaUnpackFullBoard(await (await get()).json(),'points');assert.deepEqual(verified.captureWarning,[])
 }finally{state.rows=priorRows;Date.now=originalNow}
})
test('closed pregame never reads current receipts, and corrected tip fails closed',async()=>{
 Date.now=()=>tip+1000;state.cache.clear();state.reads=0
 try{
  const response=await get(),board=nbaUnpackFullBoard(await response.json(),'points')
  assert.equal(response.status,200);assert.deepEqual(board.captureWarning,[]);assert.equal(state.reads,0)
  state.cache.clear();state.correct=true;assert.equal((await get()).status,503)
 }finally{state.correct=false;Date.now=originalNow}
})
test('a tip crossing during the receipt read discards the pregame board',async()=>{
 Date.now=()=>base;state.cache.clear();state.crossTip=true
 try{assert.equal((await get()).status,503)}finally{state.crossTip=false;Date.now=originalNow}
})
test('Live never attaches a mutable receipt, including after final status',async()=>{
 Date.now=()=>base;state.cache.clear();state.reads=0
 const priorGame=state.game,priorTip=state.tip,priorRows=state.rows
 state.tip=base-3_600_000;state.game={...game,datetime:new Date(state.tip).toISOString(),status:'In Progress',status_state:'in_progress',period:1}
 state.rows=[{key:'market-attempt:v4:live:12',payload:{status:'failed',private:'DO NOT EXPOSE'},fetched_at:new Date(base-10_000).toISOString()}]
 try{
  const response=await get('points','draftkings','live'),board=nbaUnpackFullBoard(await response.json(),'points')
  assert.equal(response.status,200);assert.deepEqual(board.captureWarning,[]);assert.equal(state.reads,0)
  assert.equal(board.cells[0].current.odds,150);assert.equal(board.cells[0].current.at,latest.quotes[0].updated_at)
  state.game={...state.game,status:'Final',status_state:'final'}
  const after=await get('points','draftkings','live'),finalBoard=nbaUnpackFullBoard(await after.json(),'points')
  assert.equal(after.status,200);assert.deepEqual(finalBoard.captureWarning,[]);assert.equal(state.reads,0)
  assert.equal(state.cache.size,2,'in-progress and final use distinct shared boards')
 }finally{state.game=priorGame;state.tip=priorTip;state.rows=priorRows;Date.now=originalNow}
})
test('a same-tip early-start phase change during an open board read fails closed',async()=>{
 Date.now=()=>base;state.cache.clear();state.phaseCalls=0;state.flipEarly=true
 try{assert.equal((await get()).status,503)}finally{state.flipEarly=false;Date.now=originalNow}
})
test('same-tip early-start status does not reuse the open warning cache',async()=>{
 Date.now=()=>base;state.cache.clear();state.phaseCalls=0;state.reads=0
 const priorGame=state.game
 try{
  const before=nbaUnpackFullBoard(await (await get()).json(),'points');assert.deepEqual(before.captureWarning,[12]);assert.equal(state.reads,1)
  state.game={...game,status:'In Progress',status_state:'in_progress',period:1}
  const after=nbaUnpackFullBoard(await (await get()).json(),'points')
  assert.deepEqual(after.captureWarning,[]);assert.equal(state.reads,1);assert.equal(state.cache.size,2)
 }finally{state.game=priorGame;Date.now=originalNow}
})
test('an incomplete schedule never attaches mutable warning state',async()=>{
 Date.now=()=>base;state.cache.clear();state.incomplete=true;state.flipEarly=true;state.reads=0
 try{
  const response=await get(),board=nbaUnpackFullBoard(await response.json(),'points')
  assert.equal(response.status,200);assert.deepEqual(board.captureWarning,[]);assert.equal(state.reads,0)
 }finally{state.incomplete=false;state.flipEarly=false;Date.now=originalNow}
})
