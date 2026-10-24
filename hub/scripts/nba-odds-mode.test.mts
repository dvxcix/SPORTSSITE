import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import * as crypto from 'node:crypto'
import ts from 'typescript'
import * as mode from '../src/lib/nbaOddsMode.ts'
import * as paint from '../src/lib/nbaPaint.ts'
import * as primaryProps from '../src/lib/nbaPrimaryProps.ts'
import { nbaAttachOpenings } from '../src/lib/nbaOddsHistory.ts'

const tip = Date.parse('2026-10-20T23:00:00Z')
const game = { id: 123, datetime: new Date(tip).toISOString(), status: 'Scheduled', status_state: 'scheduled', period: 0 } as paint.PaintGame
const quote = (odds:number, at:number):paint.PaintProp => ({ id:1,game_id:123,player_id:434,vendor:'fanduel',prop_type:'points',line_value:'20',market:{type:'milestone',odds},updated_at:new Date(at).toISOString() })
async function harness(initialTime:number, current:paint.PaintProp[], frozen= [quote(1000,tip-60000)], firstBasket:paint.PaintProp[]=[]) {
  let now=initialTime, fetches=0, snapshots=0, crossBoundary=false
  class Clock extends Date { constructor(value:string|number=now){super(value)} static now(){return now} }
  const source=await readFile(new URL('../src/lib/nbaPaintData.ts',import.meta.url),'utf8')
  const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
  const keys:string[]=[], cached=new Map<string,unknown>()
  const imports:Record<string,unknown>={
    'server-only':{},'node:crypto':crypto,'@/lib/balldontlie':{bdlHeaders:{}},'./nbaPaint':paint,'./nbaOddsHistory':{nbaAttachOpenings},
    './nbaOddsClockData':{getNbaOddsGame:async(g:paint.PaintGame)=>({...g,datetime:game.datetime})},
    './nbaOddsMode':{...mode,nbaPregameOpen:(g:paint.PaintGame)=>mode.nbaPregameOpen(g,now),nbaLiveOpen:(g:paint.PaintGame)=>mode.nbaLiveOpen(g,now)},
    './nbaPrimaryProps': primaryProps, './nbaSupplementalProps': { nbaSupplementalQuote: (quote: { id: number }) => quote.id <= -1_000_000_000_000, getNbaSupplementalProps: async () => ({ props: [], complete: true, accepted: 0, unmatched: 0, stale: 0, eventMatched: true, applicable: true, observedAt: new Date().toISOString(), quota: null }), nbaMergePropSources: (primary: paint.PaintProp[], supplemental: paint.PaintProp[]) => [...primary, ...supplemental] },
    './nbaOddsHistoryData':{getNbaQuoteOpenings:async(_id:number,phase:string)=>[{game_id:123,player_id:434,vendor:'fanduel',market:'points',market_type:'milestone',line:20,side:'over',odds:phase==='pregame'?1200:-500,observed_at:new Date(phase==='pregame'?tip-120000:tip+1000).toISOString()}]},
    './nbaFirstBasketOddsData':{getNbaFirstOddsForMode:async()=>({rows:firstBasket.map(offer=>({offer}))})},
    './nbaOddsPhaseData':{getNbaPhaseSnapshot:async()=>{snapshots++;return {props:frozen,gameOdds:[],firstBasket:[],capturedAt:{props:new Date(tip-60000).toISOString(),gameOdds:null,firstBasket:null}}}},
    './nbaSharedCache':{nbaSharedCache:async(key:string,_ttl:number,_stale:number,load:()=>Promise<unknown>)=>{keys.push(key);if(!cached.has(key))cached.set(key,await load());return {value:cached.get(key)}}},
  }
  const target={exports:{}}
  const fetch=async(url:string)=>{fetches++;if(crossBoundary)now=tip+10;return Response.json({data:url.includes('player_props')?current:[]})}
  new Function('require','module','exports','Date','fetch',output)((name:string)=>{assert.ok(name in imports,name);return imports[name]},target,target.exports,Clock,fetch)
  return {api:target.exports as typeof import('../src/lib/nbaPaintData.ts'),keys,advance:(time:number)=>{now=time},cross:()=>{crossBoundary=true},counts:()=>({fetches,snapshots})}
}

