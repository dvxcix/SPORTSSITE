import 'server-only'
import { artwork, getPaintRoster, getPaintFinalStats, getPaintIdentity } from './nbaPaintData'
import { nbaName, type PaintGame, type PaintPlayer, type PaintRoster } from './nbaPaint'
import { nbaFirstEvent, nbaNormalizeFirstOdds, type FirstOddsEvent, type FirstBasketRow } from './nbaFirstBasketOdds'
import { nbaSharedCache } from './nbaSharedCache'
import { getNbaPhaseSnapshot } from './nbaOddsPhaseData'
import { getNbaOddsGame } from './nbaOddsClockData'
import { nbaGameFinal, nbaGameStart, nbaLiveOpen, nbaPregameOpen, nbaQuoteInMode, type NbaOddsMode } from './nbaOddsMode'
import { createAdminClient } from './supabase/admin'
import { getNbaBookFirstSupplement } from './nbaBookFirstData'

const BASE='https://api.the-odds-api.com/v4/sports/basketball_nba'
export class NbaFirstOddsUnavailable extends Error {constructor(public reason:'connection'|'authorization'|'quota'|'upstream'){super('First-basket odds unavailable')}}
async function odds<T>(path:string):Promise<T>{
  const key=process.env.ODDS_API_KEY?.trim()
  if(!key)throw new NbaFirstOddsUnavailable('connection')
  const url=new URL(BASE+path);url.searchParams.set('apiKey',key)
  const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(12000)})
  if(!response.ok)throw new NbaFirstOddsUnavailable(response.status===401||response.status===403?'authorization':response.status===429?'quota':'upstream')
  return response.json() as Promise<T>
}
export async function getNbaFirstEvents(fresh=false){
  const load=async()=>{
  const events=await odds<FirstOddsEvent[]>('/events')
  if(!Array.isArray(events))throw new NbaFirstOddsUnavailable('upstream')
  return events
  }
  return fresh?load():(await nbaSharedCache('first-basket-events:v1',60,0,load,25)).value
}
export async function getNbaFirstOdds(game:PaintGame,fresh=false,slateEvents?:FirstOddsEvent[]){
  if(!fresh)return freshBookRows((await nbaSharedCache(`first-basket-prices:v5:${game.id}`,60,0,()=>loadNbaFirstOdds(game,false,slateEvents),60)).value)
  return freshBookRows(await loadNbaFirstOdds(game,true,slateEvents))
}
/** Recheck observations at every aggregate-cache return. Frozen phase history is
 * intentionally excluded: a saved pregame close remains available after tipoff. */
