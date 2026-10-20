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
