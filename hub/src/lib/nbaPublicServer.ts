import 'server-only'
import {createHash} from 'node:crypto'
import {createAdminClient} from './supabase/admin'
import {normalizeNbaPublic,type NbaPublicCapture} from './nbaPublic'
import {getPaintRoster} from './nbaPaintData'
import type {PaintGame} from './nbaPaint'
export async function importNbaPublic(game:PaintGame,payload:{url:string;capturedAt:string;props:Record<string,Record<string,number>>}){
  if(!/^https:\/\/app\.pikkit\.com\/event\/[a-z0-9-]+\/?$/i.test(payload.url))throw new Error('Unverified event URL')
  const captured=Date.parse(payload.capturedAt)
  if(!Number.isFinite(captured)||captured>Date.now()+60000||captured<Date.now()-3600000)throw new Error('Stale capture')
  const {rows,unmatched}=normalizeNbaPublic(payload.props,await getPaintRoster(game))
  if(!rows.length)throw new Error('No verified NBA player counts')
  const snapshot:NbaPublicCapture={gameId:game.id,capturedAt:new Date(captured).toISOString(),sourceUrl:payload.url,rows,unmatched,markets:[...new Set(rows.map(r=>r.market))]}
  const hash=createHash('sha256').update(JSON.stringify(rows)).digest('hex')
  const {data,error}=await createAdminClient().rpc('record_nba_public_capture',{p_game_id:game.id,p_game_date:game.date,p_captured_at:snapshot.capturedAt,p_fingerprint:hash,p_snapshot:snapshot})
  if(error)throw new Error('NBA public capture could not save')
  return {changed:data,players:new Set(rows.map(r=>r.playerId)).size,markets:snapshot.markets.length,unmatched}
}
