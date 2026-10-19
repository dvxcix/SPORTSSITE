import { nbaMinutes,nbaSample,type PaintPlayer,type PaintStat } from './nbaPaint'
export type NbaTrackingRow={id:number;playerId:number;teamId:number;gameId:number;values:Record<string,number|null>}
export function nbaTrackingField(key:string){
 const percentage=/percentage|(^|_)pct($|_)/.test(key)||key==='pie'||key==='free_throw_attempt_rate'||key==='opp_free_throw_attempt_rate'
 const group=/^matchup_|partial_possessions|switches_on/.test(key)?'Matchup':/rebound|box_out/.test(key)?'Rebounding':/assist|passes/.test(key)?'Playmaking':/block|deflect|contested_shots|defended|charges|loose_balls|defensive_rating|opp_/.test(key)?'Defense':/shoot|field_goal|fga|fgm|free_throw|pct_pts|points_|pct_assisted|pct_unassisted|3pa|3pm/.test(key)?'Shooting':'Opportunity'
 const label=key.replaceAll('_',' ').replace(/\bpct\b/g,'%').replace(/\bpercentage\b/g,'%').replace(/\b(?:fga|fgm|efg|fta|ftm|pie|3pa|3pm)\b/g,word=>word.toUpperCase()).replace(/^./,letter=>letter.toUpperCase())
 return{key,label,percentage,group}
}
export function nbaTrackingRow(raw:Record<string,unknown>,log:PaintStat):NbaTrackingRow|null{
 const game=raw.game as {id?:number;date?:string;status?:string;status_state?:string}|undefined,player=raw.player as {id?:number}|undefined,team=raw.team as {id?:number}|undefined
 if(raw.period!==0||!Number.isSafeInteger(raw.id)||Number(raw.id)<=0||!(game?.status==='Final'||game?.status_state==='final')||game?.date?.slice(0,10)!==log.game.date.slice(0,10)||game?.id!==log.game.id||player?.id!==log.player.id||team?.id!==log.team.id)return null
 const values:Record<string,number|null>={}
 for(const [key,value]of Object.entries(raw)){if(['id','period','player_id','game_id','team_id','season'].includes(key)||typeof value==='object'&&value!==null)continue;if(typeof value==='number'&&Number.isFinite(value))values[key]=value;else if(value===null)values[key]=null}
 const matchupMinutes=nbaMinutes(raw.matchup_minutes as string|null);if(matchupMinutes!=null)values.matchup_minutes=matchupMinutes
 return{id:raw.id as number,playerId:player.id!,teamId:team.id!,gameId:game.id!,values}
}
export function nbaTrackingSample(player:PaintPlayer,rows:NbaTrackingRow[],metric:string,count:number,location:'all'|'home'|'away'='all'){
 const selected=nbaSample(player.logs,count,location),map=new Map(rows.filter(row=>row.playerId===player.id).map(row=>[row.gameId,row]))
 const observations=selected.map(log=>({log,value:map.get(log.game.id)?.values[metric]??null})),known=observations.map(row=>row.value).filter((value):value is number=>value!=null&&Number.isFinite(value))
 return{observations,games:selected.length,known:known.length,average:known.length?known.reduce((sum,value)=>sum+value,0)/known.length:null}
}
