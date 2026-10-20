import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import { nbaBuildMarketContext,nbaMarketSupport,nbaMarketSupportView,nbaMarketSupportIdentity,nbaPlayerMarketSignals, type NbaMarketContext } from '../src/lib/nbaMarketSignal.ts'
import { nbaSuccessfulMarketReceipt,nbaSuccessfulPublicReceipt } from '../src/lib/nbaMarketReceipts.ts'
import { nbaSlipSurgeScore,nbaContextualScore } from '../src/lib/nbaIntelligence.ts'
import { nbaSlateRows } from '../src/lib/nbaSlate.ts'
import { NBA_PUBLIC_VERSION,type NbaPublicCapture } from '../src/lib/nbaPublic.ts'
import type { NbaQuoteOpeningRow } from '../src/lib/nbaOddsHistory.ts'
import type { PaintBoard,PaintPlayer,PaintProp,PaintStat } from '../src/lib/nbaPaint.ts'

const current='2026-10-20T12:00:00Z',asOf='2026-10-20T12:10:00Z',tipAt='2026-10-20T13:00:00Z'
const target:PaintProp={id:1,game_id:123,player_id:434,vendor:'fanduel',prop_type:'points',line_value:'20.5',market:{type:'over_under',over_odds:130,under_odds:-150},updated_at:current}
const other:PaintProp={...target,id:2,prop_type:'assists',line_value:'5.5',market:{type:'over_under',over_odds:-150,under_odds:130}}
const opening=(quote:PaintProp,odds:number):NbaQuoteOpeningRow=>({game_id:quote.game_id,player_id:quote.player_id,vendor:quote.vendor,market:quote.prop_type,market_type:quote.market.type,line:Number(quote.line_value),side:'over',odds,observed_at:'2026-10-20T10:00:00Z'})
const publicCapture:NbaPublicCapture={normalizationVersion:NBA_PUBLIC_VERSION,gameId:123,capturedAt:'2026-10-20T11:59:00Z',sourceUrl:'https://app.pikkit.com/event/test',rows:[{playerId:434,market:'points',picks:20},{playerId:434,market:'assists',picks:80}],unmatched:0,markets:['points','assists']}
const input=()=>({gameId:123,asOf,tipAt,frame:{captured_at:current,props:[target,other]},openings:[opening(target,-120),opening(other,130)],publicCapture})
const support=(context:NbaMarketContext,offer=target,side:'over'|'under'='over')=>nbaMarketSupport({offer,side,context})

test('signal discovery finds another book and alternate line without changing exact-quote scoring support',()=>{
  const context=nbaBuildMarketContext(input())
  const best={...target,vendor:'draftkings',line_value:'21.5',market:{...target.market,over_odds:150}}
  const request={playerId:target.player_id,gameId:target.game_id,market:'points' as const,book:'all',side:'over' as const,props:[best,target,other],context}
  assert.equal(support(context,best).status,'none')
  assert.equal(support(context,best).adjustment,0)
  const found=nbaPlayerMarketSignals(request)
  assert.equal(found.status,'confirmed')
  assert.equal(found.signal?.book,'fanduel')
  assert.equal(found.signal?.target.line,20.5)
  assert.equal(nbaPlayerMarketSignals({...request,book:'draftkings'}).status,'none')
  assert.equal(nbaPlayerMarketSignals({...request,market:'rebounds'}).reason,'No market quote available')
  assert.equal(support(context,best).adjustment,0,'discovery never modifies the selected quote or score')
})

