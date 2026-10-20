import 'server-only'
import { bdlHeaders } from './balldontlie'
import type { NbaPlay } from './nbaShots'
import type { NbaFirstFacts } from './nbaFirstBasketSettlement'
export async function getNbaFirstFacts(game:number):Promise<NbaFirstFacts>{
  const read=async(path:string)=>{
    const response=await fetch(`https://api.balldontlie.io${path}`,{headers:bdlHeaders,cache:'no-store',signal:AbortSignal.timeout(12000)})
    if(!response.ok)throw new Error('NBA first-event facts unavailable')
    const body=await response.json();if(!Array.isArray(body.data)||body.meta?.next_cursor!=null)throw new Error('NBA first-event facts incomplete')
    return body.data
  }
  const [plays,lineups]=await Promise.all([read(`/v1/plays?game_id=${game}`),read(`/v1/lineups?game_ids[]=${game}&per_page=100`)])
  if(plays.some((p:NbaPlay)=>p.game_id!==game||!Array.isArray(p.participants)||!Number.isSafeInteger(p.order))||lineups.some((p:{game?:{id:number}})=>p.game?.id!=null&&p.game.id!==game))throw new Error('NBA first-event identity mismatch')
  const starters:number[]=[...new Set<number>(lineups.filter((p:{starter:boolean})=>p.starter===true).map((p:{player:{id:number}})=>p.player.id))]
  return {plays,starters,complete:starters.length===10}
}
