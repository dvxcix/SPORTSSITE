import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { build } from 'esbuild'

const state={frame:null as unknown,timeout:false,aborted:false,calls:[] as string[],lower:null as string|null,upper:null as string|null}
;(globalThis as typeof globalThis&{nbaBoardPublicState:typeof state}).nbaBoardPublicState=state
const built=await build({stdin:{contents:"export {getNbaBoardPublicCaptures} from './src/lib/nbaBoardPublicData'",resolveDir:resolve('.'),loader:'ts'},bundle:true,write:false,platform:'node',format:'cjs',tsconfig:'tsconfig.json',plugins:[{name:'public-fixture',setup(builder){
  builder.onResolve({filter:/^(server-only|\.\/supabase\/admin)$/},args=>({path:args.path,namespace:'fixture'}))
  builder.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='server-only'?'':`export function createAdminClient(){const s=globalThis.nbaBoardPublicState;const query={select(){return query},eq(_k,v){s.calls.push(String(v));return query},lte(_k,v){s.upper=v;return query},gte(_k,v){s.lower=v;return query},order(){return query},limit(n){if(n!==1)throw Error('unexpected limit');return query},abortSignal(signal){if(!s.timeout)return Promise.resolve({data:s.frame?[s.frame]:[],error:null});return new Promise(resolve=>signal.addEventListener('abort',()=>{s.aborted=true;resolve({data:null,error:{code:'timeout'}})},{once:true}))}};return {from(){return query}}}` ,loader:'js'}))
}}]})
const fixture={exports:{} as {getNbaBoardPublicCaptures:(game:unknown,mode:'pregame'|'live')=>Promise<{snapshot:{rows:unknown[]}}[]>}}
new Function('module','exports','require',built.outputFiles[0].text)(fixture,fixture.exports,createRequire(import.meta.url))
const game={id:12,datetime:'2026-11-02T15:00:00Z',status:'Final'}
const frame=(at:string)=>({captured_at:at,snapshot:{gameId:12,capturedAt:at,sourceUrl:'',unmatched:0,complete:true,continuityVersion:1,normalizationVersion:'nba-public-v5',markets:['points'],rows:[{playerId:4,market:'points',picks:50,capturedAt:at}]}})
test('bounded public read enforces game and phase boundaries and excludes partial or legacy data',async()=>{
  const original=Date.now;Date.now=()=>Date.parse('2026-11-02T17:00:00Z')
  try{
    state.calls=[];state.lower=null;state.frame=frame('2026-11-02T14:55:00Z')
    assert.equal((await fixture.exports.getNbaBoardPublicCaptures(game,'pregame'))[0].snapshot.rows.length,1)
    assert.deepEqual(state.calls,['12']);assert.equal(state.upper,'2026-11-02T14:59:59.999Z');assert.equal(state.lower,null)
    assert.deepEqual(await fixture.exports.getNbaBoardPublicCaptures(game,'live'),[])
    assert.equal(state.lower,'2026-11-02T15:00:00.000Z')
    state.frame=frame('2026-11-02T15:10:00Z');assert.equal((await fixture.exports.getNbaBoardPublicCaptures(game,'live'))[0].snapshot.rows.length,1)
    assert.deepEqual(await fixture.exports.getNbaBoardPublicCaptures(game,'pregame'),[])
    state.frame={...frame('2026-11-02T14:55:00Z'),snapshot:{...frame('2026-11-02T14:55:00Z').snapshot,complete:false}}
    assert.deepEqual(await fixture.exports.getNbaBoardPublicCaptures(game,'pregame'),[])
    state.frame={...frame('2026-11-02T14:55:00Z'),snapshot:{...frame('2026-11-02T14:55:00Z').snapshot,continuityVersion:undefined}}
    assert.deepEqual(await fixture.exports.getNbaBoardPublicCaptures(game,'pregame'),[])
  }finally{Date.now=original}
})
test('slow optional public data is aborted and does not leave its read running',async()=>{
  state.timeout=true;state.aborted=false
  try{await assert.rejects(fixture.exports.getNbaBoardPublicCaptures(game,'pregame'));assert.equal(state.aborted,true)}finally{state.timeout=false}
})
