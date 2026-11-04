import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { build } from 'esbuild'
const game={id:1,date:'2026-11-02',season:2026,status:'Final',status_state:'final',datetime:'2026-11-02T23:00:00Z',home_team:{id:2},visitor_team:{id:3}}
const stat={id:7,player:{id:9},team:{id:2},game:{id:1,date:game.date,status:'Final',status_state:'final',home_team_id:2,visitor_team_id:3,season:2026},min:'30:00',pts:22,reb:7,ast:4,fg3m:3,stl:1,blk:0,turnover:1,fga:10,fgm:7,fg3a:5,fta:5,ftm:5}
const state={game,stat,keys:[] as string[],calls:0,pages:false,error:false,gate:false}
;(globalThis as typeof globalThis&{outcomeFixture:typeof state}).outcomeFixture=state
const built=await build({stdin:{contents:"export {GET} from './src/app/the-paint/final-results/route'",resolveDir:resolve('.'),loader:'ts'},bundle:true,write:false,platform:'node',format:'cjs',tsconfig:'tsconfig.json',plugins:[{name:'outcome-route',setup(builder){
 const modules:Record<string,string>={
  'next/server':`export const NextResponse={json:(body,options)=>Response.json(body,options)}`,
  '@/lib/paintAccess':`export async function requirePaintAccess(){return globalThis.outcomeFixture.gate?{error:Response.json({}, {status:403})}:{}}`,
  '@/lib/nbaPaintData':`export async function getPaintSchedule(date){return {date,games:[globalThis.outcomeFixture.game]}}`,
  '@/lib/nbaSharedCache':`export async function nbaSharedCache(key,ttl,stale,load){globalThis.outcomeFixture.keys.push(key);return {value:await load()}}`,
  '@/lib/supabase/admin':`export function createAdminClient(){return {from(table){let offset=0;const q={select(){return q},in(){return q},limit(){return q},eq(){return q},order(){return q},range(from){offset=from;return q},abortSignal(){const s=globalThis.outcomeFixture;s.calls++;if(table==='nba_games')return Promise.resolve({data:[{id:1,game_date:s.game.date,season:s.game.season,home_team_id:s.game.home_team.id,visitor_team_id:s.game.visitor_team.id,payload:s.game,fetched_at:'2026-11-03T02:00:00Z'}]});if(s.error&&offset>0)return Promise.resolve({error:true});const row={id:7,game_id:1,player_id:9,team_id:2,game_date:s.game.date,season:2026,payload:s.stat,fetched_at:'2026-11-03T02:30:00Z'};return Promise.resolve({data:s.pages&&offset===0?Array(500).fill(row):offset?[]:[row]})}};return q}}}`,
 }
 builder.onResolve({filter:/.*/},args=>args.path in modules?{path:args.path,namespace:'fixture'}:undefined)
 builder.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:modules[args.path],loader:'js'}))
}}]})
const fixture={exports:{} as {GET:(request:{nextUrl:URL})=>Promise<Response>}}
new Function('module','exports','require',built.outputFiles[0].text)(fixture,fixture.exports,createRequire(import.meta.url))
const get=()=>fixture.exports.GET({nextUrl:new URL('https://test/the-paint/final-results?date=2026-11-02&market=points')})
test('exact final rows are separate and schedule corrections change the cache key',async()=>{
 state.calls=0;state.keys=[];const first=await get();assert.equal(first.status,200);assert.deepEqual((await first.json()).rows,[{gameId:1,playerId:9,teamId:2,value:22}]);assert.equal(state.calls,2)
 state.game={...game,datetime:'2026-11-02T23:05:00Z'};assert.equal((await get()).status,200);assert.notEqual(state.keys[0],state.keys[1]);state.game=game
})
test('a failed later page yields no partial results',async()=>{
 state.pages=true;state.error=true;try{const response=await get();assert.equal(response.status,503);assert.equal((await response.json()).rows,undefined)}finally{state.pages=false;state.error=false}
})
test('access is enforced before any reads',async()=>{
 state.gate=true;state.calls=0;try{assert.equal((await get()).status,403);assert.equal(state.calls,0)}finally{state.gate=false}
})
