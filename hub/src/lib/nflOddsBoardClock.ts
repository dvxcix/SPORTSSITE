import 'server-only'
import { createHash } from 'node:crypto'
import { createAdminClient } from './supabase/admin'
import { nbaSharedCache } from './nbaSharedCache'
import { nflMatchupTeam } from './nflMatchupBoard'
import { nflKickoffAt } from '@/app/the-sideline/kickoff'
import type { SidelineGame } from '@/app/the-sideline/types'
import { publicWorkspaceScope } from './publicWorkspaceScope'

export type NflOddsBoardClock={id:string;cutoff:string|null}
export const nflOddsBoardHash=(value:string)=>createHash('sha256').update(value).digest('hex')
export function nflOddsBoardSignature(clocks:NflOddsBoardClock[],now:number){return clocks.map(clock=>`${clock.id}:${clock.cutoff??'missing'}:${clock.cutoff&&Date.parse(clock.cutoff)<=now?'closed':'open'}`).join('|')}
export function nflOddsBoardClockToken(clocks:NflOddsBoardClock[],now=Date.now()){return nflOddsBoardHash(nflOddsBoardSignature(clocks,now))}

/** Read the exact schedule and saved clocks. Older finals may use the
 * independently reconciled game feed as their durable kickoff evidence. */
export async function readNflOddsBoardClocks(date:string,games:SidelineGame[]):Promise<NflOddsBoardClock[]> {
  const admin=createAdminClient(),ids=games.map(game=>game.id)
  const schedule=await admin.from('nfl_schedule').select('game_id,gameday,gametime,away_team,home_team,away_score,home_score',{count:'exact'}).eq('gameday',date).limit(25).abortSignal(AbortSignal.timeout(10000))
  if(schedule.error||schedule.count==null||schedule.data?.length!==schedule.count||schedule.count>24)throw new Error('Schedule unavailable')
  const scope=publicWorkspaceScope('nfl')
  const rows=scope?schedule.data.filter(row=>row.game_id===scope.game):schedule.data
  if(rows.length!==games.length)throw new Error('Schedule unavailable')
  if(!ids.length)return []
  const records=await admin.from('nfl_pregame_research').select('game_id,kickoff_at',{count:'exact'}).in('game_id',ids).limit(1000).abortSignal(AbortSignal.timeout(10000))
  if(records.error||records.count==null||records.data?.length!==records.count||records.count>1000)throw new Error('Clock unavailable')
  const archivedIds = new Set(records.data.map(row => row.game_id))
  const oldFinals = rows.filter(row => !archivedIds.has(row.game_id) && row.away_score != null && row.home_score != null)
  const finalClocks = new Map<string, number>()
  if (oldFinals.length) {
    const feeds = await admin.from('nfl_game_feeds')
      .select('game_id,start:payload->game->>date,state:payload->game->>status_state,away:payload->game->visitor_team->>abbreviation,home:payload->game->home_team->>abbreviation,away_pts:payload->game->>visitor_team_score,home_pts:payload->game->>home_team_score', { count: 'exact' })
      .in('game_id', oldFinals.map(game => game.game_id)).eq('source', 'bdl_plays').eq('reconciled', true)
      .limit(oldFinals.length).abortSignal(AbortSignal.timeout(5000))
    if (!feeds.error && feeds.count === feeds.data?.length && feeds.data && new Set(feeds.data.map(feed => feed.game_id)).size === feeds.data.length) {
      const finalsById = new Map(oldFinals.map(game => [game.game_id, game]))
      for (const feed of feeds.data) {
        const scheduled = finalsById.get(feed.game_id)
        if (!scheduled || feed.state !== 'final' || !feed.away || !feed.home || feed.away_pts == null || feed.home_pts == null
          || nflMatchupTeam(feed.away) !== nflMatchupTeam(scheduled.away_team)
          || nflMatchupTeam(feed.home) !== nflMatchupTeam(scheduled.home_team)
          || Number(feed.away_pts) !== scheduled.away_score || Number(feed.home_pts) !== scheduled.home_score
          || !feed.start || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(feed.start)) continue
        const start = Date.parse(feed.start)
        if (Number.isFinite(start) && start <= Date.now()) finalClocks.set(feed.game_id, start)
      }
    }
  }
  return games.map(game=>{
    const matches=rows.filter(row=>row.game_id===game.id)
    if(matches.length!==1||matches[0].away_team!==game.away.abbr||matches[0].home_team!==game.home.abbr)throw new Error('Schedule changed')
    const live=nflKickoffAt({gameday:matches[0].gameday,gametime:matches[0].gametime})?.getTime(),original=nflKickoffAt(game)?.getTime()
    const related=records.data!.filter(row=>row.game_id===game.id)
    if(related.some(row=>!Number.isFinite(Date.parse(row.kickoff_at))))throw new Error('Clock unavailable')
    if(live==null||original==null)throw new Error('Clock unavailable')
    const archived = related.map(row => Date.parse(row.kickoff_at))
    const finalClock = finalClocks.get(game.id)
    if (finalClock != null) archived.push(finalClock)
    if (!archived.length) return {id:game.id,cutoff:null}
    return {id:game.id,cutoff:new Date(Math.min(live,original,...archived)).toISOString()}
  }).sort((a,b)=>a.id.localeCompare(b.id))
}

/** The existing shared cache has a bounded 10s local L1 and a leased L2.
 * Token validation never extends a cached entry's real expiry. */
export async function sharedNflOddsBoardClocks(date:string,games:SidelineGame[]){
  const key=nflOddsBoardHash(JSON.stringify(games.map(game=>[game.id,game.gameday,game.gametime]).sort()))
  return (await nbaSharedCache(`nfl:odds-board-clock:v5:${date}:${key}`,15,0,async()=>{
    const observedAt=new Date().toISOString()
    return {clocks:await readNflOddsBoardClocks(date,games),observedAt}
  },45)).value
}
