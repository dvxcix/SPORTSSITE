import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'
import { withPipelineHealth } from '@/lib/pipelineHealth'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPaintSchedule, getPaintPropSnapshot, getPaintGameOdds, getPaintGame } from '@/lib/nbaPaintData'
import { nbaEconomicSnapshot } from '@/lib/nbaMovement'
import { nbaGameEconomicSnapshot } from '@/lib/nbaOddsHistory'
import { nbaToday } from '@/lib/nbaPaint'
import { nbaGameStart, nbaGameFinal, nbaPregameOpen, nbaLiveOpen, nbaQuoteInMode, nbaQuoteTimeEvidence } from '@/lib/nbaOddsMode'
import { nbaSharedCache } from '@/lib/nbaSharedCache'
import type { NbaMarketReceipt } from '@/lib/nbaMarketReceipts'
import { getNbaFirstEvents, getNbaFirstOdds } from '@/lib/nbaFirstBasketOddsData'
import type { NbaFirstDiagnostics } from '@/lib/nbaFirstBasketOdds'
import type { NbaSupplementalDiagnostics } from '@/lib/nbaSupplementalProps'
export const maxDuration = 120
type FirstBasketReceipt = NbaMarketReceipt & {
  accepted: number
  unmatched: number
  quotes: number
  capture?: 'captured' | 'unchanged'
  diagnostics?: NbaFirstDiagnostics
}
type FirstBasketGameReport = FirstBasketReceipt & { gameId: number; mode: 'pregame' | 'live'; cached: boolean }
type MarketReceipt = NbaMarketReceipt & { coverage?: Awaited<ReturnType<typeof getPaintPropSnapshot>>['coverage'] }
async function run(request: Request) {
  const denied = requireCronAuth(request); if (denied) return denied
  const started = Date.now(), admin = createAdminClient()
  const today=nbaToday(),dates=[-1,0,1,2].map(offset=>{const date=new Date(today+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+offset);return date.toISOString().slice(0,10)})
  const schedules = await Promise.all(dates.map(date=>getPaintSchedule(date)))
  const games = [...new Map(schedules.flatMap(s=>s.games).map(g=>[g.id,g])).values()].filter(g => !nbaGameFinal(g) && nbaGameStart(g)!=null && nbaGameStart(g)!>Date.now()-6*3600000 && nbaGameStart(g)!-Date.now()<48*3600000)
  const {data:attempts,error:attemptError}=await admin.from('nba_source_cache').select('key,fetched_at').in('key',games.flatMap(game=>['pregame','live'].map(mode=>'market-attempt:v4:'+mode+':'+game.id)))
  if(attemptError)return NextResponse.json({reason:'NBA market progress unavailable'},{status:503})
  const last=(id:number)=>Math.max(0,...(attempts??[]).filter(row=>row.key.endsWith(':'+id)).map(row=>Date.parse(row.fetched_at??'1970-01-01')))
  games.sort((a,b)=>last(a.id)-last(b.id)||Date.parse(a.datetime??a.status)-Date.parse(b.datetime??b.status))
  const firstEvents = await getNbaFirstEvents(true).catch(() => null)
  const report = { checked: 0, captured: 0, unchanged: 0, failed: 0, deferred: 0, coverage: [] as { gameId: number; mode: 'pregame' | 'live'; complete: boolean; accepted: number; unmatched: number; stale: number; diagnostics?: NbaSupplementalDiagnostics }[], firstBasket: { checked: 0, captured: 0, unchanged: 0, failed: 0, deferred: 0, quotes: 0, accepted: 0, unmatched: 0, games: [] as FirstBasketGameReport[] } }
  for (let offset = 0; offset < games.length; offset += 4) {
    if (Date.now() - started > 82_000) { report.deferred += games.length-offset; report.firstBasket.deferred += games.length-offset; break }
    await Promise.all(games.slice(offset,offset+4).map(async scheduled => {
      let game
      try { game=await getPaintGame(scheduled.id,true) } catch { report.failed++; report.firstBasket.failed++; return }
      const mode=nbaPregameOpen(game)?'pregame':nbaLiveOpen(game)?'live':null
      if(!mode){report.deferred++;report.firstBasket.deferred++;return}
      const phaseOpen=()=>mode==='pregame'?nbaPregameOpen(game):nbaLiveOpen(game)
      const tipoff=new Date(nbaGameStart(game)!).toISOString()
      // Each feed owns its receipt and tape. First-basket trouble must not
      // suppress standard market captures, or freshen their fingerprint.
      const firstTask = (async () => {
        report.firstBasket.checked++
        try {
          let performed = false
          const attempt = await nbaSharedCache<FirstBasketReceipt>(`first-basket-attempt:v3:${mode}:${game.id}`, 240, 0, async () => {
            performed = true
            const counts: {accepted:number;unmatched:number;quotes:number;diagnostics?:NbaFirstDiagnostics} = { accepted: 0, unmatched: 0, quotes: 0 }
            try {
              if (!firstEvents) return { status: 'failed', ...counts }
              const result = await getNbaFirstOdds(game, true, firstEvents)
              counts.unmatched = result.unmatched
              if('diagnostics' in result)counts.diagnostics=result.diagnostics
              if (!result.eventMatched) return { status: 'deferred', ...counts }
              if (!phaseOpen()) return { status: 'deferred', ...counts }
              const raw = result.rows.map(row => row.offer)
              const checkedAt=Date.now(),props = raw.filter(prop=>nbaQuoteInMode(prop,game,mode,checkedAt))
              if(props.length!==raw.length){
                const prior=counts.diagnostics
                counts.diagnostics={reasons:{...prior?.reasons},players:[...(prior?.players??[])],timestamps:(prior?.timestamps??[]).map(sample=>({...sample}))}
                for(const prop of raw.filter(prop=>!nbaQuoteInMode(prop,game,mode,checkedAt))){
                  const time=Date.parse(prop.updated_at),sample={book:prop.vendor,market:prop.prop_type,outcomes:1,...nbaQuoteTimeEvidence(prop.updated_at,game,!Number.isFinite(time)?'invalid-clock':time>checkedAt?'future':'wrong-phase',checkedAt)}
                  const priorSample=counts.diagnostics.timestamps!.find(value=>value.book===sample.book&&value.market===sample.market&&value.quoteAt===sample.quoteAt&&value.reason===sample.reason)
                  if(priorSample)priorSample.outcomes++
                  else if(counts.diagnostics.timestamps!.length<12)counts.diagnostics.timestamps!.push(sample)
                }
              }
              if(raw.length&&!props.length)return {status:'deferred', ...counts}
              if (props.some(prop => prop.game_id !== game.id)) return { status: 'failed', ...counts }
              counts.accepted = props.length
              if (result.captureComplete === false) return { status: 'failed', ...counts }
              // An unmatched feed is not a verified market withdrawal.
              if (!props.length && result.unmatched) return { status: 'failed', ...counts }
              const { data, error } = await admin.rpc('record_nba_phase_capture', {
                p_mode:mode,p_feed:'first',p_tipoff:tipoff,
                p_game_id: game.id, p_game_date: game.date,
                p_fingerprint: createHash('sha256').update(JSON.stringify(nbaEconomicSnapshot(props))).digest('hex'),
                p_quotes: props,
              }).abortSignal(AbortSignal.timeout(12_000))
              if (error) return { status: 'failed', ...counts }
              const capture = data ? 'captured' : 'unchanged'
              // Save verified siblings, but never certify incomplete identities
              // as full coverage. The private receipt contains no source labels.
              return { status: counts.unmatched ? 'failed' : capture, ...counts, quotes: props.length, capture }
            } catch { return { status: 'failed', ...counts } }
          }, 40)
          const receipt = attempt.value
          // A cached failure is still incomplete coverage; caching must not
          // turn it into a successful pipeline run before the next retry.
          report.firstBasket[receipt.status === 'failed' ? 'failed' : performed ? receipt.status : 'deferred']++
          report.firstBasket.quotes += receipt.quotes
          report.firstBasket.accepted += receipt.accepted
          report.firstBasket.unmatched += receipt.unmatched
          if (report.firstBasket.games.length < 64) report.firstBasket.games.push({ gameId: game.id, mode, cached: !performed, status: receipt.status, accepted: receipt.accepted, unmatched: receipt.unmatched, quotes: receipt.quotes, ...(receipt.capture ? { capture: receipt.capture } : {}), ...(receipt.diagnostics?{diagnostics:receipt.diagnostics}:{}) })
        } catch { report.firstBasket.failed++ }
      })()
      report.checked++
      try {
        let performed=false
        const attempt=await nbaSharedCache<MarketReceipt>(`market-attempt:v4:${mode}:${game.id}`,240,0,async()=>{
          performed=true
          try{
            const [propsResult, gameResult] = await Promise.allSettled([getPaintPropSnapshot(game,mode,true), getPaintGameOdds(game.id,true)])
            if (!phaseOpen())return {status:'deferred'}
            const rawProps = propsResult.status === 'fulfilled' ? propsResult.value.props : []
            const coverage = propsResult.status === 'fulfilled' ? propsResult.value.coverage : undefined
            const props=rawProps.filter(prop=>nbaQuoteInMode(prop,game,mode))
            const rawGameOdds = gameResult.status === 'fulfilled' ? gameResult.value : []
            const gameOdds=rawGameOdds.filter(quote=>nbaQuoteInMode(quote,game,mode))
            // A partial source is not a withdrawal. Keep the last complete
            // player frame while independent game/First Basket feeds continue.
            const propsValid=propsResult.status==='fulfilled'&&propsResult.value.complete&&(!rawProps.length||!!props.length),gameValid=gameResult.status==='fulfilled'&&(!rawGameOdds.length||!!gameOdds.length)
            if(rawProps.some(p=>p.game_id!==game.id) || rawGameOdds.some(p=>p.game_id!=null&&p.game_id!==game.id))return {status:'failed'}
            const playerFingerprint=propsValid?createHash('sha256').update(JSON.stringify(nbaEconomicSnapshot(props))).digest('hex'):undefined
            const playerObservedAt=new Date().toISOString()
            const captures = await Promise.all([
              propsValid ? admin.rpc('record_nba_phase_capture',{ p_game_id:game.id,p_game_date:game.date,p_mode:mode,p_feed:'props',p_tipoff:tipoff,p_fingerprint:playerFingerprint!,p_quotes:props }).abortSignal(AbortSignal.timeout(12_000)) : Promise.resolve(null),
              gameValid ? admin.rpc('record_nba_phase_capture',{ p_game_id:game.id,p_game_date:game.date,p_mode:mode,p_feed:'game',p_tipoff:tipoff,p_fingerprint:createHash('sha256').update(JSON.stringify(nbaGameEconomicSnapshot(game.id,gameOdds))).digest('hex'),p_quotes:gameOdds }).abortSignal(AbortSignal.timeout(12_000)) : Promise.resolve(null),
            ])
            if(propsResult.status==='rejected'||propsResult.value.primaryComplete===false||!propsResult.value.complete&&!coverage?.deferred||gameResult.status==='rejected'||captures.some(result=>result?.error))return {status:'failed',coverage}
            const status=captures.some(result=>result?.data)?'captured':captures.some(Boolean)?'unchanged':'deferred'
            return {status,coverage,...(playerFingerprint&&captures[0]?{playerFingerprint,playerObservedAt}:{})}
          }catch{return {status:'failed'}}
        },70)
        report[attempt.value.status==='failed'?'failed':performed?attempt.value.status:'deferred']++
        if(attempt.value.coverage&&report.coverage.length<64){const {complete,accepted,unmatched,stale,diagnostics}=attempt.value.coverage;report.coverage.push({gameId:game.id,mode,complete,accepted,unmatched,stale,...(diagnostics?{diagnostics}:{})})}
      } catch { report.failed++ }
      await firstTask
    }))
  }
  return NextResponse.json(report,{status:report.failed || report.firstBasket.failed ? 503 : 200})
}
export const GET = withPipelineHealth('nba-market-capture',run)
