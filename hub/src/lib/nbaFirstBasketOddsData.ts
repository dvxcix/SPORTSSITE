import 'server-only'
import { nbaRosterPortraits } from './nbaPlayerPortraits'
import { artwork, getPaintRoster, getPaintFinalStats, getPaintIdentity, getPaintMarketIds, getPaintSavedMarketRoster } from './nbaPaintData'
import { type PaintGame, type PaintPlayer, type PaintRoster } from './nbaPaint'
import { nbaFirstEvent, nbaNormalizeFirstOdds, type FirstOddsEvent, type FirstBasketRow } from './nbaFirstBasketOdds'
import { nbaSharedCache } from './nbaSharedCache'
import { getNbaPhaseSnapshot } from './nbaOddsPhaseData'
import { getNbaOddsGame } from './nbaOddsClockData'
import { nbaGameFinal, nbaGameStart, nbaLiveOpen, nbaPregameOpen, nbaQuoteInMode, type NbaOddsMode } from './nbaOddsMode'
import { getNbaBookFirstSupplement } from './nbaBookFirstData'
import { createAdminClient } from './supabase/admin'
import { nbaReadFirstOddsResponse, NbaFirstOddsUnavailable } from './nbaFirstEventDiagnostics'
import { nbaFirstBookMarkets } from './nbaFirstBookMarkets'
export { NbaFirstOddsUnavailable } from './nbaFirstEventDiagnostics'

const BASE='https://api.the-odds-api.com/v4/sports/basketball_nba'
async function odds<T>(path:string, classifyEventTransport=false):Promise<T>{
  const key=process.env.ODDS_API_KEY?.trim()
  if(!key)throw new NbaFirstOddsUnavailable('connection')
  const url=new URL(BASE+path);url.searchParams.set('apiKey',key)
  return nbaReadFirstOddsResponse<T>(()=>fetch(url,{cache:'no-store',signal:AbortSignal.timeout(12000)}),classifyEventTransport)
}
export async function getNbaFirstEvents(fresh=false,classifyEventTransport=false){
  const load=async()=>{
  const events=await odds<FirstOddsEvent[]>('/events',classifyEventTransport)
  if(!Array.isArray(events))throw new NbaFirstOddsUnavailable('upstream')
  return events
  }
  return fresh?load():(await nbaSharedCache('first-basket-events:v1',60,0,load,25)).value
}
export async function getNbaFirstOdds(game:PaintGame,fresh=false,slateEvents?:FirstOddsEvent[]){
  if(!fresh)return freshBookRows((await nbaSharedCache(`first-basket-prices:v6:${game.id}`,60,0,()=>loadNbaFirstOdds(game,false,slateEvents),60)).value)
  return freshBookRows(await loadNbaFirstOdds(game,true,slateEvents))
}
/** Recheck observations at every aggregate-cache return. Frozen phase history is
 * intentionally excluded: a saved pregame close remains available after tipoff. */
