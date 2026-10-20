import 'server-only'
import { createAdminClient } from './supabase/admin'
import { nbaSharedCache } from './nbaSharedCache'
import { nbaGameStart } from './nbaOddsMode'
import type { PaintGame } from './nbaPaint'

/** Once a stored cutoff has passed, a later provider schedule cannot reopen it. */
export async function getNbaOddsGame<T extends Pick<PaintGame,'id'|'datetime'|'status'>>(game:T):Promise<T> {
  const provided=nbaGameStart(game)
  if(!Number.isSafeInteger(game.id)||game.id<=0||provided==null) throw new Error('Verified NBA phase required')
  const tipoff=new Date(provided).toISOString()
  const cutoff=(await nbaSharedCache('odds-clock:v1:'+game.id+':'+tipoff,15,0,async()=>{
    const {data,error}=await createAdminClient().rpc('nba_phase_cutoff',{p_game_id:game.id,p_tipoff:tipoff}).abortSignal(AbortSignal.timeout(12000))
    const canonical=typeof data==='string'?Date.parse(data):NaN
    if(error||!Number.isFinite(canonical)||canonical>provided) throw new Error('Verified NBA phase unavailable')
    return new Date(canonical).toISOString()
  },25)).value
  return {...game,datetime:cutoff}
}
