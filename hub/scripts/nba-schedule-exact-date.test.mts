import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import ts from 'typescript'
import * as paint from '../src/lib/nbaPaint.ts'
import { nbaScheduleForDate, type PaintGame } from '../src/lib/nbaPaint.ts'

const game=(id:number,date:string):PaintGame=>({id,date,season:2026,status:'Scheduled',datetime:`${date}T23:00:00Z`,period:0,home_team:{id:1,abbreviation:'AAA',full_name:'Alpha',name:'Alpha'},visitor_team:{id:2,abbreviation:'BBB',full_name:'Beta',name:'Beta'},home_team_score:0,visitor_team_score:0})
test('explicit and current off-days never silently become the next slate',()=>{
  const result=nbaScheduleForDate('2026-11-03',[game(1,'2026-11-04'),game(2,'2026-11-05')],true,true)
  assert.equal(result.date,'2026-11-03');assert.equal(result.requestedDate,'2026-11-03');assert.deepEqual(result.games,[])
  assert.deepEqual(result.days,['2026-11-04','2026-11-05']);assert.equal(result.complete,true)
  assert.equal(nbaScheduleForDate('2026-11-03',[game(1,'2026-11-04')],true).date,'2026-11-04','non-Court schedule consumers keep their existing fallback')
})
test('historical date keeps only its exact games and an incomplete result is not certified empty',()=>{
  const result=nbaScheduleForDate('2026-11-02',[game(1,'2026-11-04'),game(2,'2026-11-02'),game(3,'2026-11-02')],false,true)
  assert.deepEqual(result.games.map(item=>item.id),[2,3]);assert.equal(result.complete,false)
})
test('the actual schedule loader preserves exact Court dates without changing next-up callers',async()=>{
  const source=await readFile(new URL('../src/lib/nbaPaintData.ts',import.meta.url),'utf8')
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
  const modules:Record<string,unknown>={'server-only':{},'node:crypto':{createHash},'@/lib/balldontlie':{bdlHeaders:{}},'./nbaPaint':paint,'./nbaSharedCache':{nbaSharedCache:async(_key:string,_ttl:number,_stale:number,load:()=>Promise<unknown>)=>({value:await load()})}}
  const fixture={exports:{} as {getPaintSchedule:(date:string,exact?:boolean)=>Promise<{date:string;games:PaintGame[]}>}},original=globalThis.fetch
  globalThis.fetch=async()=>Response.json({data:[game(1,'2026-11-04')],meta:{next_cursor:null}})
  try{
    new Function('module','exports','require',compiled)(fixture,fixture.exports,(name:string)=>modules[name]??{})
    const exact=await fixture.exports.getPaintSchedule('2026-11-03',true),next=await fixture.exports.getPaintSchedule('2026-11-03')
    assert.equal(exact.date,'2026-11-03');assert.deepEqual(exact.games,[])
    assert.equal(next.date,'2026-11-04');assert.equal(next.games[0].id,1)
  }finally{globalThis.fetch=original}
})