test('signal discovery verifies both exact quotes and retains side, game, identity and freshness guards',()=>{
  const request={playerId:target.player_id,gameId:target.game_id,market:'points' as const,book:'all',side:'over' as const,props:[target,other],context:nbaBuildMarketContext(input())}
  for(const props of [[target],[{...target,market:{...target.market,over_odds:140}},other],[target,{...other,market:{...other.market,over_odds:-160}}],[target,{...other,game_id:999}],[target,{...other,player_id:999}],[target,other,{...other,market:{...other.market,over_odds:-160}}]]){
    const result=nbaPlayerMarketSignals({...request,props})
    assert.equal(result.status,'quote_changed')
    assert.equal(result.signal,null)
    assert.equal(result.adjustment,0)
  }
  assert.equal(nbaPlayerMarketSignals({...request,side:'under'}).status,'under_unsupported')
  assert.equal(nbaPlayerMarketSignals({...request,context:null}).status,'unavailable')
  assert.equal(nbaPlayerMarketSignals({...request,gameId:999}).reason,'No market quote available')
  assert.equal(nbaPlayerMarketSignals({...request,asOf:'2026-10-20T12:15:00.001Z'}).status,'stale')
  const view=nbaMarketSupportView(nbaPlayerMarketSignals(request))
  for(const field of ['adjustment','attenuation','supportingMarkets','opposingPicks'])assert.ok(!(field in view)&&!(field in view.signal!))
})

test('lengthening target plus shortening related same-book market adds bounded category-supported context',()=>{
  const context=nbaBuildMarketContext(input()),result=support(context)
  assert.equal(context.available,true)
  assert.equal(result.status,'confirmed')
  assert.ok(result.adjustment>0&&result.adjustment<=8)
  assert.equal(result.signal?.target.open,-120)
  assert.equal(result.signal?.target.now,130)
  assert.ok(result.signal!.target.changePp<0)
  assert.ok(result.signal!.related.changePp>0)
  assert.equal(result.signal?.targetPicks,20)
  assert.equal(result.signal?.relatedPicks,80)
  assert.equal(support(context,target,'under').adjustment,0)
  assert.equal(support(context,target,'under').status,'under_unsupported')
})

test('exact game/player/book/type/threshold/side opens and current selected price are mandatory',()=>{
  const base=input()
  for(const changed of [{game_id:999},{player_id:999},{vendor:'draftkings'},{market:'points_1q'},{market_type:'milestone'},{line:21.5},{side:'under' as const}]){
    assert.equal(support(nbaBuildMarketContext({...base,openings:[{...base.openings[0],...changed},base.openings[1]]})).adjustment,0)
  }
  for(const changed of [{game_id:999},{player_id:999},{vendor:'draftkings'},{prop_type:'points_1q'},{line_value:'21.5'},{market:{type:'milestone' as const,odds:130}},{market:{...target.market,over_odds:140}}]){
    assert.equal(support(nbaBuildMarketContext(base),{...target,...changed}).adjustment,0)
  }
  assert.equal(support(nbaBuildMarketContext({...base,frame:{...base.frame,props:[target,{...other,vendor:'draftkings'}]}})).adjustment,0)
  assert.equal(support(nbaBuildMarketContext({...base,frame:{...base.frame,props:[target,{...target,market:{...target.market,over_odds:140}},other]}})).adjustment,0,'conflicting duplicate exact quotes are excluded')
})

test('no future or stale capture, opening, public observation, or current cutoff can boost',()=>{
  const base=input()
  for(const date of ['2026-10-20T12:10:01Z','bad'])assert.equal(support(nbaBuildMarketContext({...base,frame:{...base.frame,captured_at:date}})).adjustment,0)
  for(const date of [current,'2026-10-21T10:00:00Z'])assert.equal(support(nbaBuildMarketContext({...base,openings:base.openings.map(row=>({...row,observed_at:date}))})).adjustment,0)
  for(const date of ['2026-10-20T12:01:00Z','2026-10-20T09:00:00Z'])assert.equal(support(nbaBuildMarketContext({...base,publicCapture:{...publicCapture,capturedAt:date}})).adjustment,0)
  const context=nbaBuildMarketContext(base)
  for(const date of ['2026-10-20T12:09:59Z','2026-10-20T12:15:00.001Z',tipAt,'bad'])assert.equal(nbaMarketSupport({offer:target,side:'over',context,asOf:date}).adjustment,0)
  assert.equal(support({...context,marketObservedAt:null}).adjustment,0)
  assert.equal(support({...context,publicObservedAt:'bad'}).adjustment,0)
  assert.equal(support(nbaBuildMarketContext({...base,asOf:tipAt})).adjustment,0)
})