test('Pregame is default and game clocks fail closed at tipoff, early starts and unknown starts',()=>{
  assert.equal(mode.nbaOddsMode(undefined),'pregame');assert.equal(mode.nbaOddsMode('LIVE'),'pregame');assert.equal(mode.nbaOddsMode('live'),'live')
  assert.equal(mode.nbaPregameOpen(game,tip-1),true);assert.equal(mode.nbaPregameOpen(game,tip),false)
  assert.equal(mode.nbaPregameOpen({...game,period:1},tip-1),false)
  assert.equal(mode.nbaPregameOpen({...game,datetime:null},tip-1),false)
  assert.equal(mode.nbaLiveOpen(game,tip+1),false,'elapsed scheduled time does not prove live play')
  assert.equal(mode.nbaLiveOpen({...game,period:1},tip+1),true)
  assert.equal(mode.nbaLiveOpen({...game,period:4,status:'Final'},tip+1),false)
})
test('one exact milestone cannot use pregame prices in Live or live prices in Pregame',()=>{
  assert.equal(mode.nbaQuoteInMode(quote(1000,tip-1),game,'pregame',tip+1000),true)
  assert.equal(mode.nbaQuoteInMode(quote(1000,tip-1),game,'live',tip+1000),false)
  assert.equal(mode.nbaQuoteInMode(quote(-600,tip+1),game,'pregame',tip+1000),false)
  assert.equal(mode.nbaQuoteInMode(quote(-600,tip+1),game,'live',tip+1000),true)
  assert.equal(mode.nbaQuoteInMode(quote(-600,tip+1001),game,'live',tip+1000),false)
})
test('after tipoff Pregame stays +1000 and keeps its pregame opening while Live is -600 with a separate opening',async()=>{
  const h=await harness(tip+60000,[quote(-600,tip+30000),{...quote(-200,tip-1000),player_id:99}])
  const board={game:{...game,status_state:'in_progress',period:2},players:[{id:434,props:[]}],issues:[]} as unknown as paint.PaintBoard
  const pre=await h.api.refreshPaintBoardPrices(board,'pregame')
  assert.equal(pre.players[0].props[0].market.odds,1000);assert.equal(pre.players[0].props[0].opening?.over?.odds,1200)
  assert.equal(h.counts().fetches,0,'frozen pregame must never fetch current provider prices')
  const live=await h.api.refreshPaintBoardPrices(board,'live')
  assert.equal(live.players[0].props[0].market.odds,-600);assert.equal(live.players[0].props[0].opening?.over?.odds,-500)
  assert.equal(live.oddsMode,'live');assert.equal(pre.oddsMode,'pregame')
  assert.equal((await h.api.getPaintPrices(board.game,'live')).props.length,1,'unchanged pregame quotes are excluded')
})
test('a provider response crossing tipoff returns the stored close, never its new live price',async()=>{
  const h=await harness(tip-10,[quote(-600,tip+1)]);h.cross()
  assert.equal((await h.api.getPaintPrices(game,'pregame')).props[0].market.odds,1000)
  assert.equal(h.counts().snapshots,1)
})
test('an unexpired pregame cache freezes after tipoff and phase caches never collide',async()=>{
  const h=await harness(tip-1000,[quote(1100,tip-2000)])
  assert.equal((await h.api.getPaintPrices(game,'pregame')).props[0].market.odds,1100)
  h.advance(tip+1000)
  assert.equal((await h.api.getPaintPrices(game,'pregame')).props[0].market.odds,1000)
  const live=await h.api.getPaintPrices({...game,status_state:'in_progress',period:1},'live')
  assert.deepEqual(live.props,[])
  assert.ok(h.keys.some(key=>key.includes(':pregame:')));assert.ok(h.keys.some(key=>key.includes(':live:')))
})
test('missing or withdrawn frozen prices remain empty and scheduled games have no live prices',async()=>{
  const h=await harness(tip+1000,[quote(-600,tip+1)],[])
  assert.deepEqual((await h.api.getPaintPrices(game,'pregame')).props,[])
  assert.deepEqual((await h.api.getPaintPrices(game,'live')).props,[])
  assert.equal(h.counts().fetches,0)
})

