import 'server-only'
import { getPaintRoster } from './nbaPaintData'
import type { PaintGame, PaintPlayer } from './nbaPaint'
import { nbaFirstEvent, nbaNormalizeFirstOdds, type FirstOddsEvent } from './nbaFirstBasketOdds'

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
export async function getNbaFirstOdds(game:PaintGame,fresh=false){
  const events=await odds<FirstOddsEvent[]>('/events',fresh)
  if(!Array.isArray(events))throw new NbaFirstOddsUnavailable('upstream')
  const match=nbaFirstEvent(events,game)
  if(!match)return {rows:[],unmatched:0,eventMatched:false}
  const [event,roster]=await Promise.all([
    odds<FirstOddsEvent>(`/events/${encodeURIComponent(match.id)}/odds?bookmakers=fanduel,draftkings,betmgm,williamhill_us,fanatics&markets=player_first_basket,player_first_team_basket,player_method_of_first_basket&oddsFormat=american`,fresh),
    getPaintRoster(game),
  ])
  if(event.id!==match.id)throw new NbaFirstOddsUnavailable('upstream')
  const players=roster.map(p=>({...p,headshot:null,average:{},logs:[],props:[],injury:null})) as PaintPlayer[]
  return {...nbaNormalizeFirstOdds(event,game,players),eventMatched:true}
}