test('missing, conflicting, wrong-game/version, and insufficient counts never add support',()=>{
  const base=input()
  for(const capture of [null,{...publicCapture,gameId:999},{...publicCapture,normalizationVersion:'old'},{...publicCapture,rows:publicCapture.rows.slice(1)},{...publicCapture,rows:publicCapture.rows.map(row=>({...row,picks:5}))},{...publicCapture,rows:[...publicCapture.rows,{playerId:434,market:'points' as const,picks:22}]}])assert.equal(support(nbaBuildMarketContext({...base,publicCapture:capture})).adjustment,0)
})

test('bounded monotonic support cannot stack correlated categories; conflicting heavier markets attenuate',()=>{
  const base=input(),small=support(nbaBuildMarketContext({...base,publicCapture:{...publicCapture,rows:[{playerId:434,market:'points',picks:5},{playerId:434,market:'assists',picks:15}]}})).adjustment
  const normal=support(nbaBuildMarketContext(base)).adjustment
  const large=support(nbaBuildMarketContext({...base,publicCapture:{...publicCapture,rows:[{playerId:434,market:'points',picks:5},{playerId:434,market:'assists',picks:10000}]}})).adjustment
  assert.ok(small>0&&small<normal&&normal<large&&large<=8)
  const rebound={...other,id:3,prop_type:'rebounds',line_value:'7.5'}
  const extra={...base,frame:{...base.frame,props:[...base.frame.props,rebound]},openings:[...base.openings,opening(rebound,130)],publicCapture:{...publicCapture,rows:[...publicCapture.rows,{playerId:434,market:'rebounds' as const,picks:80}]}}
  assert.equal(support(nbaBuildMarketContext(extra)).adjustment,normal)
  const opposed={...extra,frame:{...extra.frame,props:[target,other,{...rebound,market:target.market}]},openings:[...base.openings,opening(rebound,-120)]}
  const reduced=support(nbaBuildMarketContext(opposed)).adjustment
  assert.ok(reduced>0&&reduced<normal)
  const combo={...other,id:4,prop_type:'points_assists',line_value:'26.5'}
  assert.equal(support(nbaBuildMarketContext({...opposed,frame:{...opposed.frame,props:[...opposed.frame.props,combo]},openings:[...opposed.openings,opening(combo,130)],publicCapture:{...opposed.publicCapture,rows:[...opposed.publicCapture.rows,{playerId:434,market:'points_assists',picks:80}]}})).adjustment,reduced,'another correlated supporting category cannot stack even against contradictory evidence')
})

test('unsupported defensive pairs and cross-period comparisons cannot support a score; Q1 pairs can',()=>{
  for(const market of ['steals','blocks','turnovers','points_1q'] as const){
    const quote={...target,prop_type:market},base=input()
    assert.equal(support(nbaBuildMarketContext({...base,frame:{...base.frame,props:[quote,other]},openings:[opening(quote,-120),opening(other,130)],publicCapture:{...publicCapture,rows:[{playerId:434,market,picks:20},publicCapture.rows[1]]}}),quote).adjustment,0)
  }
  const quote={...target,prop_type:'points_1q'},relation={...other,prop_type:'assists_1q'},base=input()
  assert.ok(support(nbaBuildMarketContext({...base,frame:{...base.frame,props:[quote,relation]},openings:[opening(quote,-120),opening(relation,130)],publicCapture:{...publicCapture,rows:[{playerId:434,market:'points_1q',picks:20},{playerId:434,market:'assists_1q',picks:80}]}}),quote).adjustment>0)
})

