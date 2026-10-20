import { nbaName, type PaintGame, type PaintPlayer, type PaintProp } from './nbaPaint'

export type FirstOddsEvent = {id:string;home_team:string;away_team:string;commence_time:string;bookmakers?:{key:string;last_update?:string;markets:{key:string;last_update?:string;outcomes:{name:string;description?:string;price:number}[]}[]}[]}
export type FirstBasketRow = {game:PaintGame;player:Pick<PaintPlayer,'id'|'first_name'|'last_name'|'team'|'position'|'headshot'>;offer:PaintProp}
const teamName=(name:string)=>nbaName(name).replace(/^losangeles/,'la')
export function nbaFirstEvent(events:FirstOddsEvent[],game:PaintGame){
  const starts=Date.parse(game.datetime??game.status)
  const matches=events.filter(e=>teamName(e.home_team)===teamName(game.home_team.full_name)&&teamName(e.away_team)===teamName(game.visitor_team.full_name)&&Number.isFinite(starts)&&Math.abs(Date.parse(e.commence_time)-starts)<=600000)
  return matches.length===1?matches[0]:null
}
// These contracts have different winning events and must never share a best
// price group. Unknown book semantics are withheld rather than guessed.
const firstRules:Record<string,'first_score'|'first_field_goal'>={fanduel:'first_score',draftkings:'first_score',williamhill_us:'first_score',betmgm:'first_field_goal',fanatics:'first_field_goal'}
const methodName=(value:string)=>value.toLowerCase().replace(/[^a-z0-9]/g,'')
const methodKeys:Record<string,string>={'2pt':'2pt','3pt':'3pt','twopointer':'2pt','2pointer':'2pt','2pointfieldgoal':'2pt','3pointer':'3pt','3pointfieldgoal':'3pt','threepointer':'3pt',freethrow:'free_throw',dunk:'dunk',layup:'layup',other:'other'}
const hash=(value:string)=>{let n=2166136261;for(const c of value)n=Math.imul(n^c.charCodeAt(0),16777619);return -((n>>>0)+1)}
export function nbaNormalizeFirstOdds(event:FirstOddsEvent,game:PaintGame,players:PaintPlayer[],asOf=Date.now()):{rows:FirstBasketRow[];unmatched:number}{
  if(nbaFirstEvent([event],game)?.id!==event.id)return {rows:[],unmatched:1}
  const offers=new Map<string,FirstBasketRow>();let unmatched=0
  for(const book of event.bookmakers??[])for(const market of book.markets){
    if(!['player_first_basket','player_first_team_basket','player_method_of_first_basket'].includes(market.key))continue
    const rule=firstRules[book.key],at=market.last_update??book.last_update??'',time=Date.parse(at)
    if(!rule||!Number.isFinite(time)||time>asOf+30000||asOf-time>300000){unmatched+=market.outcomes.length;continue}
    for(const outcome of market.outcomes){
      if(!Number.isFinite(outcome.price)||Math.abs(outcome.price)<100){unmatched++;continue}
      const name=outcome.description??(!['yes','no'].includes(outcome.name.toLowerCase())?outcome.name:'')
      const matches=players.filter(p=>[game.home_team.id,game.visitor_team.id].includes(p.team.id)&&nbaName(`${p.first_name} ${p.last_name}`)===nbaName(name))
      if(matches.length!==1){unmatched++;continue}
      const player=matches[0],method=market.key==='player_method_of_first_basket'?methodKeys[methodName(outcome.name)]:undefined
      if(market.key==='player_method_of_first_basket'&&(!method||rule!=='first_score')){unmatched++;continue}
      const prop=method?`first_score_${method}`:market.key==='player_first_team_basket'?rule==='first_score'?'team_first_score':'team_first_field_goal':rule
      const vendor=book.key==='williamhill_us'?'caesars':book.key,key=`${game.id}:${player.id}:${vendor}:${prop}`
      const existing=offers.get(key),side=outcome.name.toLowerCase()==='no'?'under':'over'
      const offer=existing?.offer??{id:hash(key),game_id:game.id,player_id:player.id,vendor,prop_type:prop,line_value:'0.5',market:{type:'over_under' as const},updated_at:at}
      if(side==='under')offer.market.under_odds=outcome.price;else offer.market.over_odds=outcome.price
      offers.set(key,{game,player:{id:player.id,first_name:player.first_name,last_name:player.last_name,team:player.team,position:player.position,headshot:player.headshot},offer})
    }
  }
  return {rows:[...offers.values()].filter(row=>row.offer.market.over_odds!=null),unmatched}
}
