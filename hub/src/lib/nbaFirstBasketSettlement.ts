import { nbaOpeningSequence } from './nbaFirstBasket'
import { nbaFirstMarket } from './nbaFirstBasketMarkets'
import type { NbaPlay } from './nbaShots'
import { nbaAppeared,type PaintStat } from './nbaPaint'
import type { NbaPendingPick } from './nbaPickGrading'
export type NbaFirstFacts={plays:NbaPlay[];starters:number[];complete:boolean}
export function gradeNbaFirstPick(pick:NbaPendingPick,stats:PaintStat[],facts?:NbaFirstFacts){
  if(!nbaFirstMarket(pick.pick_type)||pick.numeric_line!==.5||!['over','under'].includes(pick.market_side??'')||!facts?.complete)return null
  const id=Number(pick.player_id.replace(/^bdl:/,'')),game=Number(pick.game_pk)
  const row=stats.find(s=>s.game.id===game&&s.player.id===id&&(s.period??0)===0&&(s.game.status==='Final'||s.game.status_state==='final'))
  // Starter-dependent markets cannot be settled from appearance minutes.
  // Missing/nonstarting identities stay pending for review rather than losing.
  if(!row||!nbaAppeared(row)||facts.starters.length!==10||!facts.starters.includes(id))return null
  const opening=nbaOpeningSequence(facts.plays,game),team=pick.pick_type.startsWith('team_'),fieldGoal=pick.pick_type.includes('field_goal')
  const event=team?(fieldGoal?opening.teamFieldGoals:opening.teamScores).find(p=>p.team?.id===row.team.id):fieldGoal?opening.firstFieldGoal:opening.firstScore
  if(!event?.participants[0]||!event.team?.id)return null
  let won=event.participants[0]===id
  if(pick.pick_type.startsWith('first_score_')){
    const method=pick.pick_type.slice('first_score_'.length),text=`${event.type} ${event.text}`
    const observed=event.score_value===1&&/free throw/i.test(text)?'free_throw':event.score_value===3?'3pt':event.score_value===2?/dunk/i.test(text)?'dunk':/layup/i.test(text)?'layup':'other':null
    if(!observed)return null
    won=won&&(method==='2pt'?event.score_value===2:method===observed)
  }
  return (pick.market_side==='under'?!won:won)?'win' as const:'loss' as const
}
