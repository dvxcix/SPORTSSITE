import 'server-only'
import { createAdminClient } from './supabase/admin'
import { nbaGameStart, type NbaOddsMode } from './nbaOddsMode'
import { nbaPublicHistory, NBA_PUBLIC_CONTINUITY_VERSION, type NbaPublicStoredFrame } from './nbaPublicHistory'
import type { PaintGame } from './nbaPaint'

/** Optional counts for one already phase-verified game. This runs only inside
 * the shared slate fill; it does not refresh sources or start collectors. A
 * single bounded read cannot delay or multiply with individual quote cells. */
export async function getNbaBoardPublicCaptures(game:PaintGame,mode:NbaOddsMode) {
  const tip=nbaGameStart(game), now=Date.now()
  if (!Number.isSafeInteger(game.id) || game.id <= 0 || tip == null || mode === 'live' && now < tip) return []
  const phaseEnd=mode==='pregame'?Math.min(now,tip-1):now
  let query=createAdminClient().from('nba_public_captures').select('snapshot,captured_at').eq('game_id',game.id).lte('captured_at',new Date(phaseEnd).toISOString())
  if(mode==='live')query=query.gte('captured_at',new Date(tip).toISOString())
  const {data,error}=await query.order('captured_at',{ascending:false}).order('id',{ascending:false}).limit(1).abortSignal(AbortSignal.timeout(1500))
  if(error)throw new Error('Public activity unavailable')
  const frames=(data??[]) as NbaPublicStoredFrame[],latest=frames[0]
  // A single read cannot safely reconstruct older sparse or partial frames.
  // Use only a complete composite snapshot; unavailable counts stay blank.
  if(!latest || latest.snapshot?.continuityVersion!==NBA_PUBLIC_CONTINUITY_VERSION || latest.snapshot.complete!==true || latest.snapshot.unmatched!==0)return []
  return nbaPublicHistory(frames,game.id,mode,tip,phaseEnd)
}
