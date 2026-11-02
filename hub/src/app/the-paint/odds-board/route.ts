import { NextRequest, NextResponse } from 'next/server'
import { requirePaintAccess } from '@/lib/paintAccess'
import { getPaintRoster, getPaintSchedule } from '@/lib/nbaPaintData'
import { nbaFullBoardCutoffs } from '@/lib/nbaFullBoardCutoffsData'
import { getNbaOddsGame } from '@/lib/nbaOddsClockData'
import { getNbaPhaseFrames, nbaPhaseBoundary, type NbaPhaseFrame } from '@/lib/nbaOddsPhaseData'
import { getNbaQuoteOpenings } from '@/lib/nbaOddsHistoryData'
import { readNbaPregameResearch } from '@/lib/nbaPregameResearchData'
import { nbaSharedCache } from '@/lib/nbaSharedCache'
import { nbaDate, nbaBinary, PAINT_MARKETS, type PaintBoard, type PaintGame, type PaintProp } from '@/lib/nbaPaint'
import { nbaOddsMode, nbaPregameOpen, type NbaOddsMode } from '@/lib/nbaOddsMode'
import { nbaBeforeCapture,nbaFullBoardCells,nbaPackFullBoard,nbaSelectPackedBoard,nbaTimestampNanoseconds, type NbaFullOddsBoard, type NbaPackedBoard } from '@/lib/nbaFullOddsBoard'

export const maxDuration = 120

export async function GET(request:NextRequest) {
  const gate=await requirePaintAccess();if(gate.error)return gate.error
  const date=request.nextUrl.searchParams.get('date'), market=request.nextUrl.searchParams.get('market'), book=request.nextUrl.searchParams.get('book')??'fanduel'
  if(!date||nbaDate(date)!==date||!PAINT_MARKETS.some(item=>item.key===market)||nbaBinary(market!)||!/^[a-z0-9_]{1,30}$/.test(book))return NextResponse.json({error:'Choose a valid date and market'},{status:400})
  const mode=nbaOddsMode(request.nextUrl.searchParams.get('mode'))
  try {
    const schedule=await getPaintSchedule(date)
    if(schedule.date!==date)return NextResponse.json(nbaPackFullBoard({date,games:[],players:[],cells:[],failed:[],unavailable:[],complete:schedule.complete}),{headers:{'Cache-Control':'private, no-store'}})
    if(schedule.games.length>16)throw new Error('NBA slate exceeds capacity')
    const games=await Promise.all(schedule.games.map(game=>getNbaOddsGame(game)))
    const key=games.map(game=>nbaPhaseBoundary(game,mode).key).sort().join('|')
    const partialKey=`odds-board-partial:v1:${date}:${market}:${key}`
    const interval=mode==='live'?60:300
    let cached:Awaited<ReturnType<typeof nbaSharedCache<NbaPackedBoard>>>
    try{
      cached=await nbaSharedCache(`odds-board:v1:${date}:${market}:${key}`,interval,mode==='live'?0:60,async()=>{
        const loaded=await loadSlate(date,market!,mode,games,schedule.complete),packed=nbaPackFullBoard(loaded)
        if(packed.identities.length>1024||packed.books.length>64||packed.times.length>36000||Buffer.byteLength(JSON.stringify(packed))>1_048_576)throw new Error('NBA odds board exceeds capacity')
        if(!loaded.complete){
          // Never overwrite the last verified complete slate with a partial
          // response. A separately cached partial serves other callers too.
          await nbaSharedCache(partialKey,interval,0,async()=>packed,25)
          throw new Error('NBA slate incomplete')
        }
        return packed
      },110,interval)
    }catch{
      cached=await nbaSharedCache(partialKey,interval,0,async()=>{throw new Error('NBA slate unavailable')},25)
    }
    // A phase crossing while a shared result was loading must not use the old
    // slate key. The next request loads the new boundary, never a live fallback.
    const phaseCheckedAt=Date.now(),check=await nbaFullBoardCutoffs(games)
    if(check.map(game=>nbaPhaseBoundary(game,mode).key).sort().join('|')!==key) return NextResponse.json({error:'Slate changed; please wait for the saved board.'},{status:503})
    return NextResponse.json({...nbaSelectPackedBoard(cached.value,book),stale:cached.stale,phaseCheckedAt},{headers:{'Cache-Control':'private, no-store'}})
  }catch{return NextResponse.json({error:'Odds board unavailable'},{status:503})}
}

