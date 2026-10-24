import { NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'
import { withPipelineHealth } from '@/lib/pipelineHealth'
import { getPaintSchedule, getPaintGame, getPaintRoster } from '@/lib/nbaPaintData'
import { nbaToday, type PaintGame, type PaintRoster } from '@/lib/nbaPaint'
import { nbaGameStart, nbaPregameOpen } from '@/lib/nbaOddsMode'
import { nbaSharedCache } from '@/lib/nbaSharedCache'
import { NBA_FIRST_BOOKS, saveNbaBookFirstFrame } from '@/lib/nbaBookFirstData'
import { collectNbaFirstBooks, type NbaFirstBookCapture } from '@/lib/scrapers/nbaFirstBooks'
import type { NbaFirstBookGame } from '@/lib/scrapers/nbaFirstBookQuotes'
import { getNbaBookPropEntries, nbaReconcileBookPropFrames, saveNbaBookPropFrames, type NbaBookPropObservation, type NbaBookPropCoverage } from '@/lib/nbaBookPropsData'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

async function beforeDeadline<T>(work: Promise<T>, deadline: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => { timer=setTimeout(()=>reject(new Error('NBA preparation deadline')),Math.max(1,deadline-Date.now())) })])
  } finally { if(timer)clearTimeout(timer) }
}