test('only fingerprint-bound successful player receipts can freshen unchanged economics',()=>{
  const row={key:'market-attempt:v3:123',fetched_at:asOf,payload:{status:'unchanged',playerFingerprint:'prices',playerObservedAt:asOf}}
  assert.equal(nbaSuccessfulMarketReceipt(row,123,'prices'),asOf)
  for(const payload of ['captured',{status:'captured'},{...row.payload,status:'failed'},{...row.payload,status:'deferred'},{...row.payload,playerFingerprint:'other'},{...row.payload,playerObservedAt:'2026-10-20T12:11:00Z'}])assert.equal(nbaSuccessfulMarketReceipt({...row,payload},123,'prices'),null)
  assert.equal(nbaSuccessfulMarketReceipt({...row,key:'market-attempt:v2:123'},123,'prices'),null)
  assert.equal(nbaSuccessfulMarketReceipt(row,124,'prices'),null)
  const publicRow={key:`public-success:${NBA_PUBLIC_VERSION}:123`,fetched_at:asOf,payload:{changed:false,players:1,markets:2,fingerprint:'counts',observedAt:current}}
  assert.equal(nbaSuccessfulPublicReceipt(publicRow,123,'counts'),current)
  assert.equal(nbaSuccessfulPublicReceipt(publicRow,123,'other'),null)
  assert.equal(nbaSuccessfulPublicReceipt({...publicRow,payload:{changed:false,players:1,markets:2}},123,'counts'),null)
  const old={...input(),frame:{captured_at:'2026-10-20T11:00:00Z',props:[target,other]},openings:[opening(target,-120),opening(other,130)]}
  assert.equal(support(nbaBuildMarketContext(old)).adjustment,0)
  assert.ok(support(nbaBuildMarketContext({...old,marketVerifiedAt:nbaSuccessfulMarketReceipt(row,123,'prices')})).adjustment>0)
  assert.equal(support(nbaBuildMarketContext({...old,marketVerifiedAt:nbaSuccessfulMarketReceipt({...row,payload:{status:'captured'}},123,'prices')})).adjustment,0,'successful game-only archive must not freshen old player prices')
})

const logs:PaintStat[]=Array.from({length:20},(_,i)=>({id:i+1,player:{id:434},team:{id:2},game:{id:i+1,date:`2026-04-${String(i+1).padStart(2,'0')}`,status:'Final',status_state:'final',home_team_id:2,visitor_team_id:9,season:2025},min:'32:00',pts:22,reb:7,ast:6,fg3m:3,stl:1,blk:1,turnover:2,fga:18,fgm:8,fg3a:7,fta:4,ftm:3}))
const player:PaintPlayer={id:434,first_name:'Test',last_name:'Player',position:'G',team:{id:2,abbreviation:'BOS',full_name:'Boston Celtics',name:'Celtics'},headshot:null,injury:null,average:{pts:22},logs,props:[target,other]}
const board:PaintBoard={game:{id:123,date:'2026-10-20',season:2026,status:'Scheduled',status_state:'scheduled',datetime:tipAt,period:0,home_team:player.team,visitor_team:{...player.team,id:9},home_team_score:0,visitor_team_score:0},players:[player],sampleSeason:2025,historical:false,sampleEnd:'2026-04-20',fetchedAt:asOf,issues:[],statsComplete:true}

test('board, slate and snapshot use one score and retain production floor, sample requirements and date boundary',()=>{
  const context=nbaBuildMarketContext(input()),base=nbaSlipSurgeScore(player,'points',board.game.date),enhanced=nbaSlipSurgeScore(player,'points',board.game.date,undefined,null,{offer:target,side:'over',context})
  assert.equal(enhanced.baseScore,base.score)
  assert.ok(enhanced.score!>base.score!)
  const slate=nbaSlateRows([board],'points','fanduel','over',true,[],[],[context])[0]
  assert.equal(slate.score,enhanced.score)
  assert.deepEqual(slate.marketSupport,enhanced.marketSupport)
  assert.equal(nbaContextualScore(slate.baseScore,434,'points',board.game.date,{offer:slate.offer,side:'over',context}).score,slate.score)
  assert.equal(nbaSlipSurgeScore({...player,logs:logs.slice(0,4)},'points',board.game.date,undefined,null,{offer:target,side:'over',context}).score,null)
  assert.equal(nbaSlipSurgeScore(player,'points','2026-10-21',undefined,null,{offer:target,side:'over',context}).marketSupport.adjustment,0)
  assert.equal(nbaSlateRows([board],'points','fanduel','under',true,[],[],[context])[0].score,base.score)
})

