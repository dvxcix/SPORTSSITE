import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync} from 'node:fs'
import {runInNewContext} from 'node:vm'
import ts from 'typescript'
const read=(p:string)=>readFileSync(p,'utf8')
test('public results and TD replay never fan out to upstream feeds from page traffic',()=>{
 for(const file of ['src/lib/nflPublicResultsServer.ts','src/lib/nflTouchdownFeed.ts']){
 const source=read(file)
 assert.doesNotMatch(source,/fetchAllBdl|getNflBdlGame|api\.balldontlie/)
 }
 assert.match(read('src/lib/nflTouchdownFeed.ts'),/eq\('game_id', id\).*limit\(1\)/)
})
test('background ingestion persists matched stats with plays; live cache is stale-while-revalidate',()=>{
 const source=read('src/lib/nflGameFeeds.ts')
 assert.match(source,/payload:\{game,plays,stats\}/)
 assert.match(source,/Missing or mismatched NFL box-score snapshot/)
 assert.match(read('src/app/api/cron/nfl-sync-game-events/route.ts'),/revalidateTag\('sideline:nfl-live','max'\)/)
 assert.doesNotMatch(read('src/app/api/cron/nfl-sync-game-events/route.ts'),/expire:0/)
})
test('stored results preserve timestamp, distinguish no TD evidence and avoid false live losses',async()=>{
 const saved={payload:{game:{id:7,status_state:'in_progress'},stats:[{game:{id:7},player:{id:10,first_name:'Test',last_name:'Receiver'},team:{abbreviation:'BUF'},receptions:3,receiving_yards:42,rushing_yards:0}],plays:[]},reconciled:false,fetched_at:'2026-09-27T18:20:00Z'}
 const api:any={};const chain:any={select:()=>chain,eq:()=>chain,maybeSingle:async()=>({data:saved,error:null})}
 const source=ts.transpileModule(read('src/lib/nflPublicResultsServer.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 runInNewContext(source,{exports:api,require:(id:string)=>{
 if(id==='next/cache')return {unstable_cache:(fn:any)=>fn}
 if(id.includes('supabase/admin'))return {createAdminClient:()=>({from:()=>chain})}
 if(id.includes('nflTouchdownFeed'))return {getNflTouchdownFeed:async()=>[]}
 if(id.includes('nflPeriodResults'))return {attachNflBdlPeriodResults:()=>{},attachNflPeriodResults:()=>{}}
 return {}
 },console})
 const result=await api.getNflPublicResults({id:'g',gameday:'2026-09-27'},7)
 assert.equal(result.players[0].stats.receiving_yards,42)
 assert.equal(result.updatedAt,saved.fetched_at)
 assert.equal(result.firstTdKnown,false)
 assert.equal(result.players[0].stats.anytime_td,null)
})
test('failed capture batches cannot be reported as healthy',()=>{
 assert.match(read('src/app/api/cron/nfl-bdl-odds/route.ts'),/status: failed \? 503 : 200/)
})

test('baseline reads page beyond the API default row limit in both user and ingestion paths',()=>{
 for(const path of ['src/app/the-sideline/data.ts','src/app/api/cron/nfl-bdl-odds/route.ts']){
  const source=read(path)
  assert.match(source,/range\(offset, offset \+ 499\)/)
  assert.match(source,/average_implied_probability/)
 }
})

test('baseline loader returns all 4559 rows, not just the first API page',async()=>{
 const file=read('src/app/the-sideline/data.ts')
 const fn=file.slice(file.indexOf('async function loadTdBaselinesRaw'),file.indexOf('const loadTdBaselinesRecent'))
 const api:any={};let offset=0;let queries=0
 const chain:any={from:()=>chain,select:()=>chain,eq:()=>chain,order:()=>chain,range:(start:number)=>{offset=start;return chain},abortSignal:async()=>{queries++;return {data:Array.from({length:Math.min(500,4559-offset)},(_,i)=>({player_id:offset+i})),error:null}}}
 runInNewContext(ts.transpileModule(fn+'\nexports.load=loadTdBaselinesRaw',{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:api,createAdminClient:()=>chain,AbortSignal})
 const rows=await api.load('2026-09-27')
 assert.equal(rows.length,4559)
 assert.equal(rows.at(-1).player_id,4558)
 assert.equal(queries,10)
})
