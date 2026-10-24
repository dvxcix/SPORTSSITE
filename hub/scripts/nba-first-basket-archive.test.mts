import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import * as paint from '../src/lib/nbaPaint.ts'
import * as mode from '../src/lib/nbaOddsMode.ts'

const home={id:1,abbreviation:'BOS',name:'Celtics',full_name:'Boston Celtics'}
const away={id:2,abbreviation:'NYK',name:'Knicks',full_name:'New York Knicks'}
const other={id:3,abbreviation:'MIA',name:'Heat',full_name:'Miami Heat'}
const game={id:123,date:'2026-10-19',datetime:'2026-10-19T23:00:00Z',status:'Final',status_state:'final',period:4,home_team:home,visitor_team:away} as paint.PaintGame
const player=(id:number,team=home):paint.PaintRoster=>({id,first_name:'Player',last_name:String.fromCharCode(64+id),position:'G',team})
const offer=(id:number,vendor='fanduel'):paint.PaintProp=>({id:id*10,game_id:123,player_id:id,vendor,prop_type:'first_score',line_value:'.5',market:{type:'over_under',over_odds:700+id},updated_at:'2026-10-19T22:59:00Z'})
type Setup={offers:paint.PaintProp[];active?:paint.PaintRoster[];stats?:Pick<paint.PaintStat,'player'|'team'>[];identities?:Map<number,paint.PaintRoster>;historical?:Map<number,number>;failRosters?:boolean;canonical?:paint.PaintGame}
async function harness(setup:Setup){
  const source=await readFile(new URL('../src/lib/nbaFirstBasketOddsData.ts',import.meta.url),'utf8')
  const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
  const identities:number[]=[],queries:number[]=[],snapshots:paint.PaintGame[]=[]
  const imports:Record<string,unknown>={
    'server-only':{},'./nbaPaint':paint,'./nbaFirstBasketOdds':{},'./nbaOddsMode':mode,
    './nbaBookFirstData':{getNbaBookFirstSupplement:async()=>{throw Error('Archived prices must not request current direct-book observations')}},
    './nbaOddsClockData':{getNbaOddsGame:async(g:paint.PaintGame)=>setup.canonical??g},
    './nbaSharedCache':{nbaSharedCache:async(_key:string,_ttl:number,_stale:number,load:()=>Promise<unknown>)=>({value:await load()})},
    './nbaOddsPhaseData':{getNbaPhaseSnapshot:async(g:paint.PaintGame)=>{snapshots.push(g);return {firstBasket:setup.offers,available:{firstBasket:true},capturedAt:{firstBasket:'2026-10-19T22:59:01Z'}}}},
    './nbaPaintData':{
      getPaintRoster:async()=>{if(setup.failRosters)throw Error('Roster unavailable');return setup.active??[]},
      getPaintFinalStats:async()=>{if(setup.failRosters)throw Error('Stats unavailable');return {rows:setup.stats??[]}},
      getPaintIdentity:async(id:number)=>{identities.push(id);const identity=setup.identities?.get(id);if(!identity)throw Error('Identity unavailable');return identity},
      artwork:async(team:string)=>({headshots:new Map([1,2,3,4].map(id=>[paint.nbaName(`Player ${String.fromCharCode(64+id)}`),`${team}-${id}.png`]))}),
    },
    './supabase/admin':{createAdminClient:()=>({from:(table:string)=>{
      assert.equal(table,'nba_research_snapshots');let id=0
      const chain={select:(columns:string)=>{assert.equal(columns,'team_id');return chain},eq:(key:string,value:number)=>{if(key==='game_id')assert.equal(value,123);else if(key==='player_id')id=value;return chain},order:()=>chain,limit:(limit:number)=>{assert.equal(limit,1);return chain},abortSignal:()=>chain,maybeSingle:async()=>{queries.push(id);return {data:setup.historical?.has(id)?{team_id:setup.historical.get(id)}:null,error:null}}}
      return chain
    }})},
  }
  const target={exports:{}}
  new Function('require','module','exports','fetch',output)((name:string)=>{assert.ok(name in imports,name);return imports[name]},target,target.exports,()=>{throw Error('Archived prices must not request live odds')})
  return {api:target.exports as typeof import('../src/lib/nbaFirstBasketOddsData.ts'),identities,queries,snapshots}
}

test('archived First Basket retains DNP players, resolves each missing identity once and preserves historical team',async()=>{
  const h=await harness({
    offers:[offer(1),offer(2),offer(3),offer(3,'draftkings'),offer(4)],
    active:[player(1,away),player(2)],
    stats:[{player:player(1,away),team:{id:home.id}}],
    identities:new Map([[3,player(3,other)],[4,player(4,other)]]),historical:new Map([[2,home.id],[3,away.id]]),
  })
  const result=await h.api.getNbaFirstOddsForMode(game,'pregame')
  assert.deepEqual(result.rows.map(row=>row.player.id),[1,2,3,3])
  assert.equal(result.rows[0].player.team.id,home.id,'game box score outranks the current roster team')
  assert.equal(result.rows[1].player.id,2,'DNP player remains despite having no box-score row')
  assert.equal(result.rows[2].player.team.id,away.id,'transferred player retains the verified matchup team')
  assert.equal(result.rows[2].player.headshot,'NYK-3.png')
  assert.deepEqual(h.identities.sort(),[3,4],'duplicate book offers share one identity lookup')
  assert.deepEqual(h.queries.sort(),[2,3,4])
  assert.equal(result.unmatched,1,'unknown historical team is not invented')
  assert.equal(result.rows[2].offer.market.over_odds,703)
})

test('archived quote identity can recover while both active roster and box-score feeds are unavailable',async()=>{
  const h=await harness({offers:[offer(3)],failRosters:true,identities:new Map([[3,player(3,other)]]),historical:new Map([[3,away.id]])})
  const result=await h.api.getNbaFirstOddsForMode(game,'pregame')
  assert.equal(result.rows.length,1)
  assert.equal(result.rows[0].player.team.id,away.id)
  assert.equal(result.unmatched,0)
})

test('First Basket uses the persisted passed cutoff before deciding whether corrected schedule prices may refresh',async()=>{
  const canonical={...game,status:'Scheduled',status_state:'scheduled',period:0}
  const corrected={...canonical,datetime:'2099-10-19T23:00:00Z'}
  const h=await harness({offers:[offer(2)],active:[player(2)],canonical})
  const result=await h.api.getNbaFirstOddsForMode(corrected,'pregame')
  assert.equal(result.rows[0].offer.market.over_odds,702)
  assert.equal(h.snapshots[0].datetime,canonical.datetime)
  assert.equal(result.rows[0].game.datetime,canonical.datetime)
  assert.deepEqual(h.identities,[])
})