test('customer-facing evidence omits formula, weights, adjustment and internal contradiction counts',()=>{
  const view=nbaMarketSupportView(support(nbaBuildMarketContext(input())))
  assert.ok(view.signal)
  for(const field of ['adjustment','attenuation','opposingPicks','supportingMarkets','version','weights','baseScore']){
    assert.ok(!(field in view))
    assert.ok(!(field in view.signal!))
  }
  assert.equal(view.signal?.target.now,130)
})

test('unchanged successful polling times do not generate new research archive identities',()=>{
  const original=support(nbaBuildMarketContext(input()))
  const verified={...original,marketObservedAt:'2026-10-20T12:12:00Z',publicObservedAt:'2026-10-20T12:11:00Z'}
  assert.deepEqual(nbaMarketSupportIdentity(original),nbaMarketSupportIdentity(verified))
  assert.notDeepEqual(nbaMarketSupportIdentity(original),nbaMarketSupportIdentity({...original,marketCapturedAt:'2026-10-20T12:01:00Z'}))
  assert.notDeepEqual(nbaMarketSupportIdentity(original),nbaMarketSupportIdentity({...original,signal:{...original.signal!,relatedPicks:81}}))
  assert.notDeepEqual(nbaMarketSupportIdentity(original),nbaMarketSupportIdentity({...original,status:'stale',adjustment:0,signal:null}))
})

async function compiled(path:string,imports:Record<string,unknown>,clock:DateConstructor=Date){
  const source=await readFile(new URL(path,import.meta.url),'utf8')
  const {outputText}=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}})
  const target={exports:{} as Record<string,unknown>}
  new Function('require','exports','module','Date',outputText)((name:string)=>{assert.ok(name in imports,name);return imports[name]},target.exports,target,clock)
  return target.exports
}

test('warm game cache rechecks request time; historical boards freeze before tip with bounded batched reads',async()=>{
  let saved:NbaMarketContext|null=null,reads=0
  const cutoffs:string[]=[]
  const admin={from:(table:string)=>{
    reads++
    const data=table==='nba_market_captures'?[{...input().frame,fingerprint:'prices'}]:table==='nba_public_captures'?[{snapshot:publicCapture,fingerprint:'counts'}]:[]
    const query={select:()=>query,eq:()=>query,in:()=>query,lte:(_key:string,value:string)=>{cutoffs.push(value);return query},order:()=>query,limit:()=>query,abortSignal:()=>Promise.resolve({data,error:null})}
    return query
  }}
  const contextModule=await compiled('../src/lib/nbaMarketSignalData.ts',{'server-only':{},'./supabase/admin':{createAdminClient:()=>admin},'./nbaSharedCache':{nbaSharedCache:async(_key:string,_ttl:number,_stale:number,load:()=>Promise<NbaMarketContext>)=>({value:saved??(saved=await load())})},'./nbaOddsHistoryData':{getNbaQuoteOpenings:async()=>input().openings},'./nbaPublic':{NBA_PUBLIC_VERSION},'./nbaMarketSignal':{nbaBuildMarketContext,nbaEmptyMarketContext:(await import('../src/lib/nbaMarketSignal.ts')).nbaEmptyMarketContext},'./nbaMarketReceipts':{nbaSuccessfulMarketReceipt,nbaSuccessfulPublicReceipt}})
  const get=contextModule.getNbaMarketContext as typeof import('../src/lib/nbaMarketSignalData.ts').getNbaMarketContext
  assert.ok(support(await get(board.game,asOf)).adjustment>0)
  assert.equal(reads,3,'one capture batch, one receipt batch, one public batch per game')
  const later=await get(board.game,'2026-10-20T12:15:00.001Z')
  assert.equal(later.asOf,'2026-10-20T12:15:00.001Z')
  assert.equal(support(later).adjustment,0)
  assert.equal(reads,3)
  assert.equal((await get(board.game,'2026-10-20T12:05:00Z')).available,false,'newer cached context cannot leak into earlier replay')
  saved=null
  const historical=await get(board.game,'2026-10-21T12:00:00Z')
  assert.equal(historical.asOf,'2026-10-20T12:59:59.999Z')
  assert.ok(cutoffs.includes(historical.asOf))
  assert.equal(support(historical).adjustment,0)
})

