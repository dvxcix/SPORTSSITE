import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { requirePaintAccess } from '@/lib/paintAccess'
import { getPaintSchedule } from '@/lib/nbaPaintData'
import { nbaSharedCache } from '@/lib/nbaSharedCache'
import { nbaDate, nbaPeriod, PAINT_MARKETS, type PaintStat } from '@/lib/nbaPaint'
import { nbaGameFinal } from '@/lib/nbaOddsMode'
import { nbaFinalOutcomes, nbaFinalStats, nbaVerifiedFinalGame, type NbaStoredFinalGame, type NbaStoredFinalStat } from '@/lib/nbaFinalOutcomes'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 60

/** Completed-game scores are a separate overlay, never pregame input. */
export async function GET(request: NextRequest) {
  const gate=await requirePaintAccess();if(gate.error)return gate.error
  const date=request.nextUrl.searchParams.get('date'),market=request.nextUrl.searchParams.get('market')
  if(!date||nbaDate(date)!==date||!market||!PAINT_MARKETS.some(item=>item.key===market))return NextResponse.json({error:'Invalid selection'},{status:400})
  if(market.endsWith('_first3min'))return NextResponse.json({date,market,rows:[]},{headers:{'Cache-Control':'private, no-store'}})
  try {
    const schedule=await getPaintSchedule(date, true)
    if(schedule.date!==date)return NextResponse.json({date,market,rows:[]},{headers:{'Cache-Control':'private, no-store'}})
    if(schedule.games.length>16)throw new Error('Slate unavailable')
    const games=schedule.games.filter(game=>game.date===date&&nbaGameFinal(game)),period=nbaPeriod(market)
    if(games.some(game=>!Number.isSafeInteger(game.id)||game.id<=0)||new Set(games.map(game=>game.id)).size!==games.length)throw new Error('Invalid games')
    const identity=games.map(game=>[game.id,game.date,game.season,game.home_team.id,game.visitor_team.id,game.datetime,game.status,game.status_state]).sort((a,b)=>Number(a[0])-Number(b[0]))
    const key=createHash('sha256').update(JSON.stringify(identity)).digest('hex')
    const slate=await nbaSharedCache(`nba:final-results:v1:${date}:${period}:${key}`,300,0,async()=>{
      if(!games.length)return [] as {gameId:number;stats:PaintStat[]}[]
      const admin=createAdminClient(),now=Date.now(),deadline=now+15_000
      const stored=await admin.from('nba_games').select('id,game_date,season,home_team_id,visitor_team_id,payload,fetched_at').in('id',games.map(game=>game.id)).limit(16).abortSignal(AbortSignal.timeout(6000))
      if(stored.error)throw new Error('Final games unavailable')
      const storedGames=(stored.data??[]) as unknown as NbaStoredFinalGame[]
      const verified=games.filter(game=>{const matches=storedGames.filter(item=>item.id===game.id);return matches.length===1&&nbaVerifiedFinalGame(game,matches[0],now)})
      if(!verified.length)return [] as {gameId:number;stats:PaintStat[]}[]
      const records:NbaStoredFinalStat[]=[]
      for(let offset=0;offset<=4000;offset+=500){
        const remaining=deadline-Date.now();if(remaining<=0)throw new Error('Final stats timed out')
        let query=admin.from(period?'nba_player_period_stats':'nba_player_game_stats').select(period?'id,game_id,player_id,team_id,game_date,season,period,payload,fetched_at':'id,game_id,player_id,team_id,game_date,season,payload,fetched_at').in('game_id',verified.map(game=>game.id))
        if(period)query=query.eq('period',period)
        const response=await query.order('game_id').order('player_id').range(offset,offset+499).abortSignal(AbortSignal.timeout(Math.min(6000,remaining)))
        if(response.error)throw new Error('Final stats unavailable')
        const page=(response.data??[]) as unknown as NbaStoredFinalStat[]
        records.push(...page);if(records.length>4096)throw new Error('Final stats exceed capacity')
        if(page.length<500)break
      }
      const results=verified.map(game=>({gameId:game.id,stats:nbaFinalStats(game,records.filter(row=>row.game_id===game.id),period,now)}))
      if(Buffer.byteLength(JSON.stringify(results))>1024*1024)throw new Error('Final results exceed capacity')
      return results
    },55)
    const rows=slate.value.flatMap(result=>{const game=games.find(item=>item.id===result.gameId);return game?nbaFinalOutcomes(game,result.stats,market):[]})
    if(rows.length>2560)throw new Error('Final results exceed capacity')
    return NextResponse.json({date,market,rows},{headers:{'Cache-Control':'private, no-store'}})
  }catch{return NextResponse.json({error:'Results unavailable'},{status:503,headers:{'Cache-Control':'private, no-store'}})}
}
