import type { PaintBoard, PaintPlayer, PaintStat } from './nbaPaint'

/** Response-only view of the already captured board. Never pass this derived
 * value to capture, model, rankings or research persistence. */
export function nbaSeasonDisplayBoard(board:PaintBoard):PaintBoard {
  const season=board.game.season,before=board.game.date
  const day=(value:unknown):string|null=>{
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value))return null
    const date=value.slice(0,10),ms=Date.parse(`${date}T00:00:00Z`)
    return Number.isFinite(ms)&&new Date(ms).toISOString().slice(0,10)===date&&Number.isFinite(Date.parse(value))?date:null
  }
  const seasonValid=Number.isSafeInteger(season)&&season>=2000&&season<=2200&&day(before)===before&&before>=`${season}-07-01`&&before<`${season+1}-07-01`
  if(!seasonValid)throw new Error('NBA selected season unavailable')
  const valid=(player:PaintPlayer,log:PaintStat,period:0|1)=>{
    const date=log?.game&&day(log.game.date)
    return seasonValid&&log?.player?.id===player.id&&log?.game?.season===season&&Number.isSafeInteger(log.game.id)&&log.game.id>0&&log.game.id!==board.game.id
      &&date!=null&&date>=`${season}-07-01`&&date<before&&(log.game.status_state==='final'||log.game.status==='Final')
      &&(period===1?log.period===1:log.period==null||log.period===0)
  }
  let incomplete=board.statsComplete!==true||board.sampleSeason!==season||!Array.isArray(board.baselineSeasons)||board.baselineSeasons.length===0||board.baselineSeasons.some(value=>value!==season)
    ||!!board.teamStats?.length&&board.teamStatsSeason!==season
  for(const player of board.players){
    if(player.averageSeason!==season||!Array.isArray(player.logs)||player.periodLogs!=null&&!Array.isArray(player.periodLogs))incomplete=true
    if((Array.isArray(player.logs)?player.logs:[]).some(log=>!valid(player,log,0))||(Array.isArray(player.periodLogs)?player.periodLogs:[]).some(log=>!valid(player,log,1)))incomplete=true
  }
  if(!incomplete)return board
  const players=board.players.map(player=>({
    ...player,
    averageSeason:undefined,
    logs:(Array.isArray(player.logs)?player.logs:[]).filter(log=>valid(player,log,0)),
    periodLogs:(Array.isArray(player.periodLogs)?player.periodLogs:[]).filter(log=>valid(player,log,1)),
    // No new historical season averages are manufactured from a subset.
    average:Object.fromEntries(Object.keys(player.average??{}).map(key=>[key,null])),
  }))
  return {...board,players,sampleSeason:season,baselineSeasons:[],statsComplete:false,periodStatsComplete:false,teamStats:[],teamStatsSeason:undefined,
    issues:[...new Set([...(board.issues??[]),'Some saved research is unavailable for the selected season'])]}
}
