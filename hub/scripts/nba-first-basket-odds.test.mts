import * as oddsMode from '../src/lib/nbaOddsMode.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import { nbaFirstEvent,nbaNormalizeFirstOdds,type FirstOddsEvent } from '../src/lib/nbaFirstBasketOdds.ts'
import { nbaSelectionKey,parseNbaSelection,nbaValue,type PaintGame,type PaintPlayer,type PaintStat } from '../src/lib/nbaPaint.ts'
import { watchlistPickPayload } from '../src/lib/nflWatchlist.ts'
import { gradeNbaPick,type NbaPendingPick } from '../src/lib/nbaPickGrading.ts'
import type { NbaPlay } from '../src/lib/nbaShots.ts'
const team={id:2,abbreviation:'BOS',full_name:'Boston Celtics',name:'Celtics'},away={id:9,abbreviation:'DET',full_name:'Detroit Pistons',name:'Pistons'}
const game:PaintGame={id:123,date:'2026-10-20',season:2026,status:'Scheduled',datetime:'2026-10-20T23:00:00Z',status_state:'scheduled',period:0,home_team:team,visitor_team:away,home_team_score:0,visitor_team_score:0}
const player:PaintPlayer={id:434,first_name:'Test',last_name:'Player',team,headshot:null,position:'C',injury:null,average:{},logs:[],props:[]}
const now=Date.parse('2026-10-20T12:00:00Z'),at='2026-10-20T11:59:00Z'
const event:FirstOddsEvent={id:'abc',home_team:team.full_name,away_team:away.full_name,commence_time:game.datetime!,bookmakers:[
  {key:'fanduel',last_update:at,markets:[{key:'player_first_basket',outcomes:[{name:'Yes',description:'Test Player',price:500},{name:'No',description:'Test Player',price:-750}]},{key:'player_method_of_first_basket',outcomes:[{name:'Dunk',description:'Test Player',price:1100}]}]},
  {key:'draftkings',last_update:at,markets:[{key:'player_first_basket',outcomes:[{name:'Yes',description:'Test Player',price:550}]}]},
  {key:'betmgm',last_update:at,markets:[{key:'player_first_basket',outcomes:[{name:'Yes',description:'Test Player',price:600}]}]},
]}
test('first-basket quotes retain exact book rules, player and method instead of comparing different winning events',()=>{
  const result=nbaNormalizeFirstOdds(event,game,[player],now)
  assert.equal(result.rows.length,4);assert.equal(result.unmatched,0)
  assert.deepEqual(result.rows.map(r=>[r.offer.vendor,r.offer.prop_type]),[['fanduel','first_score'],['fanduel','first_score_dunk'],['draftkings','first_score'],['betmgm','first_field_goal']])
  assert.equal(result.rows[0].offer.market.under_odds,-750)
  const selected=result.rows[1].offer,key=nbaSelectionKey(434,selected,'over')
  assert.equal(parseNbaSelection(key)?.prop_key,'first_score_dunk')
  assert.equal(watchlistPickPayload({sport:'nba',game_pk:'123',player_name:'Test Player',prop_label:'First basket · Dunk',prop_key:key,book:'fanduel',odds:1100}).numeric_line,.5)
  assert.equal(nbaValue({pts:50},'first_score'),null)
  assert.equal(parseNbaSelection(key.replace(':0.5:',':2:')),null)
})
test('first-basket imports fail closed on ambiguous identities, unknown rules, stale prices and different events',()=>{
  assert.equal(nbaFirstEvent([event,event],game),null)
  assert.equal(nbaFirstEvent([{...event,home_team:away.full_name}],game),null)
  assert.equal(nbaFirstEvent([{...event,commence_time:'2026-10-21T23:00:00Z'}],game),null)
  assert.equal(nbaNormalizeFirstOdds(event,game,[player,{...player,id:999}],now).rows.length,0)
  assert.equal(nbaNormalizeFirstOdds(event,game,[player],now+360000).rows.length,0)
  assert.equal(nbaNormalizeFirstOdds({...event,bookmakers:event.bookmakers!.map(b=>({...b,key:'unknown'}))},game,[player],now).rows.length,0)
  for(const price of [99,100.5,1000001,NaN]){
    const invalid={...event,bookmakers:[{key:'fanduel',last_update:at,markets:[{key:'player_first_basket',outcomes:[{name:'Test Player',price}]}]}]}
    assert.equal(nbaNormalizeFirstOdds(invalid,game,[player],now).rows.length,0)
  }
})

