import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import * as modes from '../src/lib/nbaOddsMode.ts'
import * as paint from '../src/lib/nbaPaint.ts'
import {nbaValidOdds} from '../src/lib/nbaOddsHistory.ts'
import * as bookCurrent from '../src/lib/nbaBookCurrent.ts'
import * as bookPropQuotes from '../src/lib/scrapers/nbaBookPropQuotes.ts'
import * as bookFirstQuotes from '../src/lib/scrapers/nbaFirstBookQuotes.ts'
import type {NbaBookPropFrame,NbaBookPropObservation,NbaBookPropCoverage} from '../src/lib/nbaBookPropsData.ts'
import type { PaintGame, PaintProp } from '../src/lib/nbaPaint.ts'
import type { NbaFirstBookCapture } from '../src/lib/scrapers/nbaFirstBooks.ts'
import type { NbaFirstBookGame } from '../src/lib/scrapers/nbaFirstBookQuotes.ts'
import type { NbaBookFirstFrame, NbaFirstBook } from '../src/lib/nbaBookFirstData.ts'

const now=Date.parse('2026-10-24T12:00:00Z')
const team={id:2,abbreviation:'BOS',full_name:'Boston Celtics',name:'Celtics'}
const game:PaintGame={id:123,date:'2026-10-24',season:2026,status:'Scheduled',status_state:'scheduled',datetime:'2026-10-24T23:00:00Z',period:0,home_team:team,visitor_team:{...team,id:9},home_team_score:0,visitor_team_score:0}
const observation=(book:NbaFirstBook,gameId:number):NbaFirstBookGame=>({gameId,complete:true,observedAt:new Date(now).toISOString(),status:'captured',unmatched:0,clockMismatch:false,props:[{id:-123,game_id:gameId,player_id:434,vendor:book,prop_type:book==='draftkings'?'first_score':'first_field_goal',line_value:'0.5',market:{type:'over_under',over_odds:500},updated_at:new Date(now).toISOString()}]})
type Callbacks={onFirst:(item:NbaFirstBookGame)=>Promise<void>;onRegular:(gameId:number,frames:NbaBookPropObservation[],coverage:NbaBookPropCoverage[],observedAt:string)=>Promise<void>}
type Options={count?:number;games?:PaintGame[];scheduleError?:boolean;incompleteSchedule?:boolean;gameError?:number;rosterError?:number;leaseError?:NbaFirstBook;saveError?:NbaFirstBook;advancePreparation?:number;firstSave?:(frame:NbaBookFirstFrame,advance:(at:number)=>void)=>Promise<void>;regularPrevious?:(game:PaintGame)=>NbaBookPropFrame[];capture?:(book:NbaFirstBook,inputs:PaintGame[],advance:(at:number)=>void)=>Promise<Partial<NbaFirstBookCapture>>|Partial<NbaFirstBookCapture>;stream?:(book:NbaFirstBook,inputs:PaintGame[],callbacks:Callbacks,advance:(at:number)=>void,peek:()=>{first:NbaBookFirstFrame[];regular:NbaBookPropFrame[]})=>Promise<Partial<NbaFirstBookCapture>>}
async function fixture(options:Options={}){
  let clock=now,scheduleReads=0,gameReads=0,rosterReads=0,collects=0,maxWrites=0
  class Clock extends Date{constructor(value:string|number=clock){super(value)}static now(){return clock}}
  const regularSaves:NbaBookPropFrame[]=[]
  const writeAttempts:{book:NbaFirstBook;gameId:number;at:number}[]=[]
  const collectorCalls:{book:NbaFirstBook;gameIds:number[];deadline:number}[]=[]
  const saves:NbaBookFirstFrame[]=[],leaseCalls:{key:string;ttl:number;stale:number;seconds:number}[]=[],deadlines:number[]=[],active=new Map<string,number>(),cache=new Map<string,Promise<unknown>>()
  const games=options.games??Array.from({length:options.count??2},(_,i)=>({...game,id:game.id+i}))
  const source=await readFile(new URL('../src/app/api/cron/nba-book-first-capture/route.ts',import.meta.url),'utf8')
  const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
  const bookSource=await readFile(new URL('../src/lib/nbaBookPropsData.ts',import.meta.url),'utf8'),bookOutput=ts.transpileModule(bookSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,bookModule={exports:{} as typeof import('../src/lib/nbaBookPropsData.ts')}
  const bookImports:Record<string,unknown>={'server-only':{},'./supabase/admin':{},'./nbaSharedCache':{},'./nbaOddsMode':modes,'./nbaOddsHistory':{nbaValidOdds},'./nbaPaint':paint,'./nbaBookCurrent':bookCurrent}
  new Function('require','module','exports','Date',bookOutput)((name:string)=>{assert.ok(name in bookImports,name);return bookImports[name]},bookModule,bookModule.exports,Clock)
  const imports:Record<string,unknown>={
    'next/server':{NextResponse:{json:(body:unknown,init?:ResponseInit)=>Response.json(body,init)}},
    '@/lib/cron-auth':{requireCronAuth:(request:Request)=>request.headers.get('authorization')==='Bearer fixture'?null:Response.json({error:'Unauthorized'},{status:401})},
    '@/lib/pipelineHealth':{withPipelineHealth:(name:string,run:unknown)=>{assert.equal(name,'nba-book-first-capture');return run}},
    '@/lib/nbaPaint':{nbaToday:()=>game.date},'@/lib/nbaOddsMode':{...modes,nbaPregameOpen:(g:PaintGame)=>modes.nbaPregameOpen(g,clock)},
    '@/lib/nbaPaintData':{
      getPaintSchedule:async()=>{scheduleReads++;if(options.scheduleError)throw new Error('private-source-url');return{complete:!options.incompleteSchedule,games}},
      getPaintGame:async(id:number)=>{gameReads++;if(options.advancePreparation)clock+=options.advancePreparation;if(id===options.gameError)throw new Error('secret');return games.find(g=>g.id===id)!},
      getPaintRoster:async(g:PaintGame)=>{rosterReads++;if(g.id===options.rosterError)throw new Error('secret');return[]},
    },
    '@/lib/nbaSharedCache':{nbaSharedCache:async(key:string,ttl:number,stale:number,load:()=>Promise<unknown>,seconds:number)=>{
      leaseCalls.push({key,ttl,stale,seconds});if(options.leaseError&&key.includes(`:${options.leaseError}:`))throw new Error('lease unavailable')
      if(!cache.has(key))cache.set(key,load());return{value:await cache.get(key)}
    }},
    '@/lib/nbaBookFirstData':{NBA_FIRST_BOOKS:['draftkings','betmgm'],saveNbaBookFirstFrame:async(g:PaintGame,frame:NbaBookFirstFrame)=>{
      assert.equal(frame.gameId,g.id);assert.equal(Date.parse(frame.tipoff),Date.parse(g.datetime!));assert.ok(modes.nbaPregameOpen(g,clock));assert.ok(frame.props.every((p:PaintProp)=>p.vendor===frame.book&&p.game_id===g.id))
      writeAttempts.push({book:frame.book,gameId:g.id,at:clock})
      if(frame.book===options.saveError)throw new Error('private-source-url')
      active.set(frame.book,(active.get(frame.book)??0)+1);maxWrites=Math.max(maxWrites,active.get(frame.book)!);await options.firstSave?.(frame,at=>{clock=at});await new Promise(resolve=>setTimeout(resolve,1));saves.push(frame);active.set(frame.book,active.get(frame.book)!-1)
    }},
    '@/lib/nbaBookPropsData':{...bookModule.exports,getNbaBookPropEntries:async(g:PaintGame)=>(options.regularPrevious?.(g)??[]).map(frame=>({key:bookModule.exports.nbaBookPropKey(g,frame.contract),payload:frame})),saveNbaBookPropFrames:async(g:PaintGame,frames:NbaBookPropFrame[])=>{assert.ok(frames.every(frame=>bookModule.exports.nbaValidBookPropFrame(frame,g)));regularSaves.push(...frames)}},
    '@/lib/scrapers/nbaBookPropQuotes':bookPropQuotes,
    '@/lib/scrapers/nbaFirstBookQuotes':bookFirstQuotes,
    '@/lib/scrapers/nbaFirstBooks':{collectNbaFirstBooks:async(book:NbaFirstBook,inputs:{game:PaintGame}[],deadline:number,callbacks:Callbacks)=>{
      collects++;deadlines.push(deadline)
      collectorCalls.push({book,gameIds:inputs.map(input=>input.game.id),deadline})
      return{book,observedAt:new Date(clock).toISOString(),complete:true,games:inputs.map(input=>observation(book,input.game.id)),regularCoverage:book==='betmgm'?inputs.map(input=>({gameId:input.game.id,market:'points',complete:true,observedAt:new Date(clock).toISOString(),contracts:[]})):[],errors:[],...await options.capture?.(book,inputs.map(i=>i.game),at=>{clock=at}),...await options.stream?.(book,inputs.map(i=>i.game),callbacks,at=>{clock=at},()=>({first:saves,regular:regularSaves}))}
    }},
  }
  const compiled={exports:{} as {GET:(request:Request)=>Promise<Response>}}
  new Function('require','module','exports','Date',output)((name:string)=>{assert.ok(name in imports,name);return imports[name]},compiled,compiled.exports,Clock)
  const run=async(auth=true)=>{const response=await compiled.exports.GET(new Request('https://www.slipsurge.com/api/cron/nba-book-first-capture',{headers:auth?{authorization:'Bearer fixture'}:{}}));return{response,body:await response.json()}}
  return{run,saves,regularSaves,writeAttempts,collectorCalls,leaseCalls,deadlines,counts:()=>({scheduleReads,gameReads,rosterReads,collects,maxWrites})}
}

test('cron authentication denies before schedules, leases, browser work or writes',async()=>{
  const h=await fixture(),result=await h.run(false)
  assert.equal(result.response.status,401);assert.deepEqual(h.counts(),{scheduleReads:0,gameReads:0,rosterReads:0,collects:0,maxWrites:0});assert.equal(h.leaseCalls.length,0);assert.equal(h.saves.length,0)
})

test('complete schedule deduplicates today/tomorrow and persists each book/game with bounded parallel writes',async()=>{
  const h=await fixture({count:10}),result=await h.run()
  assert.equal(result.response.status,200);assert.equal(result.body.checked,10);assert.equal(result.body.saved,20);assert.equal(h.counts().collects,4);assert.ok(h.counts().maxWrites<=4)
  assert.equal(h.saves.length,20);assert.equal(new Set(h.saves.map(s=>`${s.book}:${s.gameId}`)).size,20)
  assert.ok(h.leaseCalls.every(c=>c.ttl===60&&c.stale===0&&c.seconds===300));assert.ok(h.deadlines.every(deadline=>deadline===now+240_000))
})

test('concurrent and repeated invocations share per-book leases and cannot duplicate saved captures',async()=>{
  const h=await fixture({count:15}),results=await Promise.all(Array.from({length:20},()=>h.run()))
  assert.ok(results.every(result=>result.response.status===200));assert.equal(h.counts().collects,5);assert.equal(h.saves.length,30)
  await h.run();assert.equal(h.counts().collects,5);assert.equal(h.saves.length,30)
})

test('one failed book lease leaves the other book independent and reports503',async()=>{
  const h=await fixture({leaseError:'draftkings'}),result=await h.run()
  assert.equal(result.response.status,503);assert.equal(result.body.failed,1);assert.equal(result.body.saved,2);assert.ok(h.saves.every(frame=>frame.book==='betmgm'));assert.equal(h.counts().collects,1)
})

test('schedule errors, incomplete pagination and excessive slates cannot start collectors or falsely report success',async()=>{
  for(const options of [{scheduleError:true},{incompleteSchedule:true},{count:31}]){
    const h=await fixture(options),result=await h.run()
    assert.equal(result.response.status,503);assert.equal(h.counts().collects,0);assert.equal(h.saves.length,0);assert.equal(JSON.stringify(result.body).includes('private-source-url'),false)
  }
})

test('missing game or roster preparation does not suppress verified siblings or hide failure',async()=>{
  for(const options of [{gameError:123},{rosterError:123}]){
    const h=await fixture(options),result=await h.run()
    assert.equal(result.response.status,503);assert.equal(result.body.failed,1);assert.equal(result.body.saved,2);assert.ok(h.saves.every(frame=>frame.gameId===124))
  }
})

test('partial game observations retain complete sibling frames and leave incomplete player lists unwritten',async()=>{
  const h=await fixture({capture:(book,inputs)=>({complete:false,games:inputs.map(input=>input.id!==123?observation(book,input.id):{...observation(book,input.id),complete:false,status:'partial',unmatched:1})})}),result=await h.run()
  assert.equal(result.response.status,503);assert.equal(result.body.failed,2);assert.equal(result.body.saved,2);assert.ok(h.saves.every(frame=>frame.gameId===124))
  assert.ok(result.body.books.every((book:{games:{status:string}[]})=>book.games.some(item=>item.status==='partial')))
})

test('explicit unlisted or unavailable boards defer without inventing empty withdrawals',async()=>{
  const h=await fixture({capture:(_book,inputs)=>({complete:false,games:inputs.map(input=>({...observation('draftkings',input.id),complete:false,status:'unlisted',props:[]}))})}),result=await h.run()
  assert.equal(result.response.status,200);assert.equal(result.body.saved,0);assert.equal(result.body.deferred,4);assert.equal(h.saves.length,0)
})

test('missing/duplicate/unknown collector game identities cannot become success or overwrite ambiguous frames',async()=>{
  for(const capture of [()=>({games:[]}), (book:NbaFirstBook)=>({games:[observation(book,123),observation(book,123)]}),(book:NbaFirstBook)=>({games:[observation(book,999)]})]){
    const h=await fixture({capture}),result=await h.run()
    assert.equal(result.response.status,503);assert.ok(result.body.failed>0);assert.equal(result.body.saved,0);assert.equal(h.saves.length,0)
  }
})

test('a claimed complete result with no prices is invalid and cannot fabricate withdrawal',async()=>{
  const h=await fixture({capture:(book,inputs)=>({games:inputs.map(input=>({...observation(book,input.id),props:[]}))})}),result=await h.run()
  assert.equal(result.response.status,503);assert.equal(result.body.saved,0);assert.equal(h.saves.length,0)
})

test('crossing canonical tip before persistence closes the frame without post-tip writes',async()=>{
  const h=await fixture({capture:(_book,_inputs,advance)=>{advance(Date.parse(game.datetime!)+1);return{}}}),result=await h.run()
  assert.equal(result.response.status,200);assert.equal(result.body.saved,0);assert.equal(result.body.deferred,4);assert.equal(h.saves.length,0)
  assert.ok(result.body.books.every((book:{games:{status:string}[]})=>book.games.every(item=>item.status==='closed')))
})

test('storage failures remain failed in cached receipts; a later invocation never replays uncertain writes',async()=>{
  const h=await fixture({saveError:'draftkings'}),first=await h.run(),again=await h.run()
  assert.equal(first.response.status,503);assert.equal(again.response.status,503);assert.equal(first.body.saved,2);assert.equal(again.body.failed,2);assert.equal(h.counts().collects,2);assert.equal(h.saves.length,2)
  assert.equal(JSON.stringify(first.body).includes('private-source-url'),false)
})

test('preparation and save deadlines leave bounded browser/commit time and never report unperformed writes',async()=>{
  const prep=await fixture({count:8,advancePreparation:20_000}),prepared=await prep.run()
  assert.equal(prepared.response.status,503);assert.ok(prepared.body.failed>=4);assert.ok(prep.deadlines.every(deadline=>deadline===now+240_000))
  const slow=await fixture({capture:(_book,_inputs,advance)=>{advance(now+261_000);return{}}}),result=await slow.run()
  assert.equal(result.response.status,503);assert.equal(result.body.saved,0);assert.equal(slow.saves.length,0)
  assert.ok(result.body.books.every((book:{games:{status:string}[]})=>book.games.every(item=>item.status==='deadline')))
})

test('verified regular panels persist independently of missing First Basket and partial panel failure remains visible',async()=>{
  const h=await fixture({capture:(book,inputs)=>({games:book==='betmgm'?[]:inputs.map(input=>observation(book,input.id)),regular:book==='betmgm'?inputs.flatMap(input=>[15,30].map(line=>({gameId:input.id,contractKey:`points:milestone:${line}`,market:'points',status:line===15?'captured':'partial',complete:line===15,unmatched:line===15?0:1,observedAt:new Date(now).toISOString(),props:[{id:-5_000_000_000_434,game_id:input.id,player_id:434,vendor:'betmgm',prop_type:'points',line_value:String(line),market:{type:'milestone' as const,odds:400},updated_at:new Date(now).toISOString()}]}))):[]})}),result=await h.run()
  assert.equal(result.response.status,503);assert.equal(h.regularSaves.length,4);assert.equal(h.regularSaves.filter(frame=>frame.complete).length,2)
  assert.equal(result.body.books.find((book:{book:string})=>book.book==='betmgm').regularSaved,4)
  assert.ok(h.saves.every(frame=>frame.book==='draftkings'))
})

test('private error telemetry contains only bounded known codes, stages, reasons and optional game IDs',async()=>{
  const h=await fixture({capture:(_book,inputs)=>({games:inputs.map(input=>({...observation('draftkings',input.id),complete:false,status:'error'})),errors:[
    {code:'navigation-failed' as const,gameId:123,stage:'event-navigation' as const,reason:'navigation-interrupted' as const,message:'private-source-url'},
    {code:'navigation-failed' as const,gameId:124,stage:'private-source-url' as never,reason:'private-source-url' as never},
    ...Array.from({length:70},()=>({code:'challenge' as const,gameId:123,secret:'private-source-url'})),{code:'private-source-url' as never},
  ]})}),result=await h.run()
  assert.equal(result.response.status,503);assert.ok(result.body.books.every((book:{errors:unknown[]})=>book.errors.length===64));assert.equal(JSON.stringify(result.body).includes('private-source-url'),false)
  assert.deepEqual(result.body.books[0].errors[0],{code:'navigation-failed',gameId:123,stage:'event-navigation',reason:'navigation-interrupted'})
  assert.deepEqual(result.body.books[0].errors[1],{code:'navigation-failed',gameId:124})
  assert.deepEqual(result.body.books[0].errors[2],{code:'challenge',gameId:123})
})

test('private identity receipts keep only fixed rejection reasons and bounded candidate counts',async()=>{
  const h=await fixture({capture:(book,inputs)=>({games:inputs.map((input,index)=>({...observation(book,input.id),props:[],complete:false,status:'identity-mismatch',identity:index===0?{reason:'ambiguous-league-event',candidates:250,validCandidates:0,url:'private-source-url',member:'private-member'}:{reason:'private-source-url' as never,candidates:2}}))})}),result=await h.run()
  assert.equal(result.response.status,503);assert.equal(h.saves.length,0)
  for(const book of result.body.books){assert.deepEqual(book.games[0].identity,{reason:'ambiguous-league-event',candidates:200,validCandidates:0});assert.equal(book.games[1].identity,undefined)}
  assert.equal(JSON.stringify(result.body).includes('private-source-url'),false);assert.equal(JSON.stringify(result.body).includes('private-member'),false)
})

test('private First revalidation receipts retain only fixed reasons and bounded original countdown clocks',async()=>{
  const identity={phase:'current' as const,reason:'countdown-tipoff-mismatch' as const,canonicalTip:new Date(game.datetime!).toISOString(),priorCountdown:{minutes:22,readAt:new Date(now).toISOString()},currentCountdown:{minutes:21,readAt:new Date(now+60_000).toISOString()}}
  const h=await fixture({capture:()=>({errors:[
    {code:'layout-unavailable',stage:'first-revalidate',identity:{...identity,url:'private-source-url',member:'private-member'}},
    {code:'layout-unavailable',stage:'event-identity',identity},
    {code:'layout-unavailable',stage:'first-revalidate',identity:{...identity,reason:'private-source-url' as never}},
  ]})}),result=await h.run()
  assert.equal(result.response.status,503)
  assert.deepEqual(result.body.books[0].errors[0],{code:'layout-unavailable',stage:'first-revalidate',identity})
  assert.equal(result.body.books[0].errors[1].identity,undefined);assert.equal(result.body.books[0].errors[2].identity,undefined)
  assert.equal(JSON.stringify(result.body).includes('private-source-url'),false);assert.equal(JSON.stringify(result.body).includes('private-member'),false)
})

test('private telemetry retains only known league discovery stages without source URLs or arbitrary error text',async()=>{
  const h=await fixture({capture:()=>({errors:['league-navigation','league-events','league-links'].map(stage=>({code:'navigation-failed' as const,stage:stage as 'league-links',reason:'timeout' as const,message:'private-source-url'}))})}),result=await h.run()
  assert.equal(result.response.status,503);assert.equal(JSON.stringify(result.body).includes('private-source-url'),false)
  assert.deepEqual(result.body.books[0].errors.map((item:{stage:string})=>item.stage),['league-navigation','league-events','league-links'])
})

test('a listed regular menu with missing or incomplete inspection fails even without any prior direct prices',async()=>{
  for(const incomplete of [false,true]){
    const h=await fixture({capture:(book,inputs)=>book==='betmgm'?{regular:[],regularCoverage:incomplete?inputs.map(input=>({gameId:input.id,market:'points',complete:false,observedAt:new Date(now).toISOString(),contracts:[]})):[]}:{} }),result=await h.run()
    assert.equal(result.response.status,503);assert.equal(result.body.saved,4);assert.equal(h.regularSaves.length,0)
    assert.equal(result.body.books.find((book:{book:string})=>book.book==='betmgm').failed,2)
  }
  const unlisted=await fixture({capture:(book,inputs)=>book==='betmgm'?{games:inputs.map(input=>({...observation(book,input.id),props:[],complete:false,status:'unlisted'})),regularCoverage:[]}:{} }),result=await unlisted.run()
  assert.equal(result.response.status,200);assert.equal(result.body.deferred,2)
})

test('private incomplete-market diagnostics contain only deduplicated known market keys and never raw source labels',async()=>{
  const known=Object.values(bookPropQuotes.MGM_MILESTONE_PANELS)
  const h=await fixture({count:1,capture:(book,inputs)=>book==='betmgm'?{regularCoverage:[...known,...known,'private-source-url','Private market label'].map(market=>({gameId:inputs[0].id,market,complete:market==='points',observedAt:new Date(now).toISOString(),contracts:[]}))}:{} }),result=await h.run()
  const receipt=result.body.books.find((book:{book:string})=>book.book==='betmgm')
  assert.equal(result.response.status,503);assert.deepEqual(receipt.regularGames[0].incompleteMarkets,known.filter(market=>market!=='points'))
  assert.ok(receipt.regularGames[0].incompleteMarkets.length<=11);assert.equal(JSON.stringify(result.body).includes('private-source-url'),false);assert.equal(JSON.stringify(result.body).includes('Private market label'),false)
})

test('verified selected All with no player markets defers only when no exact prior contract exists',async()=>{
  const capture=(book:NbaFirstBook,inputs:PaintGame[])=>book==='betmgm'?{regular:[],regularCoverage:inputs.map(input=>({gameId:input.id,market:'points',complete:false,status:'unavailable' as const,observedAt:new Date(now).toISOString(),contracts:[]}))}:{}
  const empty=await fixture({capture}),deferred=await empty.run()
  assert.equal(deferred.response.status,200);assert.equal(deferred.body.saved,4);assert.equal(empty.regularSaves.length,0)
  assert.equal(deferred.body.books.find((book:{book:string})=>book.book==='betmgm').regularDeferred,2)
  const prior=await fixture({capture,regularPrevious:g=>[{gameId:g.id,book:'betmgm',tipoff:new Date(g.datetime!).toISOString(),contract:{market:'points',type:'milestone',line:30},observedAt:new Date(now-1000).toISOString(),complete:true,props:[{id:-5_000_000_000_434,game_id:g.id,player_id:434,vendor:'betmgm',prop_type:'points',line_value:'30',market:{type:'milestone',odds:400},updated_at:new Date(now-1000).toISOString()}]}]}),held=await prior.run()
  assert.equal(held.response.status,503);assert.equal(prior.regularSaves.length,2);assert.ok(prior.regularSaves.every(frame=>!frame.complete&&frame.props.length===0))
  assert.equal(held.body.books.find((book:{book:string})=>book.book==='betmgm').regularDeferred,0)
})

test('First Basket and regular callbacks persist before deep inspection ends without final rewrites or timestamp changes',async()=>{
  const h=await fixture({count:1,stream:async(book,inputs,callbacks,advance,peek)=>{
    if(book!=='betmgm')return{}
    const item=observation(book,inputs[0].id)
    await callbacks.onFirst(item)
    assert.equal(peek().first.filter(frame=>frame.book==='betmgm').length,1)
    const at=new Date(now).toISOString(),frames=[{gameId:item.gameId,contractKey:'points:milestone:30',market:'points',status:'captured' as const,complete:true,unmatched:0,observedAt:at,props:[{id:-5_000_000_000_434,game_id:item.gameId,player_id:434,vendor:'betmgm',prop_type:'points',line_value:'30',market:{type:'milestone' as const,odds:400},updated_at:at}]}]
    const coverage=[{gameId:item.gameId,market:'points',complete:true,observedAt:at,contracts:['points:milestone:30']}]
    await callbacks.onRegular(item.gameId,frames,coverage,at)
    assert.equal(peek().regular.length,1)
    advance(now+200_000)
    return{games:[item],regular:frames,regularCoverage:coverage,observedAt:new Date(now+200_000).toISOString()}
  }}),result=await h.run()
  assert.equal(result.response.status,200);assert.equal(h.regularSaves.length,1)
  assert.equal(h.writeAttempts.filter(attempt=>attempt.book==='betmgm').length,1);assert.equal(h.writeAttempts.find(attempt=>attempt.book==='betmgm')!.at,now)
  assert.equal(h.saves.find(frame=>frame.book==='betmgm')!.observedAt,new Date(now).toISOString());assert.equal(h.regularSaves[0].props[0].updated_at,new Date(now).toISOString())
})

test('an in-flight callback replay or final result waits the original write instead of starting another',async()=>{
  const h=await fixture({count:1,stream:async(book,inputs,callbacks)=>{
    if(book!=='betmgm')return{}
    const item=observation(book,inputs[0].id)
    void callbacks.onFirst(item)
    void callbacks.onFirst(structuredClone(item))
    return{games:[item]}
  }}),result=await h.run()
  assert.equal(result.response.status,200);assert.equal(h.saves.filter(frame=>frame.book==='betmgm').length,1);assert.equal(h.writeAttempts.filter(attempt=>attempt.book==='betmgm').length,1)
})

test('early write failures remain visible and are never retried by the final result or cached invocation',async()=>{
  const h=await fixture({count:1,saveError:'betmgm',stream:async(book,inputs,callbacks)=>{
    if(book!=='betmgm')return{}
    const item=observation(book,inputs[0].id);await callbacks.onFirst(item);return{games:[item]}
  }}),result=await h.run(),again=await h.run()
  assert.equal(result.response.status,503);assert.equal(again.response.status,503);assert.equal(h.writeAttempts.filter(attempt=>attempt.book==='betmgm').length,1)
  assert.equal(h.saves.filter(frame=>frame.book==='betmgm').length,0);assert.equal(result.body.books.find((book:{book:string})=>book.book==='betmgm').games[0].status,'save-failed')
})

test('collector cleanup failure preserves genuinely saved early counts while reporting an incomplete run',async()=>{
  const h=await fixture({count:1,stream:async(book,inputs,callbacks)=>{
    if(book!=='betmgm')return{}
    await callbacks.onFirst(observation(book,inputs[0].id));throw new Error('private-cloud-cleanup-url')
  }}),result=await h.run()
  assert.equal(result.response.status,503);assert.equal(result.body.books.find((book:{book:string})=>book.book==='betmgm').saved,1)
  assert.equal(h.writeAttempts.filter(attempt=>attempt.book==='betmgm').length,1);assert.equal(JSON.stringify(result.body).includes('private-cloud-cleanup-url'),false)
})

test('streamed observations still reject post-tip writes and final disagreement cannot overwrite a saved contract',async()=>{
  const closed=await fixture({count:1,stream:async(book,inputs,callbacks,advance)=>{
    if(book!=='betmgm')return{}
    advance(Date.parse(game.datetime!)+1);const item=observation(book,inputs[0].id);await callbacks.onFirst(item);return{games:[item]}
  }});await closed.run();assert.equal(closed.writeAttempts.filter(attempt=>attempt.book==='betmgm').length,0)
  const conflict=await fixture({count:1,stream:async(book,inputs,callbacks)=>{
    if(book!=='betmgm')return{}
    const item=observation(book,inputs[0].id);await callbacks.onFirst(item)
    return{games:[{...item,props:[{...item.props[0],market:{type:'over_under',over_odds:600}}]}]}
  }}),result=await conflict.run()
  assert.equal(result.response.status,503);assert.equal(conflict.writeAttempts.filter(attempt=>attempt.book==='betmgm').length,1)
  assert.equal(conflict.saves.find(frame=>frame.book==='betmgm')!.props[0].market.over_odds,500)
})

test('adaptive MGM partitions cap at four, cover all inputs and expose capacity limits above16 without truncation',async()=>{
  for(const count of [1,4,8,15,16,17,30]){
    const h=await fixture({count}),result=await h.run()
    const mgm=h.collectorCalls.filter(call=>call.book==='betmgm'),dk=h.collectorCalls.filter(call=>call.book==='draftkings')
    assert.equal(result.response.status,200);assert.equal(mgm.length,Math.min(4,Math.ceil(count/4)));assert.equal(dk.length,1)
    const ids=mgm.flatMap(call=>call.gameIds)
    assert.equal(ids.length,count);assert.equal(new Set(ids).size,count);assert.deepEqual([...ids].sort((a,b)=>a-b),Array.from({length:count},(_,i)=>123+i))
    assert.ok(mgm.every(call=>call.gameIds.length<=Math.ceil(count/mgm.length)&&call.deadline===now+240_000))
    if(count<=16)assert.ok(mgm.every(call=>call.gameIds.length<=4))
    const receipt=result.body.books.find((book:{book:string})=>book.book==='betmgm')
    assert.equal(receipt.partitions,mgm.length);assert.equal(receipt.maxPartitionGames,Math.ceil(count/mgm.length));assert.equal(receipt.capacityLimited,count>16)
    assert.equal(h.saves.length,count*2);assert.equal(h.leaseCalls.filter(call=>call.key.includes(':betmgm:')).length,1)
  }
})

test('an over-capacity fallback reports any unvisited game deadline instead of treating a capped session count as full coverage',async()=>{
  const h=await fixture({count:17,capture:(book,inputs)=>book==='betmgm'?{complete:false,games:inputs.map((input,index)=>index<4?observation(book,input.id):{...observation(book,input.id),props:[],complete:false,status:'deadline'})}:{} }),result=await h.run()
  const receipt=result.body.books.find((book:{book:string})=>book.book==='betmgm')
  assert.equal(result.response.status,503);assert.equal(h.collectorCalls.filter(call=>call.book==='betmgm').length,4)
  assert.equal(receipt.checked,17);assert.equal(receipt.games.length,17);assert.equal(receipt.saved,16);assert.equal(receipt.failed,1);assert.equal(receipt.capacityLimited,true)
  assert.equal(receipt.games.filter((item:{status:string})=>item.status==='deadline').length,1)
})

test('four concurrent MGM partitions share one lease and cover all15 today/tomorrow games exactly once',async()=>{
  const slate=Array.from({length:15},(_,i)=>({...game,id:123+i,date:i<8?'2026-10-24':'2026-10-25',datetime:i<8?'2026-10-24T23:00:00Z':'2026-10-25T23:00:00Z'})).reverse()
  let entered=0,release:()=>void=()=>{}
  const gate=new Promise<void>(resolve=>{release=resolve})
  const h=await fixture({games:slate,stream:async(book)=>{
    if(book==='betmgm'){entered++;if(entered===4)release();await gate}
    return{}
  }}),result=await h.run()
  assert.equal(result.response.status,200);assert.equal(h.collectorCalls.filter(call=>call.book==='draftkings').length,1)
  const mgm=h.collectorCalls.filter(call=>call.book==='betmgm');assert.equal(mgm.length,4);assert.equal(entered,4)
  assert.deepEqual(mgm.map(call=>call.gameIds.filter(id=>id<131).length),[2,2,2,2]);assert.equal(mgm.flatMap(call=>call.gameIds).length,15);assert.equal(new Set(mgm.flatMap(call=>call.gameIds)).size,15)
  assert.ok(mgm.every(call=>call.deadline===now+240_000));assert.equal(h.leaseCalls.filter(call=>call.key.includes(':betmgm:')).length,1)
  assert.equal(h.saves.length,30);assert.equal(new Set(h.saves.map(frame=>`${frame.book}:${frame.gameId}`)).size,30)
})

test('one failed MGM partition waits all three healthy partitions and retains their completed early writes',async()=>{
  let healthyFinished=0
  const h=await fixture({count:15,stream:async(book,inputs,callbacks)=>{
    if(book!=='betmgm')return{}
    if(inputs[0].id===123)throw new Error('private-partition-cleanup')
    await new Promise(resolve=>setTimeout(resolve,15));const items=inputs.map(input=>observation(book,input.id))
    await Promise.all(items.map(callbacks.onFirst));healthyFinished++;return{games:items}
  }}),result=await h.run()
  assert.equal(result.response.status,503);assert.equal(healthyFinished,3);assert.equal(h.saves.filter(frame=>frame.book==='betmgm').length,11)
  assert.equal(result.body.books.find((book:{book:string})=>book.book==='betmgm').saved,11);assert.equal(JSON.stringify(result.body).includes('private-partition-cleanup'),false)
  assert.ok(h.counts().maxWrites<=4)
})

test('a partition cannot emit another partition game through callbacks or its final response',async()=>{
  const h=await fixture({count:8,stream:async(book,inputs,callbacks)=>{
    if(book!=='betmgm'||inputs[0].id!==123)return{}
    const foreign=observation(book,124);await callbacks.onFirst(foreign);return{games:[foreign]}
  }}),result=await h.run()
  assert.equal(result.response.status,503);assert.equal(h.writeAttempts.filter(attempt=>attempt.book==='betmgm'&&attempt.gameId===124).length,1)
  assert.equal(h.saves.filter(frame=>frame.book==='betmgm'&&frame.gameId===123).length,0)
})

test('queued callbacks check the save cutoff after acquiring a write slot and final replay never retries expired work',async()=>{
  let admitted=0,release:()=>void=()=>{}
  const gate=new Promise<void>(resolve=>{release=resolve})
  const h=await fixture({count:16,firstSave:async(frame,advance)=>{
    if(frame.book!=='betmgm')return
    admitted++;assert.ok(admitted<=4,'callbacks waiting for a slot must not enter storage after the cutoff')
    if(admitted===4){advance(now+260_001);release()}
    await gate
  },stream:async(book,inputs,callbacks)=>{
    if(book!=='betmgm')return{}
    const items=inputs.map(input=>observation(book,input.id))
    await Promise.all(items.map(callbacks.onFirst));return{games:items}
  }}),result=await h.run(),again=await h.run()
  const receipt=result.body.books.find((book:{book:string})=>book.book==='betmgm')
  assert.equal(result.response.status,503);assert.equal(again.response.status,503);assert.equal(admitted,4);assert.equal(h.counts().maxWrites,4)
  assert.equal(receipt.saved,4);assert.equal(receipt.games.filter((item:{status:string})=>item.status==='deadline').length,12)
  assert.equal(h.writeAttempts.filter(attempt=>attempt.book==='betmgm').length,4)
  assert.ok(h.saves.filter(frame=>frame.book==='betmgm').every(frame=>frame.observedAt===new Date(now).toISOString()&&frame.props[0].updated_at===new Date(now).toISOString()))
})

test('240-second browser deadline leaves regular read/write and 260-second save cutoffs inside the300-second route',async()=>{
  for(const at of [239_000,248_000,260_000]){
    const h=await fixture({count:1,stream:async(book,inputs,callbacks,advance)=>{
      if(book!=='betmgm')return{}
      const item=observation(book,inputs[0].id);await callbacks.onFirst(item);advance(now+at)
      const stamp=new Date(now+at).toISOString(),frames=[{gameId:item.gameId,contractKey:'points:milestone:30',market:'points',status:'captured' as const,complete:true,unmatched:0,observedAt:stamp,props:[{id:-5_000_000_000_434,game_id:item.gameId,player_id:434,vendor:'betmgm',prop_type:'points',line_value:'30',market:{type:'milestone' as const,odds:400},updated_at:stamp}]}]
      const coverage=[{gameId:item.gameId,market:'points',complete:true,observedAt:stamp,contracts:['points:milestone:30']}]
      await callbacks.onRegular(item.gameId,frames,coverage,stamp)
      return{games:[item],regular:frames,regularCoverage:coverage}
    }}),result=await h.run()
    assert.ok(h.deadlines.every(deadline=>deadline===now+240_000))
    assert.equal(h.regularSaves.length,at===239_000?1:0)
    const receipt=result.body.books.find((book:{book:string})=>book.book==='betmgm')
    assert.equal(receipt.regularGames[0].status,at===239_000?'captured':'deadline')
    assert.equal(h.writeAttempts.filter(attempt=>attempt.book==='betmgm').length,1)
  }
})
