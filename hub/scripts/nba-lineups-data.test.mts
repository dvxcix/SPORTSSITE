import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import * as lineups from '../src/lib/nbaLineups.ts'
import * as mode from '../src/lib/nbaOddsMode.ts'
const team={id:1,abbreviation:'ATL',full_name:'Atlanta Hawks',name:'Hawks'}
const game={id:100,date:'2020-11-19',season:2020,status:'Final',datetime:'2020-11-20T01:00:00Z',period:4,home_team:team,visitor_team:{...team,id:2},home_team_score:100,visitor_team_score:90}
const projected={id:9,game_id:100,team_id:1,status:'confirmed',updated_at:'2020-11-20T00:30:00Z',lineup:lineups.NBA_LINEUP_SLOTS.map((position,i)=>({position,player:{id:10+i,first_name:'Test',last_name:String(i)}}))}
async function fixture(options:{sourceFails?:boolean;writeFails?:boolean;archived?:boolean;earlier?:boolean;actualFails?:boolean}={}){
  const writes:any[]=[],provider:string[]=[],cacheKeys:string[]=[]
  const archive=options.archived?{game_id:100,team_id:1,source_updated_at:projected.updated_at,cutoff_at:game.datetime,payload:projected}:null
  const query:any={select:()=>query,eq:()=>query,lt:()=>query,order:()=>query,limit:()=>query,abortSignal:()=>query,maybeSingle:async()=>({data:archive,error:null}),upsert:(rows:unknown,config:unknown)=>{writes.push({rows,config});return {abortSignal:async()=>({error:options.writeFails?{code:'fixture'}:null})}}}
  let clocks=0
  const imports:Record<string,unknown>={
    'server-only':{},'./nbaLineups':lineups,'./nbaOddsMode':mode,
    './supabase/admin':{createAdminClient:()=>({from:(table:string)=>{assert.equal(table,'nba_pregame_lineup_observations');return query}})},
    './nbaOddsClockData':{getNbaOddsGame:async(g:unknown)=>{clocks++;return options.earlier&&clocks>1?{...game,datetime:'2020-11-20T00:00:00Z'}:g}},
    './nbaSharedCache':{nbaSharedCache:async(key:string,ttl:number,stale:number,load:()=>Promise<unknown>)=>{cacheKeys.push(key);assert.equal(stale,0);assert.ok(ttl<=3600);return{value:await load()}}},
    './nbaPaintData':{getPaintProjectedLineups:async()=>{provider.push('projected');if(options.sourceFails)throw Error('fixture');return[projected]},getPaintActualLineups:async()=>{provider.push('actual');if(options.actualFails)throw Error('fixture');return projected.lineup.map(row=>({game_id:100,team:{id:1},starter:true,position:'G',player:row.player}))}},
  }
  const source=await readFile(new URL('../src/lib/nbaLineupsData.ts',import.meta.url),'utf8'),js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,m={exports:{} as any}
  new Function('require','module','exports',js)((key:string)=>{assert.ok(key in imports,key);return imports[key]},m,m.exports)
  return{get:m.exports.getNbaGameLineups,writes,provider,cacheKeys}
}
test('post-tip pregame read retrieves only immutable source frame and preserves original timestamp on insert',async()=>{
  const h=await fixture(),result=await h.get(game,'pregame')
  assert.deepEqual(h.provider,['projected']);assert.equal(result.teams[0].source,'pregame')
  assert.equal(h.writes[0].rows[0].source_updated_at,'2020-11-20T00:30:00.000Z')
  assert.equal(h.writes[0].rows[0].recorded_at,undefined)
  assert.deepEqual(h.writes[0].config,{onConflict:'game_id,team_id,source_updated_at',ignoreDuplicates:true})
})
test('source outage retains the archived lineup and write failure never invents persistence',async()=>{
  const saved=await fixture({sourceFails:true,archived:true}),result=await saved.get(game,'pregame')
  assert.equal(result.unavailable,true);assert.equal(result.teams[0].status,'confirmed');assert.equal(saved.writes.length,0)
  const failed=await fixture({writeFails:true}),missing=await failed.get(game,'pregame')
  assert.equal(missing.unavailable,true);assert.deepEqual(missing.teams,[])
})
test('actual rows are exclusive to explicit Live, use game position and retain pregame status on actual outage',async()=>{
  const h=await fixture(),live=await h.get(game,'live')
  assert.equal(live.teams[0].source,'game');assert.equal(live.teams[0].players[0].position,'G')
  assert.match(h.cacheKeys[0],/:live:/)
  const failed=await fixture({actualFails:true}),fallback=await failed.get(game,'live')
  assert.equal(fallback.teams[0].status,'confirmed');assert.equal(fallback.teams[0].source,'pregame');assert.equal(fallback.unavailable,true)
})
test('a newly learned earlier tip tightens returned historical lineup boundaries',async()=>{
  const h=await fixture({earlier:true}),result=await h.get(game,'pregame')
  assert.deepEqual(result.teams,[]);assert.equal(result.cutoffAt,'2020-11-20T00:00:00.000Z')
})