test('private First Basket rejection counts distinguish expired prices from missing identities',()=>{
  const sample:FirstOddsEvent={...event,bookmakers:[
    {key:'draftkings',last_update:'2026-10-20T11:54:59Z',markets:[{key:'player_first_basket',outcomes:[{name:'Test Player',price:500},{name:'Unknown Player',price:600}]}]},
    {key:'fanduel',last_update:at,markets:[{key:'player_first_basket',outcomes:[{name:'Unknown Player',price:500},{name:'Test Player',price:99}]},{key:'player_method_of_first_basket',outcomes:[{name:'Unknown Method',description:'Test Player',price:800}]}]},
  ]}
  const result=nbaNormalizeFirstOdds(sample,game,[player],now)
  assert.equal(result.unmatched,5)
  assert.deepEqual(result.diagnostics.reasons,{stale:2,player:1,price:1,method:1})
  assert.deepEqual(result.diagnostics.players,[{name:'Unknown Player',market:'player_first_basket'}])
  const many={...event,bookmakers:[{key:'fanduel',last_update:at,markets:[{key:'player_first_basket',outcomes:Array.from({length:30},(_,i)=>({name:String(i)+'x'.repeat(120),price:500}))}]}]}
  const bounded=nbaNormalizeFirstOdds(many,game,[player],now)
  assert.equal(bounded.diagnostics.players.length,12)
  assert.ok(bounded.diagnostics.players.every(row=>row.name.length<=80))
  assert.equal(bounded.unmatched,30)
})

test('private First Basket clock evidence preserves original times and existing acceptance boundaries',()=>{
  const quote=(last_update:string)=>({...event,bookmakers:[{key:'draftkings',last_update,markets:[{key:'player_first_basket',outcomes:[{name:'Test Player',price:550},{name:'Other private name',price:650}]}]}]})
  for(const [clock,reason,ageMs] of [
    [new Date(now-300001).toISOString(),'expired',300001],
    [new Date(now+30001).toISOString(),'future',-30001],
    ['https://private.invalid/?token=never-log','invalid-clock',null],
  ] as const){
    const result=nbaNormalizeFirstOdds(quote(clock),game,[player],now)
    assert.equal(result.rows.length,0);assert.equal(result.unmatched,2)
    assert.deepEqual(result.diagnostics.timestamps,[{book:'draftkings',market:'player_first_basket',outcomes:2,reason,quoteAt:reason==='invalid-clock'?null:clock,checkedAt:new Date(now).toISOString(),tipoff:new Date(game.datetime!).toISOString(),ageMs}])
    assert.equal(JSON.stringify(result.diagnostics.timestamps).includes('private'),false)
  }
  for(const clock of [new Date(now-300000).toISOString(),new Date(now+30000).toISOString()])assert.equal(nbaNormalizeFirstOdds(quote(clock),game,[player],now).rows.length,1,'diagnostics do not tighten the normalizer clock policy')
  const expired=quote(new Date(now-300001).toISOString())
  expired.bookmakers=Array.from({length:30},()=>expired.bookmakers![0])
  const bounded=nbaNormalizeFirstOdds(expired,game,[player],now)
  assert.equal(bounded.unmatched,60);assert.equal(bounded.diagnostics.timestamps?.length,12)
})