async function loadSlate(date:string,market:string,mode:NbaOddsMode,games:PaintGame[],scheduleComplete:boolean):Promise<NbaFullOddsBoard> {
  const results:PromiseSettledResult<{game:PaintGame;players:NbaFullOddsBoard['players'];cells:NbaFullOddsBoard['cells'];missing:boolean}>[]=[]
  const deadline=Date.now()+100_000
  // Bounded concurrency: at most three games, two scoped frames per game; no
  // 96-frame history scan and no request per cell or subscriber.
  for(let offset=0;offset<games.length;offset+=3){
    if(Date.now()+26_000>=deadline)throw new Error('NBA slate deadline')
    results.push(...await Promise.allSettled(games.slice(offset,offset+3).map(async game=>{
    const [frames,openings,roster]=await Promise.all([
      getNbaPhaseFrames(game,mode,'props',{market,selection:'latest'}),
      getNbaQuoteOpenings(game.id,mode),
      nbaPregameOpen(game)?getPaintRoster(game):readNbaPregameResearch<PaintBoard>(game,'board:v1').then(snapshot=>{if(!snapshot)throw new Error('Saved roster unavailable');return snapshot.value.players}),
    ])
    const latest=frames.at(-1), previousAt=latest?nbaBeforeCapture(latest.captured_at):null
    if(!roster.length)throw new Error('NBA roster unavailable')
    const prior=previousAt?await getNbaPhaseFrames(game,mode,'props',{market,selection:'latest',asOf:previousAt}):[]
    const players=roster.map(player=>({gameId:game.id,id:player.id,first_name:player.first_name,last_name:player.last_name,position:player.position,team:player.team}))
    const known=new Set(players.map(player=>player.id))
    const lastPrior=prior.at(-1), currentAt=latest?nbaTimestampNanoseconds(latest.captured_at):null,priorAt=lastPrior?nbaTimestampNanoseconds(lastPrior.captured_at):null,limitAt=previousAt?nbaTimestampNanoseconds(previousAt):null
    if((latest&&currentAt==null)||(lastPrior&&(priorAt==null||limitAt==null||priorAt>limitAt)))throw new Error('Invalid NBA observation time')
    const quotesAt=(quotes:NbaPhaseFrame['quotes'],at:bigint|null)=>quotes.filter((quote):quote is PaintProp=>{
      if(!('prop_type' in quote))return false
      const observed=nbaTimestampNanoseconds(quote.updated_at)
      return observed!=null&&at!=null&&observed<=at
    })
    const current=latest?quotesAt(latest.quotes,currentAt):[],previous=lastPrior?quotesAt(lastPrior.quotes,priorAt):[]
    if(roster.length>150||current.length>5000||previous.length>5000||openings.length>100000)throw new Error('NBA odds board exceeds capacity')
    const cells=nbaFullBoardCells(game.id,market,current,previous,openings,latest?.captured_at).filter(cell=>known.has(cell.playerId))
    return {game,players,cells,missing:!latest}
    })))
  }
  const good=results.flatMap(result=>result.status==='fulfilled'?[result.value]:[])
  if(good.reduce((sum,value)=>sum+value.cells.length,0)>12000)throw new Error('NBA odds board exceeds capacity')
  const failed=results.flatMap((result,index)=>result.status==='rejected'?[games[index].id]:[]),unavailable=good.filter(value=>value.missing).map(value=>value.game.id)
  return {date,games,players:good.flatMap(value=>value.players),cells:good.flatMap(value=>value.cells),failed,unavailable,complete:scheduleComplete&&!failed.length&&!unavailable.length}
}
