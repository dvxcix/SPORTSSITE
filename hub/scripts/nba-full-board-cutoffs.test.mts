import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'esbuild'
import { resolve } from 'node:path'
import type { PaintGame } from '../src/lib/nbaPaint.ts'

const shared={phase:[] as {game_id:number;tipoff_at:string}[],research:[] as {game_id:number;tipoff_at:string}[],failure:false,reads:0,countExtra:0}
;(globalThis as typeof globalThis & { nbaCutoffFixture:typeof shared }).nbaCutoffFixture=shared
const bundled=await build({stdin:{contents:"export {nbaFullBoardCutoffs} from './src/lib/nbaFullBoardCutoffsData'",resolveDir:resolve('.'),loader:'ts'},bundle:true,write:false,platform:'node',format:'cjs',tsconfig:'tsconfig.json',plugins:[{name:'cutoff-fixture',setup(builder){
  builder.onResolve({filter:/^(server-only|\.\/supabase\/admin)$/},args=>({path:args.path,namespace:'fixture'}))
  builder.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='server-only'?'':`export function createAdminClient(){return {from(table){const q={select:()=>q,in:()=>q,limit:()=>q,abortSignal:async()=>{const s=globalThis.nbaCutoffFixture,d=table==='nba_odds_phase_games'?s.phase:s.research;s.reads++;return {data:d,count:d.length+s.countExtra,error:s.failure?{message:'failed'}:null}}};return q}}}`,loader:'js'}))
}}]})
const fixture={exports:{} as {nbaFullBoardCutoffs:(games:PaintGame[])=>Promise<PaintGame[]>}}
new Function('module','exports',bundled.outputFiles[0].text)(fixture,fixture.exports)
const team={id:1,abbreviation:'AAA',full_name:'A',name:'A'}
const game:PaintGame={id:12,date:'2026-10-20',season:2026,status:'Scheduled',status_state:'scheduled',datetime:'2026-10-20T20:00:00Z',period:0,home_team:team,visitor_team:{...team,id:2},home_team_score:0,visitor_team_score:0}

test('two bulk reads preserve the earliest known game cutoff',async()=>{
  shared.phase=[{game_id:12,tipoff_at:'2026-10-20T19:55:00Z'}];shared.research=[{game_id:12,tipoff_at:'2026-10-20T19:50:00Z'}];shared.failure=false;shared.reads=0
  const [row]=await fixture.exports.nbaFullBoardCutoffs([game]);assert.equal(row.datetime,'2026-10-20T19:50:00.000Z');assert.equal(shared.reads,2)
})
test('failed, malformed, cross-game or truncated cutoff reads fail closed',async()=>{
  shared.phase=[];shared.research=[];shared.failure=true
  await assert.rejects(()=>fixture.exports.nbaFullBoardCutoffs([game]))
  shared.failure=false;shared.phase=[{game_id:12,tipoff_at:'invalid'}];await assert.rejects(()=>fixture.exports.nbaFullBoardCutoffs([game]))
  shared.phase=[{game_id:99,tipoff_at:game.datetime!}];await assert.rejects(()=>fixture.exports.nbaFullBoardCutoffs([game]))
  shared.phase=[];shared.research=Array.from({length:1000},()=>({game_id:12,tipoff_at:game.datetime!}));await assert.rejects(()=>fixture.exports.nbaFullBoardCutoffs([game]))
  shared.research=[];shared.countExtra=1;await assert.rejects(()=>fixture.exports.nbaFullBoardCutoffs([game]));shared.countExtra=0
})