function freshBookRows<T extends {rows:FirstBasketRow[];captureComplete?:boolean}>(result:T):T {
  const now=Date.now()
  const rows=result.rows.filter(row=>Date.parse(row.offer.updated_at)<=now&&now-Date.parse(row.offer.updated_at)<=300_000)
  return rows.length===result.rows.length?result:{...result,rows,captureComplete:false}
}
export async function getNbaFirstOddsForMode(game:PaintGame, mode:NbaOddsMode='pregame') {
  game=await getNbaOddsGame(game)
  const empty = () => ({rows:[] as import('./nbaFirstBasketOdds').FirstBasketRow[],unmatched:0,eventMatched:false,observedAt:new Date().toISOString()})
  const frozen = async () => {
    const snapshot=await getNbaPhaseSnapshot(game,mode)
    if(!snapshot.firstBasket.length)return {...empty(),frozen:true,eventMatched:snapshot.available.firstBasket,observedAt:snapshot.capturedAt.firstBasket??new Date().toISOString()}
    const teams=[game.home_team,game.visitor_team]
    const [saved,images]=await Promise.all([
      getPaintSavedMarketRoster(game),
      Promise.all(teams.map(team=>artwork(team.abbreviation).catch(()=>({headshots:new Map<string,string|null>()})))),
    ])
    const roster=saved??await getFrozenFirstRoster(game,[...new Set(snapshot.firstBasket.map(offer=>offer.player_id))])
    const portraits=new Map(teams.map((team,index)=>[team.id,nbaRosterPortraits(roster.filter(player=>player.team.id===team.id),images[index]?.headshots??new Map())]))
    const eligible=saved?new Set(roster.map(player=>player.id)):null
    const offers=eligible?snapshot.firstBasket.filter(offer=>eligible.has(offer.player_id)):snapshot.firstBasket
    const rows=offers.flatMap(offer=>{
      const player=roster.find(player=>player.id===offer.player_id)
      return player?[{game,offer,player:{id:player.id,first_name:player.first_name,last_name:player.last_name,team:player.team,position:player.position,headshot:portraits.get(player.team.id)?.get(player.id)??null}}]:[]
    })
    return {rows,frozen:true,unmatched:offers.length-rows.length,eventMatched:snapshot.available.firstBasket,observedAt:snapshot.capturedAt.firstBasket??new Date().toISOString()}
  }
  if(mode==='pregame'&&!nbaPregameOpen(game))return frozen()
  if(mode==='live'&&!nbaLiveOpen(game))return nbaGameFinal(game)?frozen():empty()
  const [cached,eligible]=await Promise.all([nbaSharedCache(`first-basket-phase-prices:v5:${mode}:${game.id}:${nbaGameStart(game)}`,30,0,async()=>{
    const result=await loadNbaFirstOdds(game,false)
    return {...result,rows:result.rows.filter(row=>nbaQuoteInMode(row.offer,game,mode))}
  },60),getPaintMarketIds(game,mode)])
  if(mode==='pregame'&&!nbaPregameOpen(game))return frozen()
  if(mode==='live'&&!nbaLiveOpen(game))return empty()
  return freshBookRows({...cached.value,rows:cached.value.rows.filter(row=>eligible?.has(row.player.id))})
}
async function getFrozenFirstRoster(game:PaintGame,playerIds:number[]) {
  const tip=nbaGameStart(game)
  if(tip==null)return []
  const cutoff=new Date(tip).toISOString()
  const teams=[game.home_team,game.visitor_team]
  const stats=nbaGameFinal(game)?await getPaintFinalStats(game.id).then(result=>result.rows).catch(()=>[]):[]
  const roster=new Map<number,PaintRoster>()
  for(const row of stats) {
    const team=teams.find(candidate=>candidate.id===row.team.id)
    const {id,first_name,last_name,position}=row.player
    if(playerIds.includes(id)&&team&&first_name?.trim()&&last_name?.trim())roster.set(id,{id,first_name,last_name,position:position??'',team})
  }
  // For an old DNP, an original game-scoped roster observation can prove
  // the team. The current player directory supplies only a name and position.
  await Promise.all(playerIds.filter(id=>!roster.has(id)).map(async id=>{
    const teamId=await nbaSharedCache(`first-basket-roster-team:v2:${game.id}:${id}:${cutoff}`,300,0,async()=>{
      const {data,error}=await createAdminClient().from('nba_research_snapshots').select('team_id')
        .eq('game_id',game.id).eq('player_id',id).lt('captured_at',cutoff).order('captured_at',{ascending:false}).order('id',{ascending:false})
        .limit(1).abortSignal(AbortSignal.timeout(12000)).maybeSingle()
      if(error)throw new Error('First Basket historical roster unavailable')
      return data?.team_id??null
    },25).then(result=>result.value).catch(()=>null)
    const team=teams.find(candidate=>candidate.id===teamId)
    if(!team)return
    const player=await getPaintIdentity(id).catch(()=>null)
    if(player?.id===id&&player.first_name?.trim()&&player.last_name?.trim())roster.set(id,{...player,team})
  }))
  return [...roster.values()]
}
async function loadNbaFirstOdds(game:PaintGame,fresh:boolean,slateEvents?:FirstOddsEvent[]){
  const events=slateEvents??await getNbaFirstEvents(fresh)
  const match=nbaFirstEvent(events,game)
  const teams=[game.home_team,game.visitor_team]
  const [event,roster,images]=await Promise.all([
    match?nbaSharedCache(`first-api:v1:${nbaPregameOpen(game)?'pregame':'live'}:${game.id}:${nbaGameStart(game)}`,60,0,()=>odds<FirstOddsEvent>(`/events/${encodeURIComponent(match.id)}/odds?bookmakers=fanduel,draftkings,betmgm,williamhill_us,fanatics&markets=player_first_basket,player_first_team_basket,player_method_of_first_basket&oddsFormat=american`),25).then(result=>result.value):Promise.resolve(null),
    getPaintRoster(game),
    fresh?Promise.resolve([]):Promise.all(teams.map(team=>artwork(team.abbreviation).catch(()=>({headshots:new Map<string,string|null>()})))),
  ])
  if(event&&event.id!==match?.id)throw new NbaFirstOddsUnavailable('upstream')
  const portraits=new Map(teams.map((team,index)=>[team.id,nbaRosterPortraits(roster.filter(player=>player.team.id===team.id),images[index]?.headshots??new Map())]))
  const players=roster.map(p=>({...p,headshot:portraits.get(p.team.id)?.get(p.id)??null,average:{},logs:[],props:[],injury:null})) as PaintPlayer[]
  const result = event?nbaNormalizeFirstOdds(event,game,players):{rows:[],unmatched:0}
  const scoped = event?nbaFirstBookMarkets(event,game,players,nbaPregameOpen(game)?'pregame':'live'):{frames:[],coverage:[]}
  const safeOffers=scoped.frames.flatMap(frame=>frame.props)
  const safeRows=result.rows.filter(row=>safeOffers.includes(row.offer)||safeOffers.some(offer=>offer.id===row.offer.id&&offer.updated_at===row.offer.updated_at))
  const supplement = await getNbaBookFirstSupplement(game,safeRows.map(row=>row.offer),fresh)
  const retained = supplement.retainedPrimary ? new Set(supplement.retainedPrimary) : null
  const added = supplement.props.flatMap(offer=>{
    const player=players.find(player=>player.id===offer.player_id)
    return player?[{game,player:{id:player.id,first_name:player.first_name,last_name:player.last_name,team:player.team,position:player.position,headshot:player.headshot},offer}]:[]
  })
  return {...result,rows:[...safeRows.filter(row=>!retained||retained.has(row.offer)),...added],apiFrames:scoped.frames,bookCoverage:scoped.coverage,captureComplete:supplement.complete&&added.length===supplement.props.length&&safeRows.length===result.rows.length,eventMatched:!!match||added.length>0,observedAt:new Date().toISOString()}
}
