import { NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'
import { withPipelineHealth } from '@/lib/pipelineHealth'
import { getPaintSchedule, getPaintGame, getPaintRoster } from '@/lib/nbaPaintData'
import { nbaToday, type PaintGame, type PaintRoster } from '@/lib/nbaPaint'
import { nbaGameStart, nbaPregameOpen } from '@/lib/nbaOddsMode'
import { nbaSharedCache } from '@/lib/nbaSharedCache'
import { NBA_FIRST_BOOKS, saveNbaBookFirstFrame } from '@/lib/nbaBookFirstData'
import { collectNbaFirstBooks } from '@/lib/scrapers/nbaFirstBooks'
import { getNbaBookPropEntries, nbaReconcileBookPropFrames, saveNbaBookPropFrames } from '@/lib/nbaBookPropsData'

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
  const started=Date.now(), prepareDeadline=started+60_000, browserDeadline=started+220_000, saveDeadline=started+260_000
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
          const capture = await collectNbaFirstBooks(book, inputs, browserDeadline)
          let saved = 0, failed = capture.errors.length, deferred = 0
          let regularSaved=0,regularQuotes=0,regularDeferred=0
          const errors=capture.errors.filter(error=>['session-unavailable','navigation-failed','challenge','layout-unavailable','deadline'].includes(error.code)).slice(0,64).map(error=>({
            code:error.code,...(Number.isSafeInteger(error.gameId)?{gameId:error.gameId}:{}),
            ...(['event-navigation','event-scoreboard','event-identity','event-all','event-menu','first-accordion','first-panel','first-expand','first-rows','first-revalidate','regular-navigation','regular-capture'].includes(error.stage??'')?{stage:error.stage}:{}),
            ...(['timeout','target-closed','navigation-interrupted','network','evaluation','unknown'].includes(error.reason??'')?{reason:error.reason}:{}),
          }))
          const games: { gameId: number; status: string; quotes: number; unmatched: number; clockMismatch: boolean }[] = []
          const expected=new Set(inputs.map(input=>input.game.id))
          failed+=capture.games.filter(item=>!expected.has(item.gameId)).length
          failed+=(capture.regular??[]).filter(item=>!expected.has(item.gameId)).length
          // Every requested game must have exactly one observation, including
          // explicit unlisted/closed outcomes. Missing output is never success.
          for(let offset=0;offset<inputs.length;offset+=4){
            await Promise.all(inputs.slice(offset,offset+4).map(async input=>{
              const matches=capture.games.filter(item=>item.gameId===input.game.id)
              if(matches.length!==1){failed++;games.push({gameId:input.game.id,status:'coverage-failed',quotes:0,unmatched:0,clockMismatch:false})}
              else{
              const item=matches[0]
              let status: string = item.status
              if (!nbaPregameOpen(input.game)) { deferred++;status='closed' }
              else if (item.complete && item.observedAt && item.props.length && item.unmatched===0) {
                if(Date.now()>=saveDeadline){failed++;status='deadline'}
                else try {
                  await saveNbaBookFirstFrame(input.game, { gameId: input.game.id, book, tipoff: new Date(nbaGameStart(input.game)!).toISOString(), observedAt: item.observedAt, props: item.props, complete: true })
                  saved++
                } catch { failed++; status = 'save-failed' }
              } else if (['unlisted', 'unavailable', 'closed'].includes(item.status)&&!item.complete) deferred++
              else failed++
              games.push({ gameId: item.gameId, status, quotes: item.props.length, unmatched: item.unmatched, clockMismatch: item.clockMismatch })
              }
              if(book==='betmgm'&&nbaPregameOpen(input.game)){
                if(Date.now()>=saveDeadline-12_000){failed++;return}
                try{
                  const coverage=(capture.regularCoverage??[]).filter(frame=>frame.gameId===input.game.id)
                  const observations=(capture.regular??[]).filter(frame=>frame.gameId===input.game.id)
                  const previous=await getNbaBookPropEntries(input.game,true)
                  // A stable, selected All menu with no player headers is a
                  // normal unavailable source, not withdrawal evidence. Prior
                  // contracts still need a fresh inspection before retiring.
                  const unavailable=!previous.length&&!observations.length&&coverage.length>0&&coverage.every(scope=>scope.status==='unavailable'&&!scope.complete&&!scope.contracts.length)
                  if(unavailable)regularDeferred++
                  else if(coverage.some(scope=>!scope.complete)||(!coverage.length&&!(matches.length===1&&['unlisted','closed'].includes(matches[0].status))))failed++
                  const reconciled=nbaReconcileBookPropFrames(input.game,observations,coverage,previous,capture.observedAt)
                  failed+=reconciled.failed
                  if(reconciled.frames.length){
                    if(Date.now()>=saveDeadline){failed++;return}
                    await saveNbaBookPropFrames(input.game,reconciled.frames,previous)
                    regularSaved+=reconciled.frames.length
                    regularQuotes+=reconciled.frames.reduce((sum,frame)=>sum+frame.props.length,0)
                  }
                }catch{failed++}
              }
            }))
          }
          return { book, checked: capture.games.length, saved, regularSaved, regularQuotes, regularDeferred, failed, deferred, observedAt: capture.observedAt, games, errors }
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
