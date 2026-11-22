import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
const require=createRequire(import.meta.url)
const compiled={exports:{} as {getNflBdlDesignations:(season:number,week:number,teams:number[],phase:1|2|3)=>Promise<unknown[]>;getNflBdlCurrentSeasonStats:(season:number,teams:number[])=>Promise<unknown[]>}}
const bundled=await build({entryPoints:[resolve('src/lib/nflOdds.ts')],bundle:true,write:false,platform:'node',format:'cjs',tsconfig:'tsconfig.json',plugins:[{name:'boundaries',setup(b){b.onResolve({filter:/^(server-only|@\/lib\/balldontlie|@\/app\/the-sideline\/playerIdentity)$/},a=>({path:a.path,namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:a.path==='@/lib/balldontlie'?'export const bdlHeaders={}':a.path.includes('playerIdentity')?'export const enrichSidelineOddsBoards=async(_,boards)=>boards':''}))}}]})
new Function('module','exports','require',bundled.outputFiles[0].text)(compiled,compiled.exports,require)

test('game reports bypass HTTP caching on every page with exact season, phase and teams',async()=>{
  const old=globalThis.fetch,calls:Array<{url:URL;init?:RequestInit}>=[]
  globalThis.fetch=async(input,init)=>{calls.push({url:new URL(String(input)),init});return Response.json({data:[{page:calls.length}],meta:{next_cursor:calls.length===1?100:null}})}
  try{
    assert.equal((await compiled.exports.getNflBdlDesignations(2026,11,[1,1,2,NaN,-1],2)).length,2)
    for(const {url,init} of calls){assert.equal(init?.cache,'no-store');assert.equal(init?.next,undefined);assert.equal(url.searchParams.get('season'),'2026');assert.equal(url.searchParams.get('week'),'11');assert.deepEqual(url.searchParams.getAll('season_types[]'),['2']);assert.deepEqual(url.searchParams.getAll('team_ids[]'),['1','2'])}
    assert.equal(calls[1].url.searchParams.get('cursor'),'100')
  }finally{globalThis.fetch=old}
})
test('reference statistics retain their separate cache and reports reject incomplete pagination',async()=>{
  const old=globalThis.fetch;let initSeen:RequestInit={}
  try{
    globalThis.fetch=async(_input,init)=>{initSeen=init??{};return Response.json({data:[],meta:{next_cursor:null}})}
    await compiled.exports.getNflBdlCurrentSeasonStats(2026,[1])
    assert.equal(initSeen.next?.revalidate,3600)
    globalThis.fetch=async()=>Response.json({data:[{}],meta:{next_cursor:100}})
    await assert.rejects(compiled.exports.getNflBdlDesignations(2026,11,[1],2),/pagination repeated/)
    let cursor=0;globalThis.fetch=async()=>Response.json({data:[{}],meta:{next_cursor:++cursor}})
    await assert.rejects(compiled.exports.getNflBdlDesignations(2026,11,[1],2),/pagination incomplete/)
    globalThis.fetch=async()=>new Response('',{status:503})
    await assert.rejects(compiled.exports.getNflBdlDesignations(2026,11,[1],2),/503/)
  }finally{globalThis.fetch=old}
})
