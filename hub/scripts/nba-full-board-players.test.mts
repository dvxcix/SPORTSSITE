import assert from 'node:assert/strict'
import test from 'node:test'
import { nbaFullBoardPlayers } from '../src/lib/nbaFullBoardPlayers.ts'
import type { PaintGame,PaintRoster } from '../src/lib/nbaPaint.ts'

const home={id:1,abbreviation:'BOS',full_name:'Boston Celtics'},away={id:2,abbreviation:'LAL',full_name:'Los Angeles Lakers'}
const player=(id:number,first:string,last:string,team:typeof home,headshot?:string|null)=>({id,first_name:first,last_name:last,position:'G',team,headshot}) as PaintRoster&{headshot?:string|null}
const game=()=>({id:12,date:'2026-11-02',datetime:new Date(Date.now()+60_000).toISOString(),status:'Scheduled',status_state:'scheduled',home_team:home,visitor_team:away}) as PaintGame

test('open board uses exactly matched cached team artwork and keeps names and positions',async()=>{
 const calls:string[]=[]
 const roster=[player(1,'Amy','Adams',home),player(2,'Bea','Baker',away),player(3,'Cam','Clark',home)]
 const result=await nbaFullBoardPlayers(game(),roster,true,true,async team=>{calls.push(team);return {headshots:new Map(team==='BOS'?[['amyadams','https://images.example/amy.png'],['camclark',null]]:[['beabaker','https://images.example/bea.png']])}})
 assert.deepEqual(calls.sort(),['BOS','LAL']);assert.deepEqual(result.map(p=>p.headshot),['https://images.example/amy.png','https://images.example/bea.png',null])
 assert.equal(result[0].position,'G');assert.equal(result[0].team.id,1)
})

test('unmatched, unavailable or ambiguous artwork remains a safe fallback',async()=>{
 const roster=[player(1,'Amy','Adams',home),player(2,'Amy','Adams Jr.',home),player(3,'Bea','Baker',away)]
 const result=await nbaFullBoardPlayers(game(),roster,true,true,async team=>{if(team==='LAL')throw Error('unavailable');return {headshots:new Map([['amyadams','https://images.example/amy.png']])}})
 assert.deepEqual(result.map(p=>p.headshot),[null,null,null])
 const withoutPrices=await nbaFullBoardPlayers(game(),roster,true,false,async()=>{throw Error('must not fetch')})
 assert.deepEqual(withoutPrices.map(p=>p.headshot),[null,null,null])
})

test('closed games use only their saved headshots and never look up current artwork',async()=>{
 const closed={...game(),status:'Final',status_state:'final'} as PaintGame
 const roster=[player(1,'Amy','Adams',home,'https://images.example/saved.png'),player(2,'Bea','Baker',away,null)]
 const result=await nbaFullBoardPlayers(closed,roster,false,true,async()=>{throw Error('must not fetch')})
 assert.deepEqual(result.map(p=>p.headshot),['https://images.example/saved.png',null])
})

test('an artwork read crossing tip cannot return open-game portraits',async()=>{
 const original=Date.now;let now=original();Date.now=()=>now
 try{
  const scheduled=game(),tip=Date.parse(scheduled.datetime!)
  await assert.rejects(nbaFullBoardPlayers(scheduled,[player(1,'Amy','Adams',home)],true,true,async()=>{now=tip;return {headshots:new Map([['amyadams','https://images.example/current.png']])}}),/crossed its cutoff/)
 }finally{Date.now=original}
})
