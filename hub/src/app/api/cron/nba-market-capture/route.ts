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
import { getNbaFirstEvents, getNbaFirstOdds } from '@/lib/nbaFirstBasketOddsData'
export const maxDuration = 120
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
  const firstEvents = await getNbaFirstEvents(true).catch(() => null)
  const report = { checked: 0, captured: 0, unchanged: 0, failed: 0, deferred: 0, firstBasket: { checked: 0, captured: 0, unchanged: 0, failed: 0, deferred: 0, quotes: 0 } }
  for (let offset = 0; offset < games.length; offset += 4) {
    if (Date.now() - started > 82_000) { report.deferred += games.length-offset; report.firstBasket.deferred += games.length-offset; break }
    await Promise.all(games.slice(offset,offset+4).map(async game => {
      // Each feed owns its receipt and tape. First-basket trouble must not
      // suppress standard market captures, or freshen their fingerprint.
      const firstTask = (async () => {
        report.firstBasket.checked++
        try {
          let performed = false
          const attempt = await nbaSharedCache<NbaMarketReceipt & { quotes?: number }>(`first-basket-attempt:v1:${game.id}`, 240, 0, async () => {
            performed = true
            try {
              if (!firstEvents) return { status: 'failed' }
              const result = await getNbaFirstOdds(game, true, firstEvents)
              if (!result.eventMatched) return { status: 'deferred' }
              if (Date.parse(game.datetime ?? game.status) <= Date.now()) return { status: 'deferred' }
              const props = result.rows.map(row => row.offer)
              if (props.some(prop => prop.game_id !== game.id)) return { status: 'failed' }
              // An unmatched feed is not a verified market withdrawal.
              if (!props.length && result.unmatched) return { status: 'failed' }
              const { data, error } = await admin.rpc('record_nba_first_basket_capture', {
                p_game_id: game.id, p_game_date: game.date,
                p_fingerprint: createHash('sha256').update(JSON.stringify(nbaEconomicSnapshot(props))).digest('hex'),
                p_props: props,
              }).abortSignal(AbortSignal.timeout(12_000))
              return { status: error ? 'failed' : data ? 'captured' : 'unchanged', quotes: props.length }
            } catch { return { status: 'failed' } }
          }, 40)
          report.firstBasket[performed ? attempt.value.status : 'deferred']++
          report.firstBasket.quotes += attempt.value.quotes ?? 0
        } catch { report.firstBasket.failed++ }
      })()
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
            const playerFingerprint=propsResult.status==='fulfilled'?createHash('sha256').update(JSON.stringify(nbaEconomicSnapshot(props))).digest('hex'):undefined
            const playerObservedAt=new Date().toISOString()
            const captures = await Promise.all([
              propsResult.status==='fulfilled' ? admin.rpc('record_nba_market_capture',{ p_game_id:game.id,p_game_date:game.date,p_fingerprint:playerFingerprint!,p_props:props }).abortSignal(AbortSignal.timeout(12_000)) : Promise.resolve(null),
              gameResult.status==='fulfilled' ? admin.rpc('record_nba_game_market_capture',{ p_game_id:game.id,p_game_date:game.date,p_fingerprint:createHash('sha256').update(JSON.stringify(nbaGameEconomicSnapshot(game.id,gameOdds))).digest('hex'),p_odds:gameOdds }).abortSignal(AbortSignal.timeout(12_000)) : Promise.resolve(null),
            ])
            if(propsResult.status==='rejected'||gameResult.status==='rejected'||captures.some(result=>result?.error))return {status:'failed'}
            const status=captures.some(result=>result?.data)?'captured':captures.some(Boolean)?'unchanged':'deferred'
            return {status,...(playerFingerprint&&captures[0]?{playerFingerprint,playerObservedAt}:{})}
          }catch{return {status:'failed'}}
        },25)
        report[performed?attempt.value.status:'deferred']++
      } catch { report.failed++ }
      await firstTask
    }))
  }
  return NextResponse.json(report,{status:report.failed || report.firstBasket.failed ? 503 : 200})
}
export const GET = withPipelineHealth('nba-market-capture',run)
