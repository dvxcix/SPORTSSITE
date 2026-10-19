import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'
import { withPipelineHealth } from '@/lib/pipelineHealth'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPaintSchedule, getPaintProps, getPaintGameOdds } from '@/lib/nbaPaintData'
import { nbaEconomicSnapshot } from '@/lib/nbaMovement'
import { nbaGameEconomicSnapshot } from '@/lib/nbaOddsHistory'
import { nbaToday } from '@/lib/nbaPaint'
import { nbaSharedCache } from '@/lib/nbaSharedCache'
import type { NbaMarketReceipt } from '@/lib/nbaMarketReceipts'
export const maxDuration = 60
async function run(request: Request) {
  const denied = requireCronAuth(request); if (denied) return denied
  const started = Date.now(), admin = createAdminClient()
  const today=nbaToday(),dates=[0,1,2].map(offset=>{const date=new Date(today+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+offset);return date.toISOString().slice(0,10)})
  const schedules = await Promise.all(dates.map(date=>getPaintSchedule(date)))
  const games = [...new Map(schedules.flatMap(s=>s.games).map(g=>[g.id,g])).values()].filter(g => ['scheduled', 'unknown', undefined].includes(g.status_state) && Date.parse(g.datetime ?? g.status) > Date.now() && Date.parse(g.datetime??g.status)-Date.now()<48*3600000)
  const {data:attempts,error:attemptError}=await admin.from('nba_source_cache').select('key,fetched_at').in('key',games.map(game=>'market-attempt:v3:'+game.id))
  if(attemptError)return NextResponse.json({reason:'NBA market progress unavailable'},{status:503})
  const last=(id:number)=>Date.parse(attempts?.find(row=>row.key==='market-attempt:v3:'+id)?.fetched_at??'1970-01-01')
  games.sort((a,b)=>last(a.id)-last(b.id)||Date.parse(a.datetime??a.status)-Date.parse(b.datetime??b.status))
  const report = { checked: 0, captured: 0, unchanged: 0, failed: 0, deferred: 0 }
  for (let offset = 0; offset < games.length; offset += 4) {
    if (Date.now() - started > 42_000) { report.deferred += games.length-offset; break }
    await Promise.all(games.slice(offset,offset+4).map(async game => {
      report.checked++
      try {
        let performed=false
        const attempt=await nbaSharedCache<NbaMarketReceipt>(`market-attempt:v3:${game.id}`,240,0,async()=>{
          performed=true
          try{
            const [propsResult, gameResult] = await Promise.allSettled([getPaintProps(game.id,true), getPaintGameOdds(game.id,true)])
            if (Date.parse(game.datetime??game.status)<=Date.now())return {status:'deferred'}
            const props = propsResult.status === 'fulfilled' ? propsResult.value : []
            const gameOdds = gameResult.status === 'fulfilled' ? gameResult.value : []
            if(props.some(p=>p.game_id!==game.id) || gameOdds.some(p=>p.game_id!=null&&p.game_id!==game.id))return {status:'failed'}
            const playerFingerprint=props.length?createHash('sha256').update(JSON.stringify(nbaEconomicSnapshot(props))).digest('hex'):undefined
            const playerObservedAt=new Date().toISOString()
            const captures = await Promise.all([
              props.length ? admin.rpc('record_nba_market_capture',{ p_game_id:game.id,p_game_date:game.date,p_fingerprint:playerFingerprint!,p_props:props }).abortSignal(AbortSignal.timeout(12_000)) : Promise.resolve(null),
              gameOdds.length ? admin.rpc('record_nba_game_market_capture',{ p_game_id:game.id,p_game_date:game.date,p_fingerprint:createHash('sha256').update(JSON.stringify(nbaGameEconomicSnapshot(game.id,gameOdds))).digest('hex'),p_odds:gameOdds }).abortSignal(AbortSignal.timeout(12_000)) : Promise.resolve(null),
            ])
            if(propsResult.status==='rejected'||gameResult.status==='rejected'||captures.some(result=>result?.error))return {status:'failed'}
            const status=captures.some(result=>result?.data)?'captured':captures.some(Boolean)?'unchanged':'deferred'
            return {status,...(playerFingerprint&&captures[0]?{playerFingerprint,playerObservedAt}:{})}
          }catch{return {status:'failed'}}
        },25)
        report[performed?attempt.value.status:'deferred']++
      } catch { report.failed++ }
    }))
  }
  return NextResponse.json(report,{status:report.failed ? 503 : 200})
}
export const GET = withPipelineHealth('nba-market-capture',run)
