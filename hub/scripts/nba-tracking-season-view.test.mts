import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import ts from 'typescript'
import {nbaSeasonTrackingView} from '../src/lib/nbaSeasonTrackingView.ts'
import type {PaintBoard} from '../src/lib/nbaPaint.ts'
const board=(season=2026)=>({game:{id:101,season,date:`${season}-10-25`},players:[{id:1,logs:[{id:1,player:{id:1},team:{id:1},game:{id:10,date:`${season}-10-01`,season,status:'Final'}}]}]}) as unknown as PaintBoard
const sample=()=>({gameId:101,rows:[{id:1,playerId:1,gameId:10,teamId:1,values:{pace:98}}],seasons:[2026],complete:true,fields:['pace'],sourceStates:[{key:'advanced:2026',complete:true}],fetchedAt:'2026-10-25T12:00:00Z'})
test('retains exact verified original values and dates for selected 2026 and 2025',()=>{
 const b=board(),data=sample(),copy=structuredClone(data)
 assert.deepEqual(nbaSeasonTrackingView(b,data),copy);assert.deepEqual(data,copy)
 const old=board(2025),oldData={...sample(),seasons:[2025],sourceStates:[{key:'advanced:2025',complete:true}]}
 assert.deepEqual(nbaSeasonTrackingView(old,oldData),oldData)
 old.game.date='2026-04-20';old.players[0].logs[0].game.date='2026-04-01'
 assert.deepEqual(nbaSeasonTrackingView(old,oldData),oldData,'2025 season correctly includes spring 2026')
})
test('removes prior, unknown, mismatched and conflicting witnesses without fabricating values',()=>{
 const b=board(),data=sample(),player=b.players[0],log=player.logs[0]
 player.logs.push({...log,id:2,game:{...log.game,id:11,date:'2026-04-01',season:2025}})
 data.rows.push({id:2,playerId:1,gameId:11,teamId:1,values:{pace:99}});data.seasons=[2025,2026];data.sourceStates=[{key:'advanced:2025',complete:true},{key:'advanced:2026',complete:true}]
 const result=nbaSeasonTrackingView(b,data)
 assert.deepEqual(result.rows,[data.rows[0]]);assert.equal(result.complete,false);assert.deepEqual(result.seasons,[2026]);assert.deepEqual(result.sourceStates,[{key:'advanced:2026',complete:true}])
 player.logs.push({...log,game:{...log.game,season:2025}})
 assert.deepEqual(nbaSeasonTrackingView(b,data).rows,[])
 const unknown=sample();unknown.seasons=[]
 assert.deepEqual(nbaSeasonTrackingView(board(),unknown).rows,[])
 const wrongState=sample();wrongState.sourceStates=[{key:'advanced:2025',complete:true}]
 const safeRow=nbaSeasonTrackingView(board(),wrongState)
 assert.deepEqual(safeRow.rows,wrongState.rows);assert.equal(safeRow.complete,false);assert.deepEqual(safeRow.sourceStates,[])
 const noStates={...sample(),sourceStates:undefined};assert.equal(nbaSeasonTrackingView(board(),noStates).complete,false)
 const incomplete=sample();incomplete.sourceStates[0].complete=false;assert.equal(nbaSeasonTrackingView(board(),incomplete).complete,false)
})
test('rejects the target game, invalid target date, ambiguous team and missing season',()=>{
 for(const mutate of [
  (b:PaintBoard)=>{b.players[0].logs[0].game.id=b.game.id},
  (b:PaintBoard)=>{b.game.date='2026-10-25T00:00:00Z'},
  (b:PaintBoard)=>{b.game.date='2026-02-30'},
  (b:PaintBoard)=>{b.game.season=2025},
  (b:PaintBoard)=>{b.players[0].logs[0].game.season=undefined},
  (b:PaintBoard)=>{b.players[0].logs[0].period=1},
  (b:PaintBoard)=>{b.players[0].logs[0].game.status_state='in_progress'},
  (b:PaintBoard)=>{b.players[0].logs.push({...b.players[0].logs[0],team:{id:2}})},
 ]){const b=board();mutate(b);const r=nbaSeasonTrackingView(b,sample());assert.deepEqual(r.rows,[]);assert.equal(r.complete,false)}
})
test('actual route uses one saved board and tracking read and does not write or query providers',async()=>{
 const source=await readFile(new URL('../src/app/the-paint/tracking/route.ts',import.meta.url),'utf8')
 const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 let reads=0,boardReads=0;const b=board(),data=sample()
 const imports:Record<string,unknown>={'next/server':{NextResponse:{json:(value:unknown,init?:{status?:number})=>({status:init?.status??200,value})}},'@/lib/paintAccess':{requirePaintAccess:async()=>({})},'@/lib/nbaOddsMode':{nbaOddsMode:(x:string)=>x==='live'?'live':'pregame'},'@/lib/nbaPaintData':{getPaintGame:async()=>b.game,getPaintBoard:async()=>{boardReads++;return b}},'@/lib/nbaResearchResources':{getNbaResearchTracking:async()=>{reads++;return data}},'@/lib/nbaSeasonTrackingView':{nbaSeasonTrackingView},'@/lib/nbaResearchBundle':{resolveNbaResearchBundle:async(b:PaintBoard,_mode:string,load:(board:PaintBoard)=>Promise<unknown>)=>({board:b,value:await load(b)})}}
 const m={exports:{} as {GET:(request:unknown)=>Promise<{status:number;value:ReturnType<typeof sample>}>}}
 new Function('require','exports','module',output)((name:string)=>{assert.ok(name in imports,name);return imports[name]},m.exports,m)
 for(const mode of ['pregame','live']){const result=await m.exports.GET({nextUrl:new URL(`https://example.test/?game=101&mode=${mode}`)});assert.equal(result.status,200);assert.deepEqual(result.value.rows,data.rows)}
 assert.equal(reads,2);assert.equal(boardReads,2);assert.deepEqual(data,sample())
})
test('a pregame request crossing tip pairs the final saved tracking winner and final board',async()=>{
 const initial=board(),final=board(),first=sample(),last=sample();last.rows=[{id:3,playerId:1,gameId:12,teamId:1,values:{pace:103}}]
 final.players[0].logs.push({...final.players[0].logs[0],id:3,game:{...final.players[0].logs[0].game,id:12,date:'2026-10-02'}})
 let reads=0,clocks=0,boardReads=0
 const source=await readFile(new URL('../src/lib/nbaResearchBundle.ts',import.meta.url),'utf8')
 const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 const bmod={exports:{} as {resolveNbaResearchBundle:(board:PaintBoard,mode:string,load:(board:PaintBoard)=>Promise<unknown>)=>Promise<{board:PaintBoard;value:unknown}>}}
 const bundleImports:Record<string,unknown>={'server-only':{},'./nbaPaintData':{getPaintBoard:async()=>{boardReads++;return final}},'./nbaOddsClockData':{getNbaOddsGame:async()=>{clocks++;return {...initial.game,status:'Final'}}},'./nbaOddsMode':{nbaPregameOpen:()=>false}}
 new Function('require','exports','module',output)((name:string)=>{assert.ok(name in bundleImports,name);return bundleImports[name]},bmod.exports,bmod)
 const routeSource=await readFile(new URL('../src/app/the-paint/tracking/route.ts',import.meta.url),'utf8'),compiled=ts.transpileModule(routeSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 const imports:Record<string,unknown>={'next/server':{NextResponse:{json:(value:unknown,init?:{status?:number})=>({status:init?.status??200,value})}},'@/lib/paintAccess':{requirePaintAccess:async()=>({})},'@/lib/nbaOddsMode':{nbaOddsMode:()=> 'pregame'},'@/lib/nbaPaintData':{getPaintGame:async()=>initial.game,getPaintBoard:async()=>initial},'@/lib/nbaResearchResources':{getNbaResearchTracking:async()=>++reads===1?first:last},'@/lib/nbaSeasonTrackingView':{nbaSeasonTrackingView},'@/lib/nbaResearchBundle':bmod.exports}
 const m={exports:{} as {GET:(request:unknown)=>Promise<{status:number;value:ReturnType<typeof sample>}>}}
 new Function('require','exports','module',compiled)((name:string)=>{assert.ok(name in imports,name);return imports[name]},m.exports,m)
 const result=await m.exports.GET({nextUrl:new URL('https://example.test/?game=101')})
 assert.equal(result.status,200);assert.deepEqual(result.value.rows,last.rows);assert.equal(reads,2);assert.equal(clocks,1);assert.equal(boardReads,1)
})