test('Score and Slate APIs return identical exact-quote scores; a warm slate cannot retain an expired boost',async()=>{
  const paint=await import('../src/lib/nbaPaint.ts'),intelligence=await import('../src/lib/nbaIntelligence.ts'),metrics=await import('../src/lib/nbaMarketMetrics.ts')
  type Reply={body:Record<string,unknown>;status:number}
  const response={NextResponse:{json:(body:Record<string,unknown>,init?:{status?:number}):Reply=>({body,status:init?.status??200})}}
  const defense={ready:false,season:2025,profiles:[],games:0,fetchedAt:null,stale:false}
  let now=asOf,boardReads=0,contextReads=0,defenseFailed=false
  const gameData={getPaintGame:async()=>board.game,getPaintBoard:async()=>{boardReads++;return board},getPaintSchedule:async()=>({date:board.game.date,games:[board.game],complete:true})}
  const common={'@/lib/nbaMarketSelection':await import('../src/lib/nbaMarketSelection.ts'),'next/server':response,'@/lib/paintAccess':{requirePaintAccess:async()=>({error:null})},'@/lib/nbaPaintData':gameData,'@/lib/nbaIntelligenceData':{getNbaDefenseContext:async()=>{if(defenseFailed)throw new Error('Defense unavailable');return defense}},'@/lib/nbaMarketSignalData':{getNbaMarketContext:async()=>{contextReads++;return {...nbaBuildMarketContext(input()),asOf:now}}},'@/lib/nbaMarketSignal':{nbaMarketSupportView,nbaPlayerMarketSignals},'@/lib/nbaIntelligence':intelligence,'@/lib/nbaPaint':paint,'@/lib/nbaMarketMetrics':metrics}
  const scoreRoute=await compiled('../src/app/the-paint/intelligence/route.ts',common)
  const cached=new Map<string,unknown>()
  const reportsQuery={eq:()=>reportsQuery,order:()=>reportsQuery,limit:async()=>({data:[],error:null})}
  const slateRoute=await compiled('../src/app/the-paint/slate/route.ts',{...common,'@/lib/nbaSharedCache':{nbaSharedCache:async(key:string,_ttl:number,_stale:number,load:()=>Promise<unknown>)=>{if(!cached.has(key))cached.set(key,await load());return{value:cached.get(key),fetchedAt:asOf,stale:false}}},'@/lib/supabase/admin':{createAdminClient:()=>({from:()=>({select:()=>reportsQuery})})},'@/lib/nbaSlate':{nbaSlateRows}})
  const scoreRequest={nextUrl:new URL('https://example.test/the-paint/intelligence?game=123&market=points&book=fanduel&side=over')}
  const slateRequest={nextUrl:new URL('https://example.test/the-paint/slate?date=2026-10-20&market=points&book=fanduel&side=over')}
  const scoreGet=scoreRoute.GET as (request:unknown)=>Promise<Reply>,slateGet=slateRoute.GET as (request:unknown)=>Promise<Reply>
  const scoreReply=await scoreGet(scoreRequest),slateReply=await slateGet(slateRequest)
  assert.equal(scoreReply.status,200);assert.equal(slateReply.status,200)
  const scores=scoreReply.body.scores as {score:number;offer:PaintProp;marketSupport:unknown}[],rows=slateReply.body.rows as typeof scores
  assert.equal(rows[0].score,scores[0].score)
  assert.deepEqual(rows[0].offer,scores[0].offer)
  assert.deepEqual(rows[0].marketSupport,scores[0].marketSupport)
  for(const row of [scores[0],rows[0]])for(const field of ['baseScore','parts','version','weights','coverage','modelError','modelMetric','signalOffers'])assert.ok(!(field in row))
  now='2026-10-20T12:15:00.001Z'
  const expired=await slateGet(slateRequest),expiredRows=expired.body.rows as typeof scores
  assert.equal(expiredRows[0].score,nbaSlipSurgeScore(player,'points',board.game.date).baseScore)
  assert.ok(expiredRows[0].score<rows[0].score)
  assert.equal(boardReads,2,'Score reads once, warm Slate reuses production board research')
  assert.equal(contextReads,3,'each API response rechecks context freshness')
  const bad=await scoreGet({nextUrl:new URL('https://example.test/the-paint/intelligence?game=123&market=invalid')})
  assert.equal(bad.status,400)
  assert.equal(contextReads,3)
  defenseFailed=true
  const unavailable=await scoreGet(scoreRequest),fallbackScores=unavailable.body.scores as typeof scores
  assert.equal(unavailable.status,200)
  assert.equal(unavailable.body.ready,false)
  assert.deepEqual(unavailable.body.profiles,[])
  assert.equal(fallbackScores[0].score,expiredRows[0].score,'defense errors preserve the same production base as Slate')
})

