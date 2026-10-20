import 'server-only'
import { createAdminClient } from './supabase/admin'
import { nbaSharedCache } from './nbaSharedCache'
import type { NbaQuoteOpeningRow } from './nbaOddsHistory'
import type { PaintFrame } from './nbaMovement'
import { nbaFirstMarket } from './nbaFirstBasketMarkets'
import { getPaintGame } from './nbaPaintData'
import { getNbaOddsGame } from './nbaOddsClockData'
import { getNbaPhaseFrames,nbaPhaseBoundary } from './nbaOddsPhaseData'
import { nbaGameStart,type NbaOddsMode } from './nbaOddsMode'

/** Phase-specific first/latest frames retain successful empty withdrawals. */
export async function getNbaMarketFrames(gameId:number,market:string,playerId:number|null=null,mode:NbaOddsMode='pregame'):Promise<PaintFrame[]> {
  const frames=await getNbaPhaseFrames(await getPaintGame(gameId),mode,nbaFirstMarket(market)?'first':'props')
  return frames.map(frame=>({captured_at:frame.captured_at,props:frame.quotes.filter((quote):quote is import('./nbaPaint').PaintProp=>'prop_type' in quote && quote.prop_type===market && (playerId==null || quote.player_id===playerId))}))
}
export async function getNbaAllMarketFrames(gameId:number,mode:NbaOddsMode='pregame'):Promise<(PaintFrame&{fingerprint:string})[]> {
  return (await getNbaPhaseFrames(await getPaintGame(gameId),mode,'props')).map(frame=>({captured_at:frame.captured_at,props:frame.quotes as import('./nbaPaint').PaintProp[],fingerprint:frame.fingerprint}))
}
/** Shared sports inputs only. A verified game start bounds both phases. */
export async function getNbaQuoteOpenings(gameId:number,mode:NbaOddsMode='pregame'):Promise<NbaQuoteOpeningRow[]> {
  const game=await getNbaOddsGame(await getPaintGame(gameId)),boundary=nbaPhaseBoundary(game,mode),start=nbaGameStart(game)!
  return (await nbaSharedCache('quote-openings:v2:'+boundary.key,60,0,async()=>{
    const {data,error}=await createAdminClient().rpc('read_nba_phase_openings',{p_game_id:gameId,p_mode:mode,p_tipoff:boundary.tipoff}).abortSignal(AbortSignal.timeout(12000))
    if(error || !Array.isArray(data)) throw new Error('NBA price history unavailable')
    return (data as NbaQuoteOpeningRow[]).filter(row=>{const at=Date.parse(row.observed_at);return row.game_id===gameId && Number.isFinite(at) && at<=Date.now() && (mode==='pregame'?at<start:at>=start)})
  },25)).value
}
