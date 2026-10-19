import 'server-only'
import { createAdminClient } from './supabase/admin'
import { nbaSample,nbaToday,type PaintBoard } from './nbaPaint'
import { nbaTrackingRow,type NbaTrackingRow } from './nbaTracking'
import { nbaSharedCache } from './nbaSharedCache'
export async function getNbaTracking(board:PaintBoard){
 const cached=await nbaSharedCache(`tracking:v1:${board.game.id}:${nbaToday()}`,900,3600,async()=>{
  const admin=createAdminClient(),logs=board.players.flatMap(player=>nbaSample(player.logs.filter(log=>log.game.date.slice(0,10)<board.game.date),20)),pairs=new Map(logs.map(log=>[log.player.id+':'+log.game.id,log])),games=[...new Set(logs.map(log=>log.game.id))],players=board.players.map(player=>player.id),rows:NbaTrackingRow[]=[]
  const seasons=[...new Set(logs.map(log=>log.game.season).filter((season):season is number=>season!=null))]
  const {data:states,error:stateError}=await admin.from('nba_ingestion_state').select('key,complete,rows_seen').in('key',seasons.map(season=>'advanced:'+season))
  if(stateError)throw new Error('NBA tracking coverage unavailable')
  for(let offset=0;offset<games.length;offset+=100){
   for(let page=0;page<5;page++){
    const {data,error}=await admin.from('nba_advanced_game_stats').select('payload').in('game_id',games.slice(offset,offset+100)).in('player_id',players).order('id').range(page*1000,page*1000+999)
    if(error)throw new Error('NBA game tracking unavailable')
    for(const row of data??[]){const raw=row.payload as Record<string,unknown>,player=raw.player as {id:number},game=raw.game as {id:number},log=pairs.get(player?.id+':'+game?.id);if(!log)continue;const value=nbaTrackingRow(raw,log);if(value)rows.push(value)}
    if((data?.length??0)<1000)break;if(page===4)throw new Error('NBA tracking response truncated')
   }
  }
  return{gameId:board.game.id,rows:[...new Map(rows.map(row=>[row.playerId+':'+row.gameId,row])).values()],seasons,complete:states?.length===seasons.length&&states.every(state=>state.complete),sourceStates:states??[],fields:[...new Set(rows.flatMap(row=>Object.keys(row.values)))].sort()}
 })
 return{...cached.value,fetchedAt:cached.fetchedAt,stale:cached.stale}
}
