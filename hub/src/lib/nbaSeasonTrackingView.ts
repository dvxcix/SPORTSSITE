import type { PaintBoard } from './nbaPaint'
import type { NbaTrackingRow } from './nbaTracking'

/** Keep only originally captured rows whose exact player, game and team have
 * an unambiguous completed-game witness in the selected season. This is a
 * response view: it never writes or fills an archived observation. */
export function nbaSeasonTrackingView<T extends {rows:NbaTrackingRow[];seasons:number[];complete:boolean;sourceStates?:{key:string;complete?:boolean}[];fields:string[]}>(board: PaintBoard, data: T): T {
  const season=board.game.season,before=board.game.date, witnesses=new Map<string,Map<number,string>>(), conflicting=new Set<string>()
  const boardDate = typeof before === 'string' ? Date.parse(`${before}T00:00:00Z`) : NaN
  if(!Number.isSafeInteger(season)||season<2000||season>2200||!Number.isSafeInteger(board.game.id)||board.game.id<=0
    ||!/^\d{4}-\d{2}-\d{2}$/.test(before)||!Number.isFinite(boardDate)||new Date(boardDate).toISOString().slice(0,10)!==before
    ||before<`${season}-07-01`||before>=`${season+1}-07-01`)
    return {...data,rows:[],seasons:[],complete:false,fields:[],...(data.sourceStates?{sourceStates:[]}:{})}
  for(const player of board.players)for(const log of player.logs ?? []){
    const date=log.game.date?.slice(0,10), parsed=Date.parse(`${date}T00:00:00Z`), key=`${player.id}:${log.game.id}`
    if(!Number.isSafeInteger(player.id)||player.id<=0||log.player?.id!==player.id||!Number.isSafeInteger(log.game.id)||log.game.id<=0||log.game.id===board.game.id||!Number.isSafeInteger(log.team?.id)||log.team.id<=0||log.game.season!==season
      ||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(parsed)||new Date(parsed).toISOString().slice(0,10)!==date
      ||log.game.date!==date&&(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(log.game.date)||!Number.isFinite(Date.parse(log.game.date)))
      ||date<`${season}-07-01`||date>=before||(log.period!=null&&log.period!==0)
      ||(log.game.status_state!=null?log.game.status_state!=='final':log.game.status!=='Final')){conflicting.add(key);continue}
    const teams=witnesses.get(key)??new Map<number,string>();if(teams.has(log.team.id)&&teams.get(log.team.id)!==date)conflicting.add(key);teams.set(log.team.id,date);witnesses.set(key,teams)
  }
  const rows=Array.isArray(data.seasons)&&data.seasons.includes(season)?data.rows.filter(row=>{const key=`${row.playerId}:${row.gameId}`,teams=witnesses.get(key);return !conflicting.has(key)&&teams?.size===1&&teams.has(row.teamId)}):[]
  const seasons=(data.seasons??[]).filter(value=>value===season)
  const statesProven=Array.isArray(data.sourceStates)&&data.sourceStates.length===1&&data.sourceStates[0].key===`advanced:${season}`&&data.sourceStates[0].complete===true
  const complete=data.complete&&rows.length===data.rows.length&&Array.isArray(data.seasons)&&data.seasons.length>0&&data.seasons.every(value=>value===season)&&statesProven
  return {...data,rows,seasons,complete,fields:[...new Set(rows.flatMap(row=>Object.keys(row.values)))].sort(),
    ...(data.sourceStates?{sourceStates:data.sourceStates.filter(state=>state.key===`advanced:${season}`)}:{})}
}
