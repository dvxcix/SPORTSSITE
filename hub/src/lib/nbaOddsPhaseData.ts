import 'server-only'
import { createAdminClient } from './supabase/admin'
import { nbaSharedCache } from './nbaSharedCache'
import { getNbaOddsGame } from './nbaOddsClockData'
import { nbaGameStart, nbaQuoteInMode, type NbaOddsMode } from './nbaOddsMode'
import type { PaintGame, PaintGameOdds, PaintProp } from './nbaPaint'

export type NbaPhaseFeed = 'props' | 'game' | 'first'
export type NbaPhaseFrame = { captured_at: string; quotes: (PaintProp | PaintGameOdds)[]; fingerprint: string }
export type NbaPhaseSnapshot = {
  mode: NbaOddsMode; gameId: number; cutoffAt: string; observedAt: string | null
  props: PaintProp[]; gameOdds: PaintGameOdds[]; firstBasket: PaintProp[]
  capturedAt: { props: string | null; gameOdds: string | null; firstBasket: string | null }
  available: { props: boolean; gameOdds: boolean; firstBasket: boolean }
}
export function nbaPhaseBoundary(game: PaintGame, mode: NbaOddsMode) {
  const start = nbaGameStart(game)
  if (start == null || !['pregame','live'].includes(mode)) throw new Error('Verified NBA phase required')
  const tipoff = new Date(start).toISOString()
  return { tipoff, key: mode + ':' + game.id + ':' + tipoff + ':' + (Date.now() >= start ? 'closed' : 'open') }
}
function validFrame(frame: NbaPhaseFrame, game: PaintGame, mode: NbaOddsMode) {
  const observed = Date.parse(frame.captured_at), start = nbaGameStart(game)!
  if (!Number.isFinite(observed) || observed > Date.now() || (mode === 'pregame' ? observed >= start : observed < start) || !Array.isArray(frame.quotes)) throw new Error('Invalid NBA phase capture')
  return { ...frame, quotes: frame.quotes.filter(quote => (quote.game_id == null || quote.game_id === game.id) && nbaQuoteInMode(quote, game, mode, observed)) }
}
export type NbaFrameScope = { market?: string; playerId?: number | null; selection?: 'history' | 'edges' | 'latest'; asOf?: string }
export async function getNbaPhaseFrames(input: PaintGame, mode: NbaOddsMode = 'pregame', feed: NbaPhaseFeed = 'props', scope: NbaFrameScope = {}): Promise<NbaPhaseFrame[]> {
  const game = await getNbaOddsGame(input)
  const boundary = nbaPhaseBoundary(game, mode)
  const selection = scope.selection ?? 'history', maximum = selection === 'latest' ? 1 : selection === 'edges' ? 2 : 96
  const asOf = scope.asOf == null ? null : Date.parse(scope.asOf)
  if (asOf != null && (!Number.isFinite(asOf) || asOf > Date.now())) throw new Error('Invalid NBA history cutoff')
  const load = async () => {
    const { data,error } = await createAdminClient().rpc('read_nba_phase_frames_scoped',{
      p_game_id:game.id,p_mode:mode,p_feed:feed,p_tipoff:boundary.tipoff,
      p_selection:selection,p_market:scope.market??null,p_player_id:scope.playerId??null,p_as_of:scope.asOf??null,
    }).abortSignal(AbortSignal.timeout(12000))
    if(error || !Array.isArray(data) || data.length>maximum) throw new Error('NBA phase history unavailable')
    return (data as NbaPhaseFrame[]).map(frame=>{
      if (asOf != null && Date.parse(frame.captured_at)>asOf) throw new Error('Invalid NBA history cutoff')
      const valid=validFrame(frame,game,mode)
      return {...valid,quotes:valid.quotes.filter(quote=>(!scope.market || 'prop_type' in quote && quote.prop_type===scope.market) && (scope.playerId==null || 'player_id' in quote && quote.player_id===scope.playerId))}
    })
  }
  // Explicit historical cutoffs are already coalesced by market-context's cache.
  // Do not create one persisted cache row for every request timestamp.
  if(scope.asOf != null) return load()
  return (await nbaSharedCache('phase-frames:v2:' + boundary.key + ':' + feed + ':' + selection + ':' + (scope.market??'all') + ':' + (scope.playerId??'all'),60,0,load,25)).value
}
export async function getNbaPhaseSnapshot(input: PaintGame, mode: NbaOddsMode = 'pregame'): Promise<NbaPhaseSnapshot> {
  const game = await getNbaOddsGame(input)
  const boundary = nbaPhaseBoundary(game,mode)
  return (await nbaSharedCache('phase-snapshot:v1:' + boundary.key,60,0,async()=>{
    const { data,error } = await createAdminClient().rpc('read_nba_phase_snapshot',{p_game_id:game.id,p_mode:mode,p_tipoff:boundary.tipoff}).abortSignal(AbortSignal.timeout(12000))
    if(error || !Array.isArray(data) || data.length>3) throw new Error('NBA phase snapshot unavailable')
    const frames = new Map<NbaPhaseFeed,NbaPhaseFrame>()
    for(const source of data as (NbaPhaseFrame & {feed:NbaPhaseFeed})[]) {
      if(!['props','game','first'].includes(source.feed) || frames.has(source.feed)) throw new Error('Invalid NBA snapshot feeds')
      frames.set(source.feed,validFrame(source,game,mode))
    }
    const props=frames.get('props'),gameOdds=frames.get('game'),first=frames.get('first')
    const times=[...frames.values()].map(frame=>frame.captured_at).sort()
    return {mode,gameId:game.id,cutoffAt:boundary.tipoff,observedAt:times.at(-1)??null,
      props:(props?.quotes??[]) as PaintProp[],gameOdds:(gameOdds?.quotes??[]) as PaintGameOdds[],firstBasket:(first?.quotes??[]) as PaintProp[],
      capturedAt:{props:props?.captured_at??null,gameOdds:gameOdds?.captured_at??null,firstBasket:first?.captured_at??null},
      available:{props:!!props,gameOdds:!!gameOdds,firstBasket:!!first}}
  },25)).value
}