function freshBookRows<T extends {rows:FirstBasketRow[];captureComplete?:boolean}>(result:T):T {
  const now=Date.now()
  const rows=result.rows.filter(row=>row.offer.id>-3_000_000_000_000
    || (Date.parse(row.offer.updated_at)<=now&&now-Date.parse(row.offer.updated_at)<=300_000))
  return rows.length===result.rows.length?result:{...result,rows,captureComplete:false}
}
export async function getNbaFirstOddsForMode(game:PaintGame, mode:NbaOddsMode='pregame') {
  game=await getNbaOddsGame(game)
  const empty = () => ({rows:[] as import('./nbaFirstBasketOdds').FirstBasketRow[],unmatched:0,eventMatched:false,observedAt:new Date().toISOString()})
  const frozen = async () => {
    const snapshot=await getNbaPhaseSnapshot(game,mode)
    if(!snapshot.firstBasket.length)return {...empty(),eventMatched:snapshot.available.firstBasket,observedAt:snapshot.capturedAt.firstBasket??new Date().toISOString()}
    const teams=[game.home_team,game.visitor_team]
    const [roster,images]=await Promise.all([
      getFrozenFirstRoster(game,[...new Set(snapshot.firstBasket.map(offer=>offer.player_id))]),
      Promise.all(teams.map(team=>artwork(team.abbreviation).catch(()=>({headshots:new Map<string,string|null>()})))),
    ])
    const rows=snapshot.firstBasket.flatMap(offer=>{
      const player=roster.find(player=>player.id===offer.player_id)
      return player?[{game,offer,player:{id:player.id,first_name:player.first_name,last_name:player.last_name,team:player.team,position:player.position,headshot:images[teams.findIndex(team=>team.id===player.team.id)]?.headshots.get(nbaName(`${player.first_name} ${player.last_name}`))??null}}]:[]
    })
    return {rows,unmatched:snapshot.firstBasket.length-rows.length,eventMatched:snapshot.available.firstBasket,observedAt:snapshot.capturedAt.firstBasket??new Date().toISOString()}
  }
  if(mode==='pregame'&&!nbaPregameOpen(game))return frozen()
  if(mode==='live'&&!nbaLiveOpen(game))return nbaGameFinal(game)?frozen():empty()
  const cached=await nbaSharedCache(`first-basket-phase-prices:v4:${mode}:${game.id}:${nbaGameStart(game)}`,30,0,async()=>{
    const result=await loadNbaFirstOdds(game,false)
    return {...result,rows:result.rows.filter(row=>nbaQuoteInMode(row.offer,game,mode))}
  },60)
  if(mode==='pregame'&&!nbaPregameOpen(game))return frozen()
  return freshBookRows(cached.value)
}
async function getFrozenFirstRoster(game:PaintGame,playerIds:number[]) {
  const teams=[game.home_team,game.visitor_team],final=nbaGameFinal(game)
  const [active,stats]=await Promise.all([
    getPaintRoster(game).catch(()=>[]),
    final?getPaintFinalStats(game.id).then(result=>result.rows).catch(()=>[]):Promise.resolve([]),
  ])
  const roster=new Map<number,PaintRoster>(),played=new Set<number>()
  for(const player of active)if(playerIds.includes(player.id)&&player.first_name?.trim()&&player.last_name?.trim()) {
    const team=teams.find(team=>team.id===player.team?.id)
    if(team)roster.set(player.id,{...player,team})
  }
  for(const row of stats) {
    const team=teams.find(team=>team.id===row.team.id)
    if(playerIds.includes(row.player.id)&&team&&row.player.first_name?.trim()&&row.player.last_name?.trim()) {
      roster.set(row.player.id,{...row.player,first_name:row.player.first_name,last_name:row.player.last_name,position:row.player.position??'',team})
      played.add(row.player.id)
    }
  }
  await Promise.all(playerIds.filter(id=>final?!played.has(id):!roster.has(id)).map(async id=>{
    const [player,historicalTeam]=await Promise.all([
      roster.get(id)??getPaintIdentity(id).catch(()=>null),
      final?nbaSharedCache(`first-basket-roster-team:v1:${game.id}:${id}`,300,0,async()=>{
        const {data,error}=await createAdminClient().from('nba_research_snapshots').select('team_id')
          .eq('game_id',game.id).eq('player_id',id).order('captured_at',{ascending:false}).order('id',{ascending:false})
          .limit(1).abortSignal(AbortSignal.timeout(12000)).maybeSingle()
        if(error)throw new Error('First Basket historical roster unavailable')
        return data?.team_id??null
      },25).then(result=>result.value).catch(()=>null):Promise.resolve(null),
    ])
    const team=teams.find(team=>team.id===(historicalTeam??player?.team?.id))
    if(player?.id===id&&player.first_name?.trim()&&player.last_name?.trim()&&team)roster.set(id,{...player,team})
    else roster.delete(id)
  }))
  return [...roster.values()]
}
async function loadNbaFirstOdds(game:PaintGame,fresh:boolean,slateEvents?:FirstOddsEvent[]){
  const events=slateEvents??await getNbaFirstEvents(fresh)
  const match=nbaFirstEvent(events,game)
  const teams=[game.home_team,game.visitor_team]
  const [event,roster,images]=await Promise.all([
    match?odds<FirstOddsEvent>(`/events/${encodeURIComponent(match.id)}/odds?bookmakers=fanduel,draftkings,betmgm,williamhill_us,fanatics&markets=player_first_basket,player_first_team_basket,player_method_of_first_basket&oddsFormat=american`):Promise.resolve(null),
    getPaintRoster(game),
    fresh?Promise.resolve([]):Promise.all(teams.map(team=>artwork(team.abbreviation).catch(()=>({headshots:new Map<string,string|null>()})))),
  ])
  if(event&&event.id!==match?.id)throw new NbaFirstOddsUnavailable('upstream')
  const players=roster.map(p=>({...p,headshot:images[teams.findIndex(team=>team.id===p.team.id)]?.headshots.get(nbaName(`${p.first_name} ${p.last_name}`))??null,average:{},logs:[],props:[],injury:null})) as PaintPlayer[]
  const result = event?nbaNormalizeFirstOdds(event,game,players):{rows:[],unmatched:0}
  const supplement = await getNbaBookFirstSupplement(game,result.rows.map(row=>row.offer),fresh)
  const retained = supplement.retainedPrimary ? new Set(supplement.retainedPrimary) : null
  const added = supplement.props.flatMap(offer=>{
    const player=players.find(player=>player.id===offer.player_id)
    return player?[{game,player:{id:player.id,first_name:player.first_name,last_name:player.last_name,team:player.team,position:player.position,headshot:player.headshot},offer}]:[]
  })
  return {...result,rows:[...result.rows.filter(row=>!retained||retained.has(row.offer)),...added],captureComplete:supplement.complete&&added.length===supplement.props.length,eventMatched:!!match||added.length>0,observedAt:new Date().toISOString()}
}