test('the outer board-price cache expires direct First Basket observations without refetching or suppressing healthy quotes',async()=>{
  const start=tip-3600000
  const direct={...quote(900,start-299000),id:-3_000_000_000_434,prop_type:'first_score',line_value:'0.5',market:{type:'over_under' as const,over_odds:900}}
  const primary={...direct,id:55,player_id:435,updated_at:new Date(start-1000).toISOString()}
  const h=await harness(start,[quote(-110,start-1000)],[],[direct,primary])
  assert.equal((await h.api.getPaintPrices(game)).firstBasket.length,2)
  const reads=h.counts().fetches
  h.advance(start+2000)
  const aged=await h.api.getPaintPrices(game)
  assert.deepEqual(aged.firstBasket,[primary])
  assert.equal(aged.props[0].market.odds,-110)
  assert.ok(aged.issues.includes('Some sportsbook prices unavailable'))
  assert.equal(h.counts().fetches,reads,'expiry of the outer cache must not start an extra provider request')
})
test('First Basket after tipoff renders its saved pregame quote and never requests current sportsbook prices',async()=>{
  const source=await readFile(new URL('../src/lib/nbaFirstBasketOddsData.ts',import.meta.url),'utf8')
  const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
  const match={...game,status_state:'in_progress',period:2,home_team:{id:1,abbreviation:'BOS'},visitor_team:{id:2,abbreviation:'NYK'}} as paint.PaintGame
  const imports:Record<string,unknown>={
    'server-only':{},'./nbaPaint':paint,'./nbaFirstBasketOdds':{},'./nbaSharedCache':{},
    './nbaBookFirstData':{getNbaBookFirstSupplement:async()=>{throw Error('Frozen pregame prices must not read current direct-book observations')}},
    './supabase/admin':{},
    './nbaOddsClockData':{getNbaOddsGame:async(g:paint.PaintGame)=>g},
    './nbaOddsMode':{...mode,nbaPregameOpen:()=>false,nbaLiveOpen:()=>true},
    './nbaOddsPhaseData':{getNbaPhaseSnapshot:async(_game:paint.PaintGame,phase:string)=>{assert.equal(phase,'pregame');return {firstBasket:[{...quote(700,tip-1000),prop_type:'first_score',line_value:'.5'}],available:{firstBasket:true},capturedAt:{firstBasket:new Date(tip-1000).toISOString()}}}},
    './nbaPaintData':{getPaintRoster:async()=>[{id:434,first_name:'Real',last_name:'Player',team:match.home_team,position:'G'}],artwork:async()=>({headshots:new Map()})},
  }
  const target={exports:{}}
  new Function('require','module','exports','fetch',output)((name:string)=>{assert.ok(name in imports,name);return imports[name]},target,target.exports,()=>{throw Error('Current provider must not run')})
  const result=await (target.exports as typeof import('../src/lib/nbaFirstBasketOddsData.ts')).getNbaFirstOddsForMode(match,'pregame')
  assert.equal(result.rows[0].offer.market.odds,700);assert.equal(result.rows[0].player.first_name,'Real')
})
test('a later provider schedule correction cannot reopen the persisted pregame cutoff',async()=>{
  const h=await harness(tip+60000,[quote(-600,tip+30000)])
  const corrected={...game,datetime:new Date(tip+900000).toISOString()}
  assert.equal((await h.api.getPaintPrices(corrected,'pregame')).props[0].market.odds,1000)
  assert.equal(h.counts().fetches,0)
})
