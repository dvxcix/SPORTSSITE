import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import { nbaUnpackFullBoard } from '../src/lib/nbaFullOddsBoard.ts'
import { nbaOddsBoardPhaseSignature } from '../src/lib/nbaOddsBoardPhase.ts'

const game={id:12,date:'2026-11-02',datetime:'2026-11-02T15:00:00Z',status:'Final',status_state:'final',home_team:{id:1,abbreviation:'AAA'},visitor_team:{id:2,abbreviation:'BBB'}}
const player={id:4,first_name:'Alex',last_name:'Player',position:'G',team:{id:1,abbreviation:'AAA',full_name:'Alpha'}}
const quote=(at:string,odds:number)=>({id:1,game_id:12,player_id:4,vendor:'draftkings',prop_type:'points',line_value:'20',market:{type:'milestone',odds},updated_at:at})
const state={openingReads:0,cutoffReads:0,clockReads:0,phaseCalls:0,incomplete:false,partial:null as unknown,latest:{captured_at:'2026-11-02T16:00:00Z',quotes:[quote('2026-11-02T16:00:00Z',150),{...quote('2026-11-02T14:59:59Z',999),player_id:5}]},prior:{captured_at:'2026-11-02T15:30:00Z',quotes:[quote('2026-11-02T15:30:00Z',175)]},badCutoff:false,clockDelay:0,phaseAt:Date.now()-20_000,phaseExpiresAt:Date.now()+15_000,badPhase:false,phaseStart:Date.parse(game.datetime),secondPhaseStart:0}
;(globalThis as typeof globalThis&{fullOddsRoute:typeof state}).fullOddsRoute=state
const built=await build({stdin:{contents:"export {GET} from './src/app/the-paint/odds-board/route'",resolveDir:resolve('.'),loader:'ts'},bundle:true,write:false,platform:'node',format:'cjs',tsconfig:'tsconfig.json',plugins:[{name:'full-board-fixture',setup(builder){
 const modules:Record<string,string>={
  'next/server':`export const NextResponse={json:(value,options)=>Response.json(value,options)}`,
  '@/lib/paintAccess':`export async function requirePaintAccess(){return {userId:'member'}}`,
  '@/lib/nbaPaintData':`export async function getPaintSchedule(date){return {date,complete:!globalThis.fullOddsRoute.incomplete,games:[${JSON.stringify(game)}]}};export async function getPaintRoster(){return [${JSON.stringify(player)}]}`,
  '@/lib/nbaOddsClockData':`export async function getNbaOddsGame(game){const s=globalThis.fullOddsRoute;s.clockReads++;if(s.clockDelay)await new Promise(r=>setTimeout(r,s.clockDelay));return {...game,datetime:s.badCutoff?'invalid':game.datetime}}`,
  '@/lib/nbaOddsBoardPhaseData':`export async function getNbaOddsBoardPhase(date){const s=globalThis.fullOddsRoute;s.phaseCalls++;if(s.clockDelay)await new Promise(r=>setTimeout(r,s.clockDelay));const start=s.secondPhaseStart&&s.phaseCalls>1?s.secondPhaseStart:s.phaseStart;return {header:'v1|'+date+'|'+s.phaseAt+'|12,'+start+','+(s.badPhase?'0':'${nbaOddsBoardPhaseSignature([game as never])!.split(',')[2]}'),expiresAt:s.phaseExpiresAt}}`,
  '@/lib/nbaOddsPhaseData':`export function nbaPhaseBoundary(game,mode){const start=Date.parse(game.datetime);if(!Number.isFinite(start))throw Error('bad cutoff');return {tipoff:new Date(start).toISOString(),key:mode+':'+game.id+':'+start+':'+(Date.now()>=start?'closed':'open')}};export async function getNbaPhaseFrames(game,mode,feed,scope){return [scope.asOf?globalThis.fullOddsRoute.prior:globalThis.fullOddsRoute.latest]}`,
  '@/lib/nbaOddsHistoryData':`export async function getNbaQuoteOpenings(){globalThis.fullOddsRoute.openingReads++;return []}`,
  '@/lib/nbaFullBoardCutoffsData':`export async function nbaFullBoardCutoffs(games){globalThis.fullOddsRoute.cutoffReads++;return games}`,
  '@/lib/nbaPregameResearchData':`export async function readNbaPregameResearch(){return {value:{players:[${JSON.stringify(player)}]}}}`,
  '@/lib/nbaSharedCache':`export async function nbaSharedCache(key,ttl,stale,load){const s=globalThis.fullOddsRoute;if(key.startsWith('odds-board-partial:')&&s.partial)return {value:s.partial,stale:false};const value=await load();if(key.startsWith('odds-board-partial:'))s.partial=value;return {value,stale:false}}`,
 }
 builder.onResolve({filter:/.*/},args=>args.path in modules?{path:args.path,namespace:'fixture'}:undefined)
 builder.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:modules[args.path],loader:'js'}))
}}]})
const fixture={exports:{} as {GET:(request:{nextUrl:URL})=>Promise<Response>}}
new Function('module','exports','require',built.outputFiles[0].text)(fixture,fixture.exports,createRequire(import.meta.url))
const get=(mode:string)=>fixture.exports.GET({nextUrl:new URL(`https://test/odds-board?date=2026-11-02&market=points&book=draftkings&mode=${mode}`)})