test('market cron empty player feeds record withdrawals without verifying older prices; real player success binds economics',async()=>{
  const paint=await import('../src/lib/nbaPaint.ts'),movement=await import('../src/lib/nbaMovement.ts'),history=await import('../src/lib/nbaOddsHistory.ts')
  let props:PaintProp[]=[],receipt:unknown=null
  const rpcCalls:string[]=[]
  const game={...board.game,date:'2099-10-20',datetime:'2099-10-20T13:00:00Z'}
  // A near-future game relative to the test's actual wall clock is required by
  // the real cron's 48-hour schedule boundary.
  game.datetime=new Date(Date.now()+3600000).toISOString()
  const admin={from:()=>({select:()=>({in:async()=>({data:[],error:null})})}),rpc:(name:string)=>{rpcCalls.push(name);return{abortSignal:async()=>({data:true,error:null})}}}
  const route=await compiled('../src/app/api/cron/nba-market-capture/route.ts',{'node:crypto':await import('node:crypto'),'next/server':{NextResponse:{json:(body:unknown,options?:{status?:number})=>({body,status:options?.status??200})}},'@/lib/cron-auth':{requireCronAuth:()=>null},'@/lib/pipelineHealth':{withPipelineHealth:(_name:string,run:unknown)=>run},'@/lib/supabase/admin':{createAdminClient:()=>admin},'@/lib/nbaPaintData':{getPaintSchedule:async()=>({games:[game]}),getPaintProps:async()=>props,getPaintGameOdds:async()=>[{id:1,game_id:123,vendor:'fanduel',spread_home_value:'-4.5',spread_away_value:'4.5',moneyline_home_odds:-150,moneyline_away_odds:130,total_value:'220.5',updated_at:current}]},'@/lib/nbaMovement':movement,'@/lib/nbaOddsHistory':history,'@/lib/nbaPaint':paint,'@/lib/nbaFirstBasketOddsData':{getNbaFirstEvents:async()=>[],getNbaFirstOdds:async()=>({rows:[],eventMatched:false,unmatched:0})},'@/lib/nbaSharedCache':{nbaSharedCache:async(key:string,_ttl:number,_stale:number,load:()=>Promise<unknown>)=>{if(key==='first-basket-attempt:v1:123')return{value:await load()};assert.equal(key,'market-attempt:v3:123');receipt=await load();return{value:receipt}}}})
  const get=route.GET as (request:Request)=>Promise<{body:{captured:number};status:number}>
  const gameOnly=await get(new Request('https://example.test/api/cron/nba-market-capture'))
  assert.equal(gameOnly.status,200);assert.equal(gameOnly.body.captured,1)
  const emptyReceipt=receipt as {status:string;playerFingerprint:string;playerObservedAt:string}
  assert.equal(emptyReceipt.status,'captured')
  assert.equal(emptyReceipt.playerFingerprint,(await import('node:crypto')).createHash('sha256').update(JSON.stringify(movement.nbaEconomicSnapshot([]))).digest('hex'))
  assert.deepEqual(rpcCalls,['record_nba_market_capture','record_nba_game_market_capture'])
  assert.equal(nbaSuccessfulMarketReceipt({key:'market-attempt:v3:123',payload:receipt,fetched_at:new Date().toISOString()},123,'old-prices'),null)
  props=[target,other];rpcCalls.length=0
  await get(new Request('https://example.test/api/cron/nba-market-capture'))
  const saved=receipt as {status:string;playerFingerprint:string;playerObservedAt:string}
  assert.equal(saved.status,'captured');assert.match(saved.playerFingerprint,/^[a-f0-9]{64}$/)
  assert.ok(Date.parse(saved.playerObservedAt)<=Date.now())
  assert.equal(nbaSuccessfulMarketReceipt({key:'market-attempt:v3:123',payload:saved,fetched_at:new Date().toISOString()},123,saved.playerFingerprint),saved.playerObservedAt)
  assert.deepEqual(rpcCalls,['record_nba_market_capture','record_nba_game_market_capture'])
})