async function run(request: Request) {
  const denied = requireCronAuth(request)
  if (denied) return denied
  const started=Date.now(), prepareDeadline=started+60_000, browserDeadline=started+240_000, saveDeadline=started+260_000
  const today = nbaToday(), tomorrow = new Date(`${today}T12:00:00Z`)
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
  const dates = [today, tomorrow.toISOString().slice(0, 10)]
  try {
    const schedules = await beforeDeadline(Promise.all(dates.map(date => getPaintSchedule(date))),prepareDeadline)
    if (schedules.some(slate => !slate.complete)) throw new Error('Slate unavailable')
    const games = [...new Map(schedules.flatMap(slate => slate.games).filter(game => dates.includes(game.date) && nbaPregameOpen(game)).map(game => [game.id, game])).values()]
    if (games.length > 30) throw new Error('Slate unavailable')
    const inputs: { game: PaintGame; roster: PaintRoster[] }[] = []
    let failed = 0
    for (let offset = 0; offset < games.length; offset += 4) {
      if(Date.now()>=prepareDeadline){failed+=games.length-offset;break}
      await Promise.all(games.slice(offset, offset + 4).map(async scheduled => {
        try {
          const input=await beforeDeadline((async()=>{
            const game = await getPaintGame(scheduled.id)
            if (!nbaPregameOpen(game)) return null
            return { game, roster: await getPaintRoster(game) }
          })(),prepareDeadline)
          if(input)inputs.push(input)
        } catch { failed++ }
      }))
    }
    if (!inputs.length) return NextResponse.json({ checked: 0, saved: 0, failed, deferred: games.length, books: [] }, { status: failed ? 503 : 200 })
    const books = await Promise.all(NBA_FIRST_BOOKS.map(async book => {
      try {
        // Only cron owns this lease. A duplicate invocation cannot start a
        // second browser; the source remains absent from all member loaders.
        const result = await nbaSharedCache(`book-first-run:v2:${book}:${today}`, 60, 0, async () => {
          let saved = 0, failed = 0, deferred = 0
          let regularSaved=0,regularQuotes=0,regularDeferred=0
          const reports=new Map<number,{gameId:number;status:string;quotes:number;unmatched:number;clockMismatch:boolean}>()
          const regularReports=new Map<number,{gameId:number;status:string;contracts:number;quotes:number;unmatched:number;coverageComplete:number;coverageIncomplete:number;saved:number;states:Record<string,number>}>()
          const expected=new Map(inputs.map(input=>[input.game.id,input]))
          const firstRaw=new Map<number,NbaFirstBookGame>()
          type Attempt={signature:string;settled:Promise<void>}
          const firstAttempts=new Map<number,Attempt>(),regularAttempts=new Map<number,Attempt>()
          // Journal before awaiting: a callback timing out in the browser must
          // never cause the final response path to repeat an uncertain write.
          function once(attempts:Map<number,Attempt>,gameId:number,signature:string,write:()=>Promise<void>){
            const prior=attempts.get(gameId)
            if(prior){if(prior.signature!==signature)failed++;return prior.settled}
            const settled=Promise.resolve().then(write).catch(()=>{failed++})
            attempts.set(gameId,{signature,settled})
            return settled
          }
          const onFirst=(item:NbaFirstBookGame)=>{
            const input=expected.get(item.gameId)
            if(!input){failed++;return Promise.resolve()}
            return once(firstAttempts,item.gameId,JSON.stringify(item),async()=>{
              firstRaw.set(item.gameId,item)
              let status:string=item.status
              if(!nbaPregameOpen(input.game)){deferred++;status='closed'}
              else if(item.complete&&item.observedAt&&item.props.length&&item.unmatched===0){
                if(Date.now()>=saveDeadline){failed++;status='deadline'}
                else try{
                  await saveNbaBookFirstFrame(input.game,{gameId:input.game.id,book,tipoff:new Date(nbaGameStart(input.game)!).toISOString(),observedAt:item.observedAt,props:item.props,complete:true})
                  saved++
                }catch{failed++;status='save-failed'}
              }else if(['unlisted','unavailable','closed'].includes(item.status)&&!item.complete)deferred++
              else failed++
              reports.set(item.gameId,{gameId:item.gameId,status,quotes:item.props.length,unmatched:item.unmatched,clockMismatch:item.clockMismatch})
            })
          }
          const onRegular=(gameId:number,observations:NbaBookPropObservation[],coverage:NbaBookPropCoverage[],observedAt:string)=>{
            const input=expected.get(gameId)
            if(book!=='betmgm'||!input||observations.some(frame=>frame.gameId!==gameId)||coverage.some(scope=>scope.gameId!==gameId)){failed++;return Promise.resolve()}
            return once(regularAttempts,gameId,JSON.stringify([observations,coverage]),async()=>{
              const report={gameId,status:'incomplete',contracts:observations.length,quotes:observations.reduce((sum,frame)=>sum+frame.props.length,0),unmatched:Math.min(10_000,observations.reduce((sum,frame)=>sum+(Number.isSafeInteger(frame.unmatched)&&frame.unmatched>0?frame.unmatched:0),0)),coverageComplete:coverage.filter(scope=>scope.complete).length,coverageIncomplete:coverage.filter(scope=>!scope.complete).length,saved:0,states:Object.fromEntries(['captured','partial','unavailable','unlisted','closed','deadline','error','identity-mismatch'].map(status=>[status,observations.filter(frame=>frame.status===status).length]))}
              regularReports.set(gameId,report)
              if(!nbaPregameOpen(input.game)){report.status='closed';return}
              if(Date.now()>=saveDeadline-12_000){failed++;report.status='deadline';return}
              try{
                const previous=await getNbaBookPropEntries(input.game,true)
                // A stable selected All menu without player headers is normal
                // unavailable coverage, but cannot retire prior contracts.
                const unavailable=!previous.length&&!observations.length&&coverage.length>0&&coverage.every(scope=>scope.status==='unavailable'&&!scope.complete&&!scope.contracts.length)
                if(unavailable){regularDeferred++;report.status='unavailable'}
                else if(coverage.some(scope=>!scope.complete)||(!coverage.length&&!['unlisted','closed'].includes(firstRaw.get(gameId)?.status??'')))failed++
                const reconciled=nbaReconcileBookPropFrames(input.game,observations,coverage,previous,observedAt)
                failed+=reconciled.failed
                if(reconciled.frames.length){
                  if(Date.now()>=saveDeadline){failed++;report.status='deadline';return}
                  await saveNbaBookPropFrames(input.game,reconciled.frames,previous)
                  regularSaved+=reconciled.frames.length
                  regularQuotes+=reconciled.frames.reduce((sum,frame)=>sum+frame.props.length,0)
                  report.saved=reconciled.frames.length
                }
                if(!unavailable&&coverage.length>0&&coverage.every(scope=>scope.complete)&&reconciled.failed===0)report.status='captured'
              }catch{failed++;report.status='save-failed'}
            })
          }
          // Two bounded MGM sessions share this one cron lease. Distributing
          // tips roundrobin gives each the same amount of active slate work;
          // tomorrow's unlisted games remain represented exactly once.
          const sorted=[...inputs].sort((a,b)=>(nbaGameStart(a.game)??Infinity)-(nbaGameStart(b.game)??Infinity)||a.game.id-b.game.id)
          const partitions=book==='betmgm'&&sorted.length>1?[sorted.filter((_,index)=>index%2===0),sorted.filter((_,index)=>index%2===1)]:[sorted]
          const captures=await Promise.all(partitions.map(async partition=>{
            const allowed=new Set(partition.map(input=>input.game.id))
            try{
              const captured=await collectNbaFirstBooks(book,partition,browserDeadline,{
                onFirst:item=>{if(!allowed.has(item.gameId)){failed++;return Promise.resolve()}return onFirst(item)},
                onRegular:(gameId,frames,coverage,observedAt)=>{if(!allowed.has(gameId)){failed++;return Promise.resolve()}return onRegular(gameId,frames,coverage,observedAt)},
              })
              failed+=captured.games.filter(item=>!allowed.has(item.gameId)).length+(captured.regular??[]).filter(item=>!allowed.has(item.gameId)).length+(captured.regularCoverage??[]).filter(item=>!allowed.has(item.gameId)).length+(captured.book!==book?1:0)
              return{...captured,book,games:captured.games.filter(item=>allowed.has(item.gameId)),regular:(captured.regular??[]).filter(item=>allowed.has(item.gameId)),regularCoverage:(captured.regularCoverage??[]).filter(item=>allowed.has(item.gameId))}
            }
            catch{
              // Cleanup can fail after earlier observations were safely saved.
              // Keep those counters and fail the affected partition honestly.
              failed++
              return{book,observedAt:new Date().toISOString(),complete:false,games:[...firstRaw.values()].filter(item=>allowed.has(item.gameId)),errors:[{code:'navigation-failed' as const}]} satisfies NbaFirstBookCapture
            }
          }))
          const capture:NbaFirstBookCapture={book,observedAt:new Date().toISOString(),complete:captures.every(partition=>partition.complete),games:captures.flatMap(partition=>partition.games),errors:captures.flatMap(partition=>partition.errors),regular:captures.flatMap(partition=>'regular' in partition?partition.regular??[]:[]),regularCoverage:captures.flatMap(partition=>'regularCoverage' in partition?partition.regularCoverage??[]:[])}
          failed+=capture.errors.length
          const errors=capture.errors.filter(error=>['session-unavailable','navigation-failed','challenge','layout-unavailable','deadline'].includes(error.code)).slice(0,64).map(error=>({
            code:error.code,...(Number.isSafeInteger(error.gameId)?{gameId:error.gameId}:{}),
            ...(['event-navigation','event-scoreboard','event-identity','event-all','event-menu','first-accordion','first-panel','first-expand','first-rows','first-revalidate','regular-navigation','regular-capture','observation-save'].includes(error.stage??'')?{stage:error.stage}:{}),
            ...(['timeout','target-closed','navigation-interrupted','network','evaluation','unknown'].includes(error.reason??'')?{reason:error.reason}:{}),
          }))
          failed+=capture.games.filter(item=>!expected.has(item.gameId)).length
          failed+=(capture.regular??[]).filter(item=>!expected.has(item.gameId)).length
          // Every requested game must have exactly one observation, including
          // explicit unlisted/closed outcomes. Missing output is never success.
          for(let offset=0;offset<inputs.length;offset+=4){
            await Promise.all(inputs.slice(offset,offset+4).map(async input=>{
              const matches=capture.games.filter(item=>item.gameId===input.game.id)
              if(matches.length!==1){failed++;reports.set(input.game.id,{gameId:input.game.id,status:'coverage-failed',quotes:0,unmatched:0,clockMismatch:false})}
              else await onFirst(matches[0])
              if(book==='betmgm')await onRegular(input.game.id,(capture.regular??[]).filter(frame=>frame.gameId===input.game.id),(capture.regularCoverage??[]).filter(frame=>frame.gameId===input.game.id),capture.observedAt)
            }))
          }
          await Promise.all([...firstAttempts.values(),...regularAttempts.values()].map(attempt=>attempt.settled))
          return { book, checked: capture.games.length, saved, regularSaved, regularQuotes, regularDeferred, failed, deferred, observedAt: capture.observedAt, games:[...reports.values()], regularGames:[...regularReports.values()], errors }
        }, 300)
        return result.value
      } catch { return { book, checked: 0, saved: 0, failed: 1, deferred: 0, games: [] } }
    }))
    failed += books.reduce((sum, book) => sum + book.failed, 0)
    return NextResponse.json({ checked: inputs.length, saved: books.reduce((sum, book) => sum + book.saved, 0), failed, deferred: books.reduce((sum, book) => sum + book.deferred, 0), books }, { status: failed ? 503 : 200 })
  } catch {
    return NextResponse.json({ error: 'NBA book capture unavailable' }, { status: 503 })
  }
}

export const GET = withPipelineHealth('nba-book-first-capture', run)
