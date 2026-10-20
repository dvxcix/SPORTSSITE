import 'server-only'
import { createAdminClient } from './supabase/admin'
import { nbaSharedCache } from './nbaSharedCache'
import { getNbaQuoteOpenings } from './nbaOddsHistoryData'
import { nbaFirstMovements,type NbaFirstState } from './nbaFirstBasketMovement'
import type { FirstBasketRow } from './nbaFirstBasketOdds'
import { getPaintGame } from './nbaPaintData'
import { getNbaOddsGame } from './nbaOddsClockData'
import { nbaPhaseBoundary } from './nbaOddsPhaseData'
import { nbaGameStart,nbaQuoteInMode,type NbaOddsMode } from './nbaOddsMode'

export async function getNbaFirstBasketState(gameId:number,mode:NbaOddsMode='pregame'):Promise<NbaFirstState> {
  const game=await getNbaOddsGame(await getPaintGame(gameId)),boundary=nbaPhaseBoundary(game,mode),start=nbaGameStart(game)!
  return (await nbaSharedCache('first-basket-state:v2:'+boundary.key,60,0,async()=>{
    const {data,error}=await createAdminClient().rpc('read_nba_phase_first_state',{p_game_id:gameId,p_mode:mode,p_tipoff:boundary.tipoff}).abortSignal(AbortSignal.timeout(12000))
    if(error || !data || !Array.isArray(data.frames) || data.frames.length>2 || !Number.isSafeInteger(data.captures)) throw new Error('First-basket history unavailable')
    return {...data,frames:(data as NbaFirstState).frames.map(frame=>{
      const at=Date.parse(frame.captured_at)
      if(!Number.isFinite(at)||at>Date.now()||(mode==='pregame'?at>=start:at<start))throw new Error('Invalid First Basket capture phase')
      return {...frame,props:frame.props.filter(prop=>prop.game_id===gameId&&nbaQuoteInMode(prop,game,mode,at))}
    })} as NbaFirstState
  },25)).value
}
export async function attachNbaFirstBasketHistory(gameId:number,rows:FirstBasketRow[],observedAt?:string,mode:NbaOddsMode='pregame') {
  const [openings,state]=await Promise.all([getNbaQuoteOpenings(gameId,mode),getNbaFirstBasketState(gameId,mode)])
  const asOf=observedAt?Date.parse(observedAt):Date.now()
  return nbaFirstMovements(rows,openings,state,Number.isFinite(asOf)?asOf:Date.now())
}
