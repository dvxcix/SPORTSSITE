import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {createRequire} from 'node:module'
import {createClient} from '@supabase/supabase-js'
const fetchOriginal=globalThis.fetch
let upstreamCalls=0
globalThis.fetch=(async(input:any,init:any)=>{const url=String(input?.url??input);if(url.includes('balldontlie')){upstreamCalls++;throw Error('Unexpected upstream page request')}return fetchOriginal(input,init)}) as typeof fetch
const output=await build({stdin:{contents:"export {getNflPublicResults} from './src/lib/nflPublicResultsServer'",resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'cjs',packages:'external',tsconfig:'tsconfig.json',plugins:[{name:'runtime',setup(b){b.onResolve({filter:/^(server-only|next\/cache)$/},a=>({path:a.path,namespace:'runtime'}));b.onLoad({filter:/.*/,namespace:'runtime'},a=>({contents:a.path==='server-only'?'':'export const unstable_cache=(fn)=>{const cache=new Map();return (...args)=>{const k=JSON.stringify(args);if(!cache.has(k))cache.set(k,fn(...args));return cache.get(k)}}'}));}}]})
const mod={exports:{} as Record<string,(...a:any[])=>Promise<any>>}
new Function('require','module','exports',output.outputFiles[0].text)(createRequire(import.meta.url),mod,mod.exports)
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!)
const {data:games,error}=await db.from('nfl_schedule').select('*').eq('season',2026).eq('game_type','REG').lte('week',3).not('home_score','is',null).order('game_id')
assert.ifError(error)
for(const row of games??[]){
 const game={id:row.game_id,season:row.season,week:row.week,gameType:row.game_type,gameday:row.gameday,away:{abbr:row.away_team},home:{abbr:row.home_team}}
 const result=await mod.exports.getNflPublicResults(game,null)
 assert.equal(result.status,'final',row.game_id)
 assert(result.players.length>0,row.game_id+' empty players')
 assert(result.firstTdKnown,row.game_id+' unknown first TD')
 assert(result.players.some((p:any)=>p.stats.longest_reception!=null),row.game_id+' missing longest reception')
 console.log(JSON.stringify({game:row.game_id,players:result.players.length,firstTd:result.firstTd?.name,timestamp:result.updatedAt}))
}
assert.equal(upstreamCalls,0)
console.log(JSON.stringify({verifiedGames:games?.length,upstreamCalls}))