test('verified roster aliases retain exact first-basket prices and market identities',()=>{
  const identities=[
    {id:38017716,first_name:'Ousmane',last_name:'Dieng',alias:'Ousmane'},
    {id:1028028405,first_name:'Alexandre',last_name:'Sarr',alias:'Alex Sarr'},
    {id:1057260888,first_name:'Airious',last_name:'Bailey',alias:'Ace Bailey'},
    {id:56677830,first_name:'GG',last_name:'Jackson',alias:'Gregory Jackson'},
  ]
  const roster=identities.map(identity=>({...player,...identity}))
  const sample={...event,bookmakers:[{key:'fanduel',last_update:at,markets:[{key:'player_first_basket',outcomes:identities.map((identity,index)=>({name:identity.alias,price:500+index*100}))}]}]}
  const result=nbaNormalizeFirstOdds(sample,game,roster,now)
  assert.equal(result.unmatched,0)
  assert.deepEqual(result.rows.map(row=>[row.player.id,row.offer.player_id,row.offer.prop_type,row.offer.market.over_odds]),identities.map((identity,index)=>[identity.id,identity.id,'first_score',500+index*100]))
  for(const invalid of [roster.map(p=>({...p,id:p.id+1})),roster.map(p=>({...p,first_name:'Different'})),roster.map(p=>({...p,team:{...team,id:999}}))]){
    const rejected=nbaNormalizeFirstOdds(sample,game,invalid,now)
    assert.equal(rejected.rows.length,0);assert.equal(rejected.unmatched,4)
  }
  const named=(name:string)=>({...event,bookmakers:[{key:'fanduel',last_update:at,markets:[{key:'player_first_basket',outcomes:[{name,price:700}]}]}]})
  for(const [name,collision] of [['Ousmane',{...player,id:999,first_name:'Ousmane',last_name:'Other'}],['Alex Sarr',{...player,id:999,first_name:'Alex',last_name:'Sarr'}]] as const){
    const rejected=nbaNormalizeFirstOdds(named(name),game,[...roster,collision],now)
    assert.equal(rejected.rows.length,0);assert.equal(rejected.unmatched,1)
  }
  assert.equal(nbaNormalizeFirstOdds(named('Greg Jackson'),game,roster,now).unmatched,1)
})

test('Alex Sarr aliases resolve across first basket, team first basket and each distinct method',()=>{
  const sarr={...player,id:1028028405,first_name:'Alexandre',last_name:'Sarr'}
  const sample={...event,bookmakers:[{key:'fanduel',last_update:at,markets:[
    {key:'player_first_basket',outcomes:[{name:'Yes',description:'Alex Sarr',price:850}]},
    {key:'player_first_team_basket',outcomes:[{name:'Alex Sarr',price:400}]},
    {key:'player_method_of_first_basket',outcomes:[{name:'2-pointer',description:'Alex Sarr',price:950},{name:'3-pointer',description:'Alex Sarr',price:2500},{name:'Dunk',description:'Alex Sarr',price:1800}]},
  ]}]}
  const result=nbaNormalizeFirstOdds(sample,game,[sarr],now)
  assert.equal(result.unmatched,0)
  assert.deepEqual(result.rows.map(row=>[row.offer.player_id,row.offer.prop_type,row.offer.market.over_odds]),[
    [sarr.id,'first_score',850],[sarr.id,'team_first_score',400],[sarr.id,'first_score_2pt',950],[sarr.id,'first_score_3pt',2500],[sarr.id,'first_score_dunk',1800],
  ])
})
const play=(order:number,patch:Partial<NbaPlay>={}):NbaPlay=>({game_id:123,order,type:'Jumpball',text:'Opening tip',period:1,clock:'12:00',scoring_play:false,shooting_play:false,score_value:null,team:{id:2},coordinate_x:null,coordinate_y:null,participants:[434],...patch})
const plays=[play(1),play(2,{type:'Free Throw',text:'Test Player makes free throw',scoring_play:true,shooting_play:true,score_value:1}),play(3,{type:'Dunk',text:'Other Player makes dunk',scoring_play:true,shooting_play:true,score_value:2,participants:[222],team:{id:9}})]
const stats=[434,222].map(id=>({id,player:{id},team:{id:id===434?2:9},game:{id:123,date:'2026-10-20',status:'Final',status_state:'final',home_team_id:2,visitor_team_id:9},min:'30:00',pts:20}) as PaintStat)
const facts={complete:true,plays,starters:[434,222,3,4,5,6,7,8,9,10]}
const pick=(type:string,id=434):NbaPendingPick=>({id:'pick',post_id:null,game_pk:'123',player_id:`bdl:${id}`,player_name:null,pick_type:type,numeric_line:.5,market_side:'over'})
test('first score, first FG and methods settle from their own opening event, never full-game totals',()=>{
  assert.equal(gradeNbaPick(pick('first_score'),stats,facts),'win')
  assert.equal(gradeNbaPick(pick('first_field_goal'),stats,facts),'loss')
  assert.equal(gradeNbaPick(pick('first_field_goal',222),stats,facts),'win')
  assert.equal(gradeNbaPick(pick('first_score_free_throw'),stats,facts),'win')
  assert.equal(gradeNbaPick(pick('first_score_dunk',222),stats,facts),'loss')
  assert.equal(gradeNbaPick({...pick('first_score'),market_side:'under'},stats,facts),'loss')
  assert.equal(gradeNbaPick(pick('team_first_field_goal',222),stats,facts),'win')
})
test('missing or nonfinal facts, DNPs, unverified starts and opening gaps never become first-basket losses',()=>{
  assert.equal(gradeNbaPick(pick('first_score'),stats),null)
  assert.equal(gradeNbaPick(pick('first_score'),stats,{...facts,complete:false}),null)
  assert.equal(gradeNbaPick(pick('first_score'),stats,{...facts,starters:facts.starters.slice(1)}),null)
  assert.equal(gradeNbaPick(pick('first_score'),stats.map(r=>({...r,min:'0:00',pts:0})),facts),null)
  assert.equal(gradeNbaPick(pick('first_score'),stats.map(r=>({...r,game:{...r.game,status:'Live',status_state:'in_progress'}})),facts),null)
  assert.equal(gradeNbaPick(pick('first_score'),stats,{...facts,plays:plays.slice(1)}),null)
  assert.equal(gradeNbaPick(pick('first_score'),stats,{...facts,plays:plays.map(p=>({...p,game_id:999}))}),null)
})