test('Live keeps exact last-seen and sparse earlier quotes beyond the old cutoff, without opening data or per-viewer cutoff reads',async()=>{
 state.openingReads=0;state.cutoffReads=0;state.clockReads=0;state.phaseCalls=0;const response=await get('live');assert.equal(response.status,200)
 const packed=await response.json(),board=nbaUnpackFullBoard(packed,'points')
 assert.equal(state.openingReads,0);assert.equal(state.cutoffReads,0);assert.equal(state.clockReads,0);assert.equal(board.phaseCheckedAt,state.phaseAt)
 assert.deepEqual(board.cells.map(cell=>[cell.current.odds,cell.previous?.odds,cell.opening]),[[150,175,null]])
 assert.equal(board.cells[0].current.at,'2026-11-02T16:00:00Z');assert.equal(board.cells[0].previous?.at,'2026-11-02T15:30:00Z')
 assert.ok(packed.quotes.every((row:unknown[])=>row[5]===null&&row[6]===null))
 // If the canonical cutoff moves earlier, retained >= old-cutoff observations
 // remain live. Earlier newly eligible observations may still be absent.
 assert.ok(Date.parse(board.cells[0].current.at)>=Date.parse('2026-11-02T14:00:00Z'))
 state.phaseStart=Date.parse(game.datetime)-60_000;const corrected=await get('live'),correctedBoard=nbaUnpackFullBoard(await corrected.json(),'points')
 assert.equal(corrected.status,200);assert.equal(correctedBoard.games[0].datetime,new Date(state.phaseStart).toISOString());assert.equal(correctedBoard.cells[0].current.at,'2026-11-02T16:00:00Z')
 state.phaseStart=Date.parse(game.datetime)+60_000;assert.equal((await get('live')).status,503);state.phaseStart=Date.parse(game.datetime)
})
test('Live does not borrow an ineligible earlier frame, rejects malformed cutoff, and preserves conservative proof after a slow read',async()=>{
 state.prior={captured_at:'2026-11-02T14:59:59Z',quotes:[quote('2026-11-02T14:59:59Z',175)]};state.clockDelay=25
 const response=await get('live'),body=nbaUnpackFullBoard(await response.json(),'points')
 assert.equal(response.status,200);assert.equal(body.cells[0].previous,null);assert.equal(body.phaseCheckedAt,state.phaseAt)
 state.badPhase=true;assert.equal((await get('live')).status,503);state.badPhase=false
 state.phaseExpiresAt=Date.now()-1;assert.equal((await get('live')).status,503);state.phaseExpiresAt=Date.now()+15_000
 state.phaseStart=Number.NaN;assert.equal((await get('live')).status,503);state.phaseStart=Date.parse(game.datetime)
 state.phaseCalls=0;state.secondPhaseStart=state.phaseStart-60000;assert.equal((await get('live')).status,503);state.secondPhaseStart=0
 state.clockDelay=0;state.prior={captured_at:'2026-11-02T15:30:00Z',quotes:[quote('2026-11-02T15:30:00Z',175)]}
})
test('Pregame retains fresh cutoff and opening reads',async()=>{
 state.openingReads=0;state.cutoffReads=0;state.clockReads=0;assert.equal((await get('pregame')).status,200);assert.equal(state.openingReads,1);assert.equal(state.cutoffReads,1);assert.equal(state.clockReads,0)
 state.incomplete=true;const partial=await get('pregame');assert.equal(partial.status,200);assert.equal((await partial.json()).complete,false);assert.equal(state.clockReads,1);state.incomplete=false
})
