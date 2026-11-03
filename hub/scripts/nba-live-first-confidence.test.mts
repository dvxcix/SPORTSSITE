import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { build } from 'esbuild'

const state={cutoff:'2026-11-02T15:00:00.000Z',errors:false,rows:{} as Record<string,unknown[]>,calls:[] as string[],cacheKeys:[] as string[]}
;(globalThis as typeof globalThis & {nbaLiveFirstTest:typeof state}).nbaLiveFirstTest=state
const built=await build({stdin:{contents:"export {nbaLiveFirstSeenConfident} from './src/lib/nbaLiveFirstSeenData'",resolveDir:resolve('.'),loader:'ts'},bundle:true,write:false,platform:'node',format:'cjs',tsconfig:'tsconfig.json',plugins:[{name:'live-first-test',setup(builder){
 const modules:Record<string,string>={
  'server-only':'',
  './supabase/admin':`export function createAdminClient(){const s=globalThis.nbaLiveFirstTest;return {rpc(name,args){s.calls.push(name+':'+args.p_tipoff);return {async abortSignal(){return {data:s.cutoff,error:s.errors?{}:null}}}},from(name){const q={select(){return q},eq(){return q},gte(_k,v){s.calls.push(name+':'+v);return q},limit(){return q},async abortSignal(){return {data:s.rows[name]??[],error:s.errors?{}:null}}};return q}}}`,
  './nbaSharedCache':`export async function nbaSharedCache(key,ttl,stale,load){globalThis.nbaLiveFirstTest.cacheKeys.push(key+':'+ttl+':'+stale);return {value:await load()}}`,
 }
 builder.onResolve({filter:/.*/},args=>args.path in modules?{path:args.path,namespace:'fixture'}:undefined)
 builder.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:modules[args.path],loader:'js'}))
}}]})
const fixture={exports:{} as {nbaLiveFirstSeenConfident:(game:unknown)=>Promise<boolean>}}
new Function('module','exports','require',built.outputFiles[0].text)(fixture,fixture.exports,createRequire(import.meta.url))
const game={id:12,datetime:'2026-11-02T15:00:00Z',status:'Final'}

test('first Live comparison is allowed only with exact durable cutoff and no post-cutoff pregame captures',async()=>{
 state.calls=[];state.rows={};state.errors=false;state.cutoff='2026-11-02T15:00:00.000Z'
 assert.equal(await fixture.exports.nbaLiveFirstSeenConfident(game),true)
 assert.equal(state.calls.length,4)
 assert.match(state.cacheKeys.at(-1)!,/^live-first-confidence:v1:12:2026-11-02T15:00:00\.000Z:60:0$/)
 for(const table of ['nba_odds_phase_captures','nba_market_captures','nba_book_quote_captures']){
  state.rows={[table]:[{id:1}]};assert.equal(await fixture.exports.nbaLiveFirstSeenConfident(game),false)
 }
})
test('earlier corrected cutoff, later invalid cutoff and source errors never certify the first Live record',async()=>{
 state.rows={};state.errors=false;state.cutoff='2026-11-02T14:59:00.000Z';assert.equal(await fixture.exports.nbaLiveFirstSeenConfident(game),false)
 state.cutoff='2026-11-02T15:01:00.000Z';await assert.rejects(()=>fixture.exports.nbaLiveFirstSeenConfident(game))
 state.cutoff='2026-11-02T15:00:00.000Z';state.errors=true;await assert.rejects(()=>fixture.exports.nbaLiveFirstSeenConfident(game));state.errors=false
})
