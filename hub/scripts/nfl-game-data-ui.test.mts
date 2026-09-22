import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync} from 'node:fs'
import {runInNewContext} from 'node:vm'
import {createRequire} from 'node:module'
import {renderToStaticMarkup} from 'react-dom/server'
import ts from 'typescript'
const require=createRequire(import.meta.url)
const code=readFileSync(new URL('../src/app/the-sideline/NflGameData.tsx',import.meta.url),'utf8')
function load(fail=false) {
 const exports:Record<string,any>={}
 const db={from:(table:string)=>({
  select(){return this},eq(){return this},
  abortSignal(){return Promise.resolve({error:fail?{message:'offline'}:null,count:0,data:table==='nfl_game_feeds'?[{
   source:'bdl_plays',row_count:1,reconciled:true,fetched_at:'2026-09-22T03:30:00Z',
   payload:{plays:[{id:'1',period:4,clock_display:'0:00',away_score:6,home_score:28,text:'END GAME'}]},
  }]:[]})},
 })}
 runInNewContext(ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{
  exports,require:(id:string)=>id.includes('supabase/admin')?{createAdminClient:()=>db}:require(id),AbortSignal,console,
 })
 return exports.NflGameData
}
test('coverage UI renders basic events without claiming enriched or tracking completeness',async()=>{
 const html=renderToStaticMarkup(await load()({game:{id:'2026_02_NYG_LA',away:{abbr:'NYG'},home:{abbr:'LA'}}}))
 assert.match(html,/1 feed events/);assert.match(html,/0 enriched records/)
 assert.match(html,/Awaiting enriched publication/);assert.match(html,/Final marker/)
 assert.match(html,/END GAME/);assert.match(html,/not supplied/)
 assert.match(html,/<summary/);assert.match(html,/Snaps pending/)
})
test('coverage failure is explicit rather than zero or a broken board',async()=>{
 const html=renderToStaticMarkup(await load(true)({game:{id:'game',away:{abbr:'NYG'},home:{abbr:'LA'}}}))
 assert.match(html,/could not be verified/);assert.doesNotMatch(html,/0 enriched/)
})