test('numeric first-basket methods preserve 2-point versus 3-point identity',()=>{
 for(const [two,three] of [['2-pointer','3-pointer'],['Two Point Field Goal','Three Point Field Goal']]){
 const sample={...event,bookmakers:[{key:'fanduel',last_update:at,markets:[{key:'player_method_of_first_basket',outcomes:[{name:two,description:'Test Player',price:700},{name:three,description:'Test Player',price:1200}]}]}]}
 assert.deepEqual(nbaNormalizeFirstOdds(sample,game,[player],now).rows.map(r=>r.offer.prop_type),['first_score_2pt','first_score_3pt'])
 }
})

test('first-basket normalization diagnostics remain admin-only',async()=>{
 const {readFile}=await import('node:fs/promises'),ts=(await import('typescript')).default
 const source=await readFile(new URL('../src/app/the-paint/first-basket/odds/route.ts',import.meta.url),'utf8')
 const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 for(const isAdmin of [false,true]){
  const compiled={exports:{} as {GET:(r:unknown)=>Promise<Response>}}
  const mocks:Record<string,unknown>={
   '@/lib/nbaOddsMode':oddsMode,
   'next/server':{NextResponse:{json:(body:unknown,options?:ResponseInit)=>Response.json(body,options)}},
   '@/lib/paintAccess':{requirePaintAccess:async()=>({userId:'member',isAdmin})},
   '@/lib/nbaPaintData':{getPaintSchedule:async()=>({date:'2026-10-20',games:[game]})},
   '@/lib/nbaPaint':{nbaDate:(value:string)=>value},
   '@/lib/nbaFirstBasketOddsData':{getNbaFirstOddsForMode:async()=>({rows:[],unmatched:1,withheldMethods:['Unrecognized method']}),NbaFirstOddsUnavailable:class extends Error{}},
   '@/lib/nbaFirstBasketHistoryData':{attachNbaFirstBasketHistory:async(_id:number,rows:unknown[])=>rows},
  }
  new Function('require','module','exports',output)((name:string)=>{assert.ok(name in mocks,name);return mocks[name]},compiled,compiled.exports)
  const response=await compiled.exports.GET({nextUrl:new URL('https://www.slipsurge.com/the-paint/first-basket/odds?date=2026-10-20')})
  const body=await response.json();assert.equal(response.status,200);assert.equal('diagnostics' in body,isAdmin)
  if(isAdmin)assert.deepEqual(body.diagnostics.withheldMethods,['Unrecognized method'])
 }
})