test('research snapshot stores verification provenance but deduplicates unchanged successful polls',async()=>{
  const paint=await import('../src/lib/nbaPaint.ts'),intelligence=await import('../src/lib/nbaIntelligence.ts'),model=await import('../src/lib/nbaModel.ts'),movement=await import('../src/lib/nbaMovement.ts')
  let context=nbaBuildMarketContext(input())
  class SnapshotClock extends Date {static now(){return Date.parse(asOf)}}
  const batches:{market:string;fingerprint:string;features:{signal:{marketSupport:{marketObservedAt:string}}}}[][]=[]
  const query={eq:()=>query,order:()=>query,limit:async()=>({data:[],error:null}),in:async()=>({data:[],error:null})}
  const admin={from:()=>({select:()=>query,update:()=>query}),rpc:async(name:string,args?:{p_rows:typeof batches[number]})=>{
    if(name==='record_nba_research_batch')batches.push(args!.p_rows)
    return {data:name==='claim_nba_source'?true:0,error:null}
  }}
  const route=await compiled('../src/app/api/cron/nba-research-snapshot/route.ts',{'node:crypto':await import('node:crypto'),'next/server':{NextResponse:{json:(body:unknown,options?:{status?:number})=>({body,status:options?.status??200})}},'@/lib/cron-auth':{requireCronAuth:()=>null},'@/lib/pipelineHealth':{withPipelineHealth:(_name:string,run:unknown)=>run},'@/lib/supabase/admin':{createAdminClient:()=>admin},'@/lib/nbaPaintData':{getPaintSchedule:async()=>({games:[board.game]}),getPaintBoard:async()=>board},'@/lib/nbaIntelligenceData':{getNbaDefenseContext:async()=>({ready:false,profiles:[]})},'@/lib/nbaMarketSignalData':{getNbaMarketContext:async()=>context},'@/lib/nbaMarketSignal':{nbaMarketSupportIdentity},'@/lib/nbaResearchIdentity':{ensureNbaResearchPlayers:async()=>{}},'@/lib/nbaIntelligence':intelligence,'@/lib/nbaModel':model,'@/lib/nbaMovement':movement,'@/lib/nbaSharedCache':{nbaSharedCache:async(_key:string,_ttl:number,_stale:number,load:()=>Promise<unknown>)=>({value:await load()})},'@/lib/nbaPaint':paint},SnapshotClock as unknown as DateConstructor)
  const get=route.GET as (request:Request)=>Promise<{status:number}>
  assert.equal((await get(new Request('https://example.test/api/cron/nba-research-snapshot'))).status,200)
  context={...context,asOf:'2026-10-20T12:12:00Z',marketObservedAt:'2026-10-20T12:12:00Z',publicObservedAt:'2026-10-20T12:11:00Z'}
  assert.equal((await get(new Request('https://example.test/api/cron/nba-research-snapshot'))).status,200)
  const first=batches[0].find(row=>row.market==='points')!,second=batches[1].find(row=>row.market==='points')!
  assert.ok(first&&second)
  assert.equal(first.fingerprint,second.fingerprint)
  assert.equal(first.features.signal.marketSupport.marketObservedAt,current)
  assert.equal(second.features.signal.marketSupport.marketObservedAt,'2026-10-20T12:12:00Z')
})
