import 'server-only'
import { createHash } from 'node:crypto'
import { createAdminClient } from './supabase/admin'
import { nbaSharedCache } from './nbaSharedCache'
import { nflKickoffAt } from '@/app/the-sideline/kickoff'
import type { SidelineGame } from '@/app/the-sideline/types'

export type NflOddsBoardClock={id:string;cutoff:string|null}
export const nflOddsBoardHash=(value:string)=>createHash('sha256').update(value).digest('hex')
export function nflOddsBoardSignature(clocks:NflOddsBoardClock[],now:number){return clocks.map(clock=>`${clock.id}:${clock.cutoff??'missing'}:${clock.cutoff&&Date.parse(clock.cutoff)<=now?'closed':'open'}`).join('|')}
export function nflOddsBoardClockToken(clocks:NflOddsBoardClock[],now=Date.now()){return nflOddsBoardHash(nflOddsBoardSignature(clocks,now))}

/** One exact-count schedule read and one bounded exact-count durable-clock
 * read. Missing games, ambiguous teams and truncated results fail closed. */
export async function readNflOddsBoardClocks(date:string,games:SidelineGame[]):Promise<NflOddsBoardClock[]> {
  const admin=createAdminClient(),ids=games.map(game=>game.id)
  const schedule=await admin.from('nfl_schedule').select('game_id,gameday,gametime,away_team,home_team',{count:'exact'}).eq('gameday',date).limit(25).abortSignal(AbortSignal.timeout(10000))
  if(schedule.error||schedule.count==null||schedule.count!==games.length||schedule.data?.length!==schedule.count||schedule.count>24)throw new Error('Schedule unavailable')
  if(!ids.length)return []
  const records=await admin.from('nfl_pregame_research').select('game_id,kickoff_at',{count:'exact'}).in('game_id',ids).limit(1000).abortSignal(AbortSignal.timeout(10000))
  if(records.error||records.count==null||records.data?.length!==records.count||records.count>1000)throw new Error('Clock unavailable')
  return games.map(game=>{
    const matches=schedule.data!.filter(row=>row.game_id===game.id)
    if(matches.length!==1||matches[0].away_team!==game.away.abbr||matches[0].home_team!==game.home.abbr)throw new Error('Schedule changed')
    const live=nflKickoffAt({gameday:matches[0].gameday,gametime:matches[0].gametime})?.getTime(),original=nflKickoffAt(game)?.getTime()
    const related=records.data!.filter(row=>row.game_id===game.id)
    if(related.some(row=>!Number.isFinite(Date.parse(row.kickoff_at))))throw new Error('Clock unavailable')
    if(live==null||original==null)throw new Error('Clock unavailable')
    if(!related.length)return {id:game.id,cutoff:null}
    return {id:game.id,cutoff:new Date(Math.min(live,original,...related.map(row=>Date.parse(row.kickoff_at)))).toISOString()}
  }).sort((a,b)=>a.id.localeCompare(b.id))
}

/** The existing shared cache has a bounded 10s local L1 and a leased L2.
 * Token validation never extends a cached entry's real expiry. */
export async function sharedNflOddsBoardClocks(date:string,games:SidelineGame[]){
  const key=nflOddsBoardHash(JSON.stringify(games.map(game=>[game.id,game.gameday,game.gametime]).sort()))
  return (await nbaSharedCache(`nfl:odds-board-clock:v4:${date}:${key}`,15,0,async()=>{
    const observedAt=new Date().toISOString()
    return {clocks:await readNflOddsBoardClocks(date,games),observedAt}
  },45)).value
}
