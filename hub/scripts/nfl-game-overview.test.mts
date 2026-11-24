import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { nflGameOverviewView } from '../src/lib/nflGameOverview'
import { nflKickoffAt } from '../src/app/the-sideline/kickoff'
import type { SidelineGame } from '../src/app/the-sideline/types'
import { publicWorkspaceRequest } from '../src/lib/publicWorkspacePolicy'

const game = { id:'2026_11_IND_HOU',gameday:'2026-11-19',gametime:'20:15',away:{abbr:'IND',name:'Indianapolis Colts',color:'#002c5f',logo:null},home:{abbr:'HOU',name:'Houston Texans',color:'#03202f',logo:null} } as SidelineGame
const cutoff = Date.parse('2026-11-20T01:15:00Z'), observed = cutoff - 60000, now = cutoff + 60000
const frame = () => ({game_id:game.id,observed_at:new Date(observed).toISOString(),cutoff_at:new Date(cutoff).toISOString(),snapshot:{away:game.away.name,home:game.home.name,totalBets:500,totalHandleDollars:22000,splits:[{market:'moneyline',side:'away',betShare:.2,moneyShare:.7},{market:'moneyline',side:'home',betShare:.8,moneyShare:.3}]}})
const project = (value:unknown, through=now) => nflGameOverviewView(value,game,cutoff,now,through)

test('NFL public bets and money retain distinct observed shares and totals',()=>{
 const result=project(frame())!
 assert.equal(result.totalBets,500);assert.equal(result.totalHandleDollars,22000)
 assert.equal(result.splits[0].betShare,.2);assert.equal(result.splits[0].moneyShare,.7)
 assert.deepEqual(Object.keys(result.splits[0]).sort(),['market','side','betShare','moneyShare'].sort())
})
test('wrong matchup, future observations, tip and earlier durable kickoff cannot leak into pregame or replay',()=>{
 const valid=frame()
 for(const invalid of [{...valid,game_id:'2026_11_CIN_WAS'},{...valid,snapshot:{...valid.snapshot,away:game.home.name,home:game.away.name}},{...valid,observed_at:new Date(cutoff).toISOString()},{...valid,observed_at:new Date(now+1).toISOString()},{...valid,cutoff_at:new Date(observed).toISOString()}])assert.equal(project(invalid),null)
 assert.equal(project(valid,observed-1),null)
 assert.ok(project(valid,observed))
})
test('missing sides and conflicting pairs never fabricate complements or zeroes',()=>{
 const missing=frame();missing.snapshot.splits.pop()
 assert.equal(project(missing)!.splits.length,1)
 assert.equal(project(missing)!.splits[0].betShare,.2)
 const conflicting=frame();conflicting.snapshot.splits[1].betShare=.9
 const result=project(conflicting)!
 assert.ok(result.splits.every(row=>row.betShare===null));assert.equal(result.splits[0].moneyShare,.7)
 const zero=frame();zero.snapshot.splits[0].betShare=0;zero.snapshot.splits[1].betShare=1
 assert.equal(project(zero)!.splits[0].betShare,0)
 const duplicated=frame();duplicated.snapshot.splits.push(duplicated.snapshot.splits[0])
 assert.ok(!project(duplicated)!.splits.some(row=>row.side==='away'))
})
function compiled(path:string,imports:Record<string,unknown>){const api:Record<string,any>={};runInNewContext(ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:api,require:(id:string)=>{assert.ok(id in imports,id);return imports[id]},console,Date,AbortSignal,URL});return api}
test('the NFL reader queries the existing archive at the earliest cutoff and selected capture only',async()=>{
 const calls:Array<[string,...unknown[]]>=[];const chain:any={}
 for(const method of ['select','eq','lt','lte','order','limit','abortSignal'])chain[method]=(...args:unknown[])=>{calls.push([method,...args]);return chain}
 chain.maybeSingle=async()=>({data:frame(),error:null})
 const api=compiled('src/lib/nflGameOverviewData.ts',{'server-only':{},'next/cache':{unstable_cache:(fn:unknown)=>fn},'./supabase/admin':{createAdminClient:()=>({from:(table:string)=>{assert.equal(table,'pikkit_pregame_overviews');return chain}})},'./nflPregameResearchData':{readNflPregameResearch:async()=>({cutoffAt:new Date(cutoff-30000).toISOString()})},'./nflGameOverview':{nflGameOverviewView},'@/app/the-sideline/kickoff':{nflKickoffAt}})
 await api.getNflGameOverview(game,new Date(observed).toISOString())
 assert.ok(calls.some(([method,...args])=>method==='eq'&&args[0]==='sport'&&args[1]==='nfl'))
 assert.ok(calls.some(([method,...args])=>method==='eq'&&args[0]==='game_id'&&args[1]===game.id))
 assert.ok(calls.some(([method,...args])=>method==='lt'&&args[1]===new Date(cutoff-30000).toISOString()))
 assert.ok(calls.some(([method,...args])=>method==='lte'&&args[1]===new Date(observed).toISOString()))
})
test('member overview access is gated before data reads and preview access is limited to the featured game',async()=>{
 let denied=true,reads=0,allowed=game.id
 const api=compiled('src/app/the-sideline/game-overview/route.ts',{'next/server':{NextResponse:{json:(body:unknown,init:ResponseInit)=>Response.json(body,init)}},'@/lib/nflAccess':{requireNflAccess:async()=>denied?{error:Response.json({error:'Sign in required'},{status:401})}:{}},'@/lib/nflGameOverviewData':{getNflGameOverview:async()=>{reads++;return project(frame())}},'@/lib/publicWorkspaceScope':{publicWorkspaceGames:(games:SidelineGame[])=>games.filter(item=>item.id===allowed)},'../data':{getSidelineGames:async()=>({games:[game]})}})
 const request=new Request('https://slipsurge.invalid/the-sideline/game-overview?game='+game.id)
 assert.equal((await api.GET(request)).status,401);assert.equal(reads,0)
 denied=false;const response=await api.GET(request);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(reads,1)
 allowed='2026_11_CIN_WAS';assert.equal((await api.GET(request)).status,404);assert.equal(reads,1)
 const scope={game:game.id,date:game.gameday}
 assert.ok(publicWorkspaceRequest('nfl',scope,new URLSearchParams({resource:'/the-sideline/game-overview',game:game.id})))
 assert.equal(publicWorkspaceRequest('nfl',scope,new URLSearchParams({resource:'/the-sideline/game-overview',game:allowed})),null)
})
