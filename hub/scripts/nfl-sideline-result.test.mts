import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import { nflSidelineResult, nflCompactDesignation } from '../src/lib/nflSidelineResult'
import type { NflPublicResult } from '../src/lib/nflPublicResults'

const player={id:'00-test',name:'Test Player',team:'WAS',position:'RB'}
const result:NflPublicResult={status:'final',updatedAt:'2026-11-20T05:00:00Z',firstTd:null,firstTdKnown:true,players:[{id:4,gsisId:'00-test',name:'Test Player',team:'WSH',stats:{rushing_yards:84,receiving_yards:26,anytime_td:0,receptions:3,passing_yards:null}}]}
test('final player summaries preserve explicit zero, exact game totals and team aliases',()=>{
  assert.deepEqual(nflSidelineResult(result,player),[{value:84,label:'rush yds'},{value:0,label:'TD'}])
  assert.deepEqual(nflSidelineResult(result,player,'receiving_yards'),[{value:26,label:'rec yds'}])
  assert.deepEqual(nflSidelineResult(result,player,'rushing_receiving_yards'),[{value:110,label:'rush + rec yds'}])
  assert.deepEqual(nflSidelineResult(result,player,'first_td'),[{value:0,label:'first TD'}])
  assert.deepEqual(nflSidelineResult(result,{...player,id:'bdl-4'},'receptions'),[{value:3,label:'rec'}])
})
test('absence, ambiguous identity, another team, nonfinal totals and missing combined inputs remain unavailable',()=>{
  for(const data of [null,{...result,status:'in_progress'},{...result,players:[]},{...result,players:[...result.players,...result.players]},{...result,players:result.players.map(row=>({...row,team:'DAL'}))}])assert.deepEqual(nflSidelineResult(data,player),[])
  assert.deepEqual(nflSidelineResult(result,player,'passing_yards'),[])
  assert.deepEqual(nflSidelineResult(result,player,'passing_rushing_yards'),[])
  assert.deepEqual(nflSidelineResult({...result,firstTdKnown:false},player,'first_td'),[])
})
test('questionable, out and reserve labels have stable compact codes without hiding their full designation',()=>{
  for(const [full,code] of [['Questionable','Q'],['Doubtful','D'],['Out','OUT'],['Injured reserve','IR'],['Did not play','DNP'],['Status unconfirmed','?']])assert.deepEqual(nflCompactDesignation(full),{text:code,attention:true})
  assert.deepEqual(nflCompactDesignation('Active'),{text:'Active',attention:false})
})

const game={id:'2026_11_IND_HOU',season:2026,week:11,gameday:'2026-11-19',away:{abbr:'IND'},home:{abbr:'HOU'},awayScore:3,homeScore:26}
const feed={game_id:game.id,reconciled:true,fetched_at:'2026-11-20T05:00:00Z',game:{id:1392366,season:2026,week:11,date:'2026-11-20T01:15:00Z',status_state:'final',visitor_team:{abbreviation:'IND'},home_team:{abbreviation:'HOU'},visitor_team_score:3,home_team_score:26}}
const state={rows:[feed],error:false,result,calls:0,reads:0}
;(globalThis as typeof globalThis&{sidelineFinalFixture:typeof state}).sidelineFinalFixture=state
const stubs:Record<string,string>={
  'server-only':'',
  './supabase/admin':`export const createAdminClient=()=>({from(table){if(table!=='nfl_game_feeds')throw Error('Unexpected table');globalThis.sidelineFinalFixture.reads++;const q={select(){return q},eq(){return q},limit(){return q},abortSignal:async()=>({data:globalThis.sidelineFinalFixture.rows,error:globalThis.sidelineFinalFixture.error})};return q}})`,
  './nflPublicResultsServer':`export const getNflPublicResults=async(game,id)=>{if(game.id!=='2026_11_IND_HOU'||id!==1392366)throw Error('Wrong game');globalThis.sidelineFinalFixture.calls++;return globalThis.sidelineFinalFixture.result}`,
}
const bundle=await build({stdin:{contents:'export{readNflVerifiedPlayerResults}from"./src/lib/nflSidelineFinalsServer"',resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,platform:'node',format:'cjs',tsconfig:'tsconfig.json',plugins:[{name:'final-read-fixture',setup(b){b.onResolve({filter:/.*/},a=>a.path in stubs?{path:a.path,namespace:'fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:stubs[a.path],loader:'js'}))}}]})
const compiled={exports:{} as typeof import('../src/lib/nflSidelineFinalsServer')}
new Function('module','exports','require',bundle.outputFiles[0].text)(compiled,compiled.exports,createRequire(import.meta.url))
test('the actual final reader verifies schedule, source, identity and scores before any stat read',async()=>{
  const read=compiled.exports.readNflVerifiedPlayerResults
  assert.equal(await read(game as Parameters<typeof read>[0]),result)
  assert.equal(state.calls,1)
  for(const rows of [[],[feed,feed],[{...feed,reconciled:false}],[{...feed,game_id:'other'}],[{...feed,game:{...feed.game,status_state:'in_progress'}}],[{...feed,game:{...feed.game,visitor_team_score:10}}]]){
    state.rows=rows;state.calls=0
    assert.equal(await read(game as Parameters<typeof read>[0]),null);assert.equal(state.calls,0)
  }
  state.rows=[feed];state.result={...result,status:'in_progress'}
  assert.equal(await read(game as Parameters<typeof read>[0]),null)
  state.reads=0
  assert.equal(await read({...game,awayScore:null,homeScore:null} as unknown as Parameters<typeof read>[0]),null)
  assert.equal(state.reads,0,'scheduled games perform no result lookup')
})
