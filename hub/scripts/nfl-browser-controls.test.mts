import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import ts from 'typescript'
import * as crypto from 'node:crypto'
import * as policy from '../src/lib/nflBrowserCapturePolicy.ts'
import * as refresh from '../src/lib/browserbaseRefresh.ts'
import * as dispatch from '../src/lib/nflCaptureDispatch.ts'

const source=await readFile(new URL('../src/lib/nflBrowserCaptureControls.ts',import.meta.url),'utf8')
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
const mod={exports:{} as typeof import('../src/lib/nflBrowserCaptureControls.ts')}
const mocks:Record<string,unknown>={'server-only':{},'node:crypto':crypto,'./nflBrowserCapturePolicy':policy,'./browserbaseRefresh':refresh,'./nflCaptureDispatch':dispatch}
new Function('require','exports','module',compiled)((key:string)=>{assert.ok(key in mocks,key);return mocks[key]},mod.exports,mod)

function fixture() {
  const rows=new Map<string,{key:string;fetched_at:string;payload:unknown}>()
  let failed=false,clock:string|null=null,history:{captured_at:string;raw_tabs?:unknown}|null=null
  const admin={
    rpc:()=>({abortSignal:async()=>clock===null?{data:null,error:{code:'offline'}}:{data:clock,error:null}}),
    from(table:string){
      if(table==='nba_source_cache') return {
        select:()=>({in:(_:string,keys:string[])=>({limit:()=>({abortSignal:async()=>failed?{data:null,error:{code:'offline'}}:{data:keys.flatMap(key=>rows.has(key)?[rows.get(key)!]:[]),error:null}})})}),
        insert:(entry:{key:string;fetched_at:string;payload:unknown})=>({select:()=>({abortSignal:()=>({maybeSingle:async()=>{
          if(failed)return {data:null,error:{code:'offline'}}
          if(rows.has(entry.key))return {data:null,error:{code:'23505'}}
          rows.set(entry.key,entry);return {data:{key:entry.key},error:null}
        }})})}),
        delete:()=>{
          let key='',stamp='',reservationId=''
          const chain={
            eq:(column:string,value:string)=>{if(column==='key')key=value;else if(column==='fetched_at')stamp=value;return chain},
            contains:(_column:string,value:{reservationId:string})=>{reservationId=value.reservationId;return chain},
            select:()=>chain,abortSignal:()=>chain,maybeSingle:async()=>{
              if(failed)return {data:null,error:{code:'offline'}}
              const row=rows.get(key),payload=row?.payload as {reservationId?:string}|undefined
              if(!row || row.fetched_at!==stamp || payload?.reservationId!==reservationId)return {data:null,error:null}
              rows.delete(key);return {data:{key},error:null}
            },
          }
          return chain
        },
      }
      if(table==='nfl_fanduel_capture_history'||table==='nfl_pikkit_picks_current') {
        const chain={eq:()=>chain,order:()=>chain,limit:()=>chain,abortSignal:()=>chain,maybeSingle:async()=>({data:history,error:null})}
        return {select:()=>chain}
      }
      throw new Error('unexpected table')
    },
  }
  return {admin:admin as never,rows,setFailure:(value:boolean)=>{failed=value},setClock:(value:string)=>{clock=value},setHistory:(value:typeof history)=>{history=value}}
}

test('simultaneous launches consume only one durable checkpoint reservation',async()=>{
  const f=fixture(),now=Date.parse('2026-11-07T18:00:00Z'),scope={gameId:'2026_09_KC_SEA',kickoff:now+24*3_600_000,observed:null}
  const outcomes=await Promise.all([mod.exports.reserveNflBrowserAttempt(f.admin,'fanduel',scope,now),mod.exports.reserveNflBrowserAttempt(f.admin,'fanduel',scope,now)])
  assert.equal(outcomes.filter(Boolean).length,1);assert.equal(f.rows.size,1)
  assert.equal(await mod.exports.reserveNflBrowserAttempt(f.admin,'fanduel',scope,now+89*60_000),null)
  assert.ok(await mod.exports.reserveNflBrowserAttempt(f.admin,'fanduel',scope,now+90*60_000))
  assert.equal(await mod.exports.reserveNflBrowserAttempt(f.admin,'fanduel',scope,now+3*3_600_000),null)
})
test('a denied attempt can retry; stale or ambiguous cleanup cannot erase a newer reservation',async()=>{
  const f=fixture(),now=Date.parse('2026-11-07T18:00:00Z'),scope={gameId:'2026_09_KC_SEA',kickoff:now+24*3_600_000,observed:null}
  const first=await mod.exports.reserveNflBrowserAttempt(f.admin,'public',scope,now)
  assert.ok(first)
  assert.equal(await mod.exports.releaseNflBrowserAttempt(f.admin,first),true)
  const second=await mod.exports.reserveNflBrowserAttempt(f.admin,'public',scope,now)
  assert.ok(second);assert.notEqual(first.reservationId,second.reservationId)
  assert.equal(await mod.exports.releaseNflBrowserAttempt(f.admin,first),false)
  assert.equal(f.rows.size,1)
  f.setFailure(true);await assert.rejects(mod.exports.releaseNflBrowserAttempt(f.admin,second));assert.equal(f.rows.size,1)
  f.setFailure(false);assert.equal(await mod.exports.reserveNflBrowserAttempt(f.admin,'public',scope,now+60_000),null)
})
test('failed or ambiguous database checks never authorize a launch',async()=>{
  const f=fixture(),now=Date.parse('2026-11-07T18:00:00Z'),scope={gameId:'2026_09_KC_SEA',kickoff:now+24*3_600_000,observed:null}
  f.setFailure(true);await assert.rejects(mod.exports.reserveNflBrowserAttempt(f.admin,'public',scope,now));assert.equal(f.rows.size,0)
  f.setFailure(false);f.rows.set(policy.nflBrowserReservationKey('public',scope.gameId,'day-before',0),{key:policy.nflBrowserReservationKey('public',scope.gameId,'day-before',0),fetched_at:'invalid',payload:{version:1}})
  await assert.rejects(mod.exports.reserveNflBrowserAttempt(f.admin,'public',scope,now))
})
test('canonical earlier kickoff controls the guard and incomplete frames do not claim freshness',async()=>{
  const f=fixture(),game={gameId:'2026_09_KC_SEA',gameDate:'2026-11-08',gameTime:'13:00'}
  f.setClock('2026-11-08T17:00:00Z');f.setHistory({captured_at:'2026-11-07T17:00:00Z',raw_tabs:[{incomplete:true}]})
  const scope=await mod.exports.getNflBrowserScope(f.admin,'fanduel',game)
  assert.equal(scope.kickoff,Date.parse('2026-11-08T17:00:00Z'));assert.equal(scope.observed,null)
  f.setClock('2026-11-08T19:00:00Z');await assert.rejects(mod.exports.getNflBrowserScope(f.admin,'fanduel',game))
})
