import 'server-only'
import {createHash} from 'node:crypto'
import {createAdminClient} from './supabase/admin'
import {getPaintRoster} from './nbaPaintData'
import type {PaintGame} from './nbaPaint'
import {getNbaOddsGame} from './nbaOddsClockData'
import {nbaPregameOpen} from './nbaOddsMode'
import {nbaPublicObservation,type NbaPublicPayload} from './nbaPublicObservation'
export async function importNbaPublic(game:PaintGame,payload:NbaPublicPayload){
  const canonical=await getNbaOddsGame(game)
  if(!nbaPregameOpen(canonical))throw new Error('NBA public capture crossed tipoff')
  const roster=await getPaintRoster(canonical),snapshot=nbaPublicObservation(canonical,payload,roster)
  const hash=createHash('sha256').update(JSON.stringify(snapshot.rows.map(({playerId,market,picks})=>({playerId,market,picks})))).digest('hex')
  const {data,error}=await createAdminClient().rpc('record_nba_public_capture',{p_game_id:game.id,p_game_date:game.date,p_captured_at:snapshot.capturedAt,p_fingerprint:hash,p_snapshot:snapshot})
  if(error||typeof data!=='boolean')throw new Error('NBA public capture could not save')
  return {changed:data,rows:snapshot.rows.length,players:new Set(snapshot.rows.map(row=>row.playerId)).size,markets:snapshot.markets.length,unmatched:snapshot.unmatched,
    fingerprint:hash,observedAt:snapshot.capturedAt,complete:snapshot.complete,available:snapshot.rows.length>0,coverage:snapshot.coverage}
}
