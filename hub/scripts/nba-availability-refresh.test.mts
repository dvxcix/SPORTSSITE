import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import * as crypto from 'node:crypto'
import ts from 'typescript'
import * as paint from '../src/lib/nbaPaint.ts'
import * as modes from '../src/lib/nbaOddsMode.ts'
import * as availability from '../src/lib/nbaMarketAvailability.ts'
import { nbaAttachOpenings } from '../src/lib/nbaOddsHistory.ts'

const tip=Date.parse('2030-11-20T23:00:00Z')
const team={id:1,abbreviation:'ATL',full_name:'Atlanta Hawks',name:'Hawks'}
const game={id:123,date:'2030-11-20',season:2030,datetime:new Date(tip).toISOString(),status:'Scheduled',period:0,home_team:team,visitor_team:{...team,id:2}} as paint.PaintGame
const player={id:4,first_name:'Fixture',last_name:'Player',position:'G',team,headshot:null,injury:{status:'Questionable',description:'Earlier report'},average:{pts:12},logs:[],props:[]} as paint.PaintPlayer
const quote={id:1,game_id:123,player_id:4,vendor:'fanduel',prop_type:'points',line_value:'10',market:{type:'milestone',odds:100},updated_at:new Date(tip-60000).toISOString()} as paint.PaintProp
const board={game,players:[player],fetchedAt:new Date(tip-3600000).toISOString(),issues:[],sampleSeason:2030,statsComplete:true,historical:false,sampleEnd:'2030-11-19'} as paint.PaintBoard

async function harness(){
 let now=tip-30000,status='Out',fail=false,cross=false,reads=0
 const keys:string[]=[]
 class Clock extends Date{constructor(value:string|number=now){super(value)}static now(){return now}}
 const imports:Record<string,unknown>={
  'server-only':{},'node:crypto':crypto,'@/lib/balldontlie':{bdlHeaders:{}},'./nbaPaint':paint,'./nbaPlayerPortraits':{},'./nbaOddsHistory':{nbaAttachOpenings},'./nbaOddsHistoryData':{getNbaQuoteOpenings:async()=>[]},'./nbaFirstBasketOddsData':{},'./nbaPrimaryProps':{},'./nbaBookPropsData':{},'./nbaPregameResearchData':{},'./nbaMarketAvailability':availability,
  './nbaOddsMode':{...modes,nbaPregameOpen:(g:paint.PaintGame)=>modes.nbaPregameOpen(g,now),nbaLiveOpen:(g:paint.PaintGame)=>modes.nbaLiveOpen(g,now)},
  './nbaOddsClockData':{getNbaOddsGame:async(g:paint.PaintGame)=>g},
  './nbaOddsPhaseData':{getNbaPhaseSnapshot:async()=>({props:[quote],gameOdds:[],firstBasket:[],capturedAt:{props:quote.updated_at}})},
  './nbaSupplementalProps':{nbaSupplementalQuote:()=>false},
  './nbaSharedCache':{nbaSharedCache:async(key:string,ttl:number,_stale:number,load:()=>Promise<unknown>)=>{keys.push(key);if(key.startsWith('phase-prices:'))return{value:{props:[quote],gameOdds:[],firstBasket:[],issues:[]}};if(key.startsWith('provider:')){assert.equal(ttl,key.startsWith('provider:v1:60:')?60:300);return{value:await load()}};throw Error('Unexpected cache')}},
 }
 const source=await readFile(new URL('../src/lib/nbaPaintData.ts',import.meta.url),'utf8')
 const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 const module={exports:{} as typeof import('../src/lib/nbaPaintData.ts')}
 new Function('require','module','exports','Date','fetch',output)((name:string)=>{assert.ok(name in imports,name);return imports[name]},module,module.exports,Clock,async(url:string)=>{
  reads++;if(url.includes('players/active'))return Response.json({data:[player]})
  assert.ok(url.includes('player_injuries'));if(fail)throw Error('Synthetic outage');if(cross)now=tip+1
  return Response.json({data:status?[{player:{id:4},status,description:'New report'}]:[]})
 })
 return{api:module.exports,keys,reads:()=>reads,setTime:(value:number)=>{now=value},setStatus:(value:string)=>{status=value},setFail:()=>{fail=true},cross:()=>{cross=true}}
}

test('new injury reports refresh retained research and remove OUT quotes without mutating the research bundle',async()=>{
 const h=await harness(),updated=await h.api.refreshPaintBoardPrices(board,'pregame')
 assert.equal(updated.players[0].injury?.status,'Out');assert.deepEqual(updated.players[0].props,[])
 assert.deepEqual(updated.players[0].average,player.average);assert.equal(player.injury?.status,'Questionable')
 assert.ok(h.keys.some(key=>key.startsWith('provider:v1:60:')))
 h.setStatus('');const cleared=await h.api.refreshPaintBoardPrices(board,'pregame');assert.equal(cleared.players[0].injury,null)
})

test('injury-feed failure retains the last known status and reports the unavailable refresh',async()=>{
 const h=await harness();h.setFail();const updated=await h.api.refreshPaintBoardPrices(board,'pregame')
 assert.equal(updated.players[0].injury?.status,'Questionable');assert.ok(updated.issues.includes('Injury report unavailable'))
})

test('closed and tip-crossing pregame views retain their original injury report',async()=>{
 const h=await harness();h.setTime(tip+1);const frozen=await h.api.refreshPaintBoardPrices(board,'pregame')
 assert.equal(h.reads(),0);assert.equal(frozen.players[0].injury?.status,'Questionable')
 const crossing=await harness();crossing.cross();const crossed=await crossing.api.refreshPaintBoardPrices(board,'pregame')
 assert.equal(crossed.players[0].injury?.status,'Questionable')
})
