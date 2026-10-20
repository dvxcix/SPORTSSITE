import 'server-only'
import { artwork, getPaintRoster } from './nbaPaintData'
import { nbaName, type PaintGame, type PaintPlayer } from './nbaPaint'
import { nbaFirstEvent, nbaNormalizeFirstOdds, type FirstOddsEvent } from './nbaFirstBasketOdds'
import { nbaSharedCache } from './nbaSharedCache'

const BASE='https://api.the-odds-api.com/v4/sports/basketball_nba'
export class NbaFirstOddsUnavailable extends Error {constructor(public reason:'connection'|'authorization'|'quota'|'upstream'){super('First-basket odds unavailable')}}
async function odds<T>(path:string,fresh:boolean):Promise<T>{
  const key=process.env.ODDS_API_KEY?.trim()
  if(!key)throw new NbaFirstOddsUnavailable('connection')
  const url=new URL(BASE+path);url.searchParams.set('apiKey',key)
  const response=await fetch(url,{...(fresh?{cache:'no-store' as const}:{next:{revalidate:60}}),signal:AbortSignal.timeout(12000)})
  if(!response.ok)throw new NbaFirstOddsUnavailable(response.status===401||response.status===403?'authorization':response.status===429?'quota':'upstream')
  return response.json() as Promise<T>
}
export async function getNbaFirstEvents(fresh=false){
  const events=await odds<FirstOddsEvent[]>('/events',fresh)
  if(!Array.isArray(events))throw new NbaFirstOddsUnavailable('upstream')
  return events
}
export async function getNbaFirstOdds(game:PaintGame,fresh=false,slateEvents?:FirstOddsEvent[]){
  if(!fresh)return (await nbaSharedCache(`first-basket-prices:v1:${game.id}`,60,0,()=>loadNbaFirstOdds(game,false,slateEvents),40)).value
  return loadNbaFirstOdds(game,true,slateEvents)
}
async function loadNbaFirstOdds(game:PaintGame,fresh:boolean,slateEvents?:FirstOddsEvent[]){
  const events=slateEvents??await getNbaFirstEvents(fresh)
  const match=nbaFirstEvent(events,game)
  if(!match)return {rows:[],unmatched:0,eventMatched:false,observedAt:new Date().toISOString()}
  const teams=[game.home_team,game.visitor_team]
  const [event,roster,images]=await Promise.all([
    odds<FirstOddsEvent>(`/events/${encodeURIComponent(match.id)}/odds?bookmakers=fanduel,draftkings,betmgm,williamhill_us,fanatics&markets=player_first_basket,player_first_team_basket,player_method_of_first_basket&oddsFormat=american`,fresh),
    getPaintRoster(game),
    fresh?Promise.resolve([]):Promise.all(teams.map(team=>artwork(team.abbreviation).catch(()=>({headshots:new Map<string,string|null>()})))),
  ])
  if(event.id!==match.id)throw new NbaFirstOddsUnavailable('upstream')
  const players=roster.map(p=>({...p,headshot:images[teams.findIndex(team=>team.id===p.team.id)]?.headshots.get(nbaName(`${p.first_name} ${p.last_name}`))??null,average:{},logs:[],props:[],injury:null})) as PaintPlayer[]
  return {...nbaNormalizeFirstOdds(event,game,players),eventMatched:true,observedAt:new Date().toISOString()}
}
