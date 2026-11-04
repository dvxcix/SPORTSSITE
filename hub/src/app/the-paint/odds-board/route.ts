import { NextRequest, NextResponse } from 'next/server'
import { requirePaintAccess } from '@/lib/paintAccess'
import { artwork, getPaintRoster, getPaintSchedule } from '@/lib/nbaPaintData'
import { nbaFullBoardCutoffs } from '@/lib/nbaFullBoardCutoffsData'
import { getNbaOddsBoardPhase } from '@/lib/nbaOddsBoardPhaseData'
import { nbaBoardPhaseGames,nbaOddsBoardPhaseSignature,nbaReadOddsBoardPhase } from '@/lib/nbaOddsBoardPhase'
import { getNbaOddsGame } from '@/lib/nbaOddsClockData'
import { getNbaPhaseFrames, nbaPhaseBoundary, type NbaPhaseFrame } from '@/lib/nbaOddsPhaseData'
import { getNbaQuoteOpenings } from '@/lib/nbaOddsHistoryData'
import { getNbaBoardPublicCaptures } from '@/lib/nbaBoardPublicData'
import { nbaBoardPublicTotals } from '@/lib/nbaBoardEstimatedPicks'
import { nbaLiveFirstSeenConfident } from '@/lib/nbaLiveFirstSeenData'
import { readNbaPregameResearch } from '@/lib/nbaPregameResearchData'
import { nbaSharedCache } from '@/lib/nbaSharedCache'
import { nbaDate, nbaBinary, PAINT_MARKETS, type PaintBoard, type PaintGame, type PaintProp } from '@/lib/nbaPaint'
import { nbaGameStart, nbaOddsMode, nbaPregameOpen, type NbaOddsMode } from '@/lib/nbaOddsMode'
import { nbaBeforeCapture,nbaFullBoardCells,nbaLiveBoardQuotes,nbaPackFullBoard,nbaPackFullBoardWithinLimit,nbaSelectPackedBoard,nbaTimestampNanoseconds, type NbaFullOddsBoard, type NbaPackedBoard } from '@/lib/nbaFullOddsBoard'
import { nbaFullBoardPlayers } from '@/lib/nbaFullBoardPlayers'

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
    // Complete slates share one small phase proof instead of one clock-cache
    // lookup per game per viewer. An incomplete pregame slate retains its
    // existing per-game resolution and partial reporting.
    const readPhase=async()=>{
      const token=await getNbaOddsBoardPhase(date),now=Date.now(),phase=nbaReadOddsBoardPhase(token.header,date,now)
      if(!phase||!Number.isSafeInteger(token.expiresAt)||token.expiresAt<=now)throw new Error('NBA phase unavailable')
      return phase
    }
    const games=schedule.complete?nbaBoardPhaseGames(schedule.games,await readPhase()):await Promise.all(schedule.games.map(game=>getNbaOddsGame(game)))
    const key=games.map(game=>nbaPhaseBoundary(game,mode).key).sort().join('|')
    // Headshots are part of the shared slate, never a per-viewer lookup.
    // A new key prevents older portrait-free packed boards surviving rollout.
    const version='v5'
    const partialKey=`odds-board-partial:${version}:${date}:${market}:${key}`
    const interval=mode==='live'?60:300
    let cached:Awaited<ReturnType<typeof nbaSharedCache<NbaPackedBoard>>>
    try{
      cached=await nbaSharedCache(`odds-board:${version}:${date}:${market}:${key}`,interval,mode==='live'?0:60,async()=>{
        const loaded=await loadSlate(date,market!,mode,games,schedule.complete),packed=nbaPackFullBoardWithinLimit(loaded)
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
      // During the cache-version transition, keep a still-eligible complete
      // board from the exact same phase/cutoff. Never call a source loader or
      // refresh its original quote times; the final cutoff check still applies.
      const priorVersion=mode==='live'?'v3':'v2'
      try {
        const prior=await nbaSharedCache<NbaPackedBoard>(`odds-board:${priorVersion}:${date}:${market}:${key}`,interval,mode==='live'?0:60,async()=>{throw new Error('NBA prior slate unavailable')},25)
        if(!prior.value.complete)throw new Error('NBA prior slate incomplete')
        cached={...prior,stale:true}
      }catch{
        cached=await nbaSharedCache(partialKey,interval,0,async()=>{throw new Error('NBA slate unavailable')},25)
      }
    }
    // A phase crossing while a shared result was loading must not use the old
    // slate key. The next request loads the new boundary, never a live fallback.
    let phaseCheckedAt:number
    if(mode==='pregame'){
      phaseCheckedAt=Date.now();const check=await nbaFullBoardCutoffs(games)
      if(check.map(game=>nbaPhaseBoundary(game,mode).key).sort().join('|')!==key) return NextResponse.json({error:'Slate changed; please wait for the saved board.'},{status:503})
    }else{
      // Reuse the shared phase proof's original pre-read time, not the time
      // a cached clock was returned. Mismatched/expired proofs fail closed.
      const phase=await readPhase()
      if(phase.signature!==nbaOddsBoardPhaseSignature(games))throw new Error('NBA phase unavailable')
      phaseCheckedAt=phase.checkedAt
    }
    return NextResponse.json({...nbaSelectPackedBoard(cached.value,book),stale:cached.stale,phaseCheckedAt},{headers:{'Cache-Control':'private, no-store'}})
  }catch{return NextResponse.json({error:'Odds board unavailable'},{status:503})}
}

async function loadSlate(date:string,market:string,mode:NbaOddsMode,games:PaintGame[],scheduleComplete:boolean):Promise<NbaFullOddsBoard> {
  const results:PromiseSettledResult<{game:PaintGame;players:NbaFullOddsBoard['players'];cells:NbaFullOddsBoard['cells'];missing:boolean;firstUnavailable:boolean;firstFailed:boolean}>[]=[]
  const deadline=Date.now()+100_000
  // Bounded concurrency: at most three games, two scoped frames per game; no
  // 96-frame history scan and no request per cell or subscriber.
  for(let offset=0;offset<games.length;offset+=3){
    if(Date.now()+26_000>=deadline)throw new Error('NBA slate deadline')
    results.push(...await Promise.allSettled(games.slice(offset,offset+3).map(async game=>{
    const open=nbaPregameOpen(game)
    const [frames,openingResult,roster,confidenceResult]=await Promise.all([
      getNbaPhaseFrames(game,mode,'props',{market,selection:'latest'}),
      getNbaQuoteOpenings(game.id,mode).then(value=>({value,ok:true as const}),()=>({value:[],ok:false as const})),
      open?getPaintRoster(game):readNbaPregameResearch<PaintBoard>(game,'board:v1').then(snapshot=>{if(!snapshot)throw new Error('Saved roster unavailable');return snapshot.value.players}),
      mode==='live'?nbaLiveFirstSeenConfident(game).then(value=>({value,ok:true as const}),()=>({value:false,ok:false as const})):Promise.resolve({value:true,ok:true as const}),
    ])
    const openings=openingResult.value,firstSeenConfident=confidenceResult.value
    const latest=frames.at(-1), previousAt=latest?nbaBeforeCapture(latest.captured_at):null
    if(!roster.length)throw new Error('NBA roster unavailable')
    const prior=previousAt?await getNbaPhaseFrames(game,mode,'props',{market,selection:'latest',asOf:previousAt}):[]
    const players=(await nbaFullBoardPlayers(game,roster,open,!!latest?.quotes.length,artwork)).map(player=>({...player,publicPicks:null}))
    const known=new Set(players.map(player=>player.id))
    const lastPrior=prior.at(-1), currentAt=latest?nbaTimestampNanoseconds(latest.captured_at):null,priorAt=lastPrior?nbaTimestampNanoseconds(lastPrior.captured_at):null,limitAt=previousAt?nbaTimestampNanoseconds(previousAt):null
    if((latest&&currentAt==null)||(lastPrior&&(priorAt==null||limitAt==null||priorAt>limitAt)))throw new Error('Invalid NBA observation time')
    const quotesAt=(quotes:NbaPhaseFrame['quotes'],at:bigint|null)=>quotes.filter((quote):quote is PaintProp=>{
      if(!('prop_type' in quote))return false
      const observed=nbaTimestampNanoseconds(quote.updated_at)
      return observed!=null&&at!=null&&observed<=at
    })
    const cutoff=nbaPhaseBoundary(game,mode).tipoff,cutoffAt=nbaTimestampNanoseconds(cutoff)
    if(cutoffAt==null)throw new Error('Invalid NBA phase cutoff')
    const currentRaw=latest?quotesAt(latest.quotes,currentAt):[],previousRaw=lastPrior?quotesAt(lastPrior.quotes,priorAt):[]
    const current=mode==='live'&&latest?nbaLiveBoardQuotes(currentRaw,latest.captured_at,cutoff):currentRaw
    const previous=mode==='live'&&lastPrior?(priorAt!>=cutoffAt?nbaLiveBoardQuotes(previousRaw,lastPrior.captured_at,cutoff):[]):previousRaw
    if(roster.length>150||current.length>5000||previous.length>5000||openings.length>100000)throw new Error('NBA odds board exceeds capacity')
    // Never borrow a pregame opening in Live, even if an upstream cache or
    // reader returns a malformed row. First-seen time must satisfy this exact
    // phase cutoff and the observation must already exist by the saved frame.
    const eligibleOpenings=firstSeenConfident?openings.filter(row=>{
      const at=nbaTimestampNanoseconds(row.observed_at)
      return at!=null && currentAt!=null && at<=currentAt && (mode==='live'?at>=cutoffAt:at<cutoffAt)
    }):[]
    const cells=nbaFullBoardCells(game.id,market,current,previous,eligibleOpenings,latest?.captured_at).filter(cell=>known.has(cell.playerId))
    return {game,players,cells,missing:!latest,firstUnavailable:!openingResult.ok||!confidenceResult.ok||!firstSeenConfident,firstFailed:!openingResult.ok||!confidenceResult.ok}
    })))
  }
  const good=results.flatMap(result=>result.status==='fulfilled'?[result.value]:[])
  // Optional public counts never delay the critical quote/roster work. Reads
  // run only in the shared slate fill, at most four at once and within the
  // remaining route budget; each database request aborts after 1.5 seconds.
  const publicGames=good.filter(value=>value.cells.length>0),publicDeadline=Math.min(Date.now()+3_500,deadline-2_000)
  for(let offset=0;offset<publicGames.length&&Date.now()+1_750<publicDeadline;offset+=4){
    await Promise.all(publicGames.slice(offset,offset+4).map(async value=>{
      try{
        const captures=await getNbaBoardPublicCaptures(value.game,mode)
        const totals=nbaBoardPublicTotals(captures,value.game.id,market,mode,nbaGameStart(value.game)??NaN)
        value.players=value.players.map(player=>({...player,publicPicks:totals.get(player.id)??null}))
      }catch{/* Prices remain available if public counts cannot load. */}
    }))
  }
  if(good.reduce((sum,value)=>sum+value.cells.length,0)>12000)throw new Error('NBA odds board exceeds capacity')
  const failed=results.flatMap((result,index)=>result.status==='rejected'?[games[index].id]:[]),unavailable=good.filter(value=>value.missing).map(value=>value.game.id)
  const firstUnavailable=good.filter(value=>value.firstUnavailable).map(value=>value.game.id)
  return {date,games,players:good.flatMap(value=>value.players),cells:good.flatMap(value=>value.cells),failed,unavailable,firstUnavailable,complete:scheduleComplete&&!failed.length&&!unavailable.length&&!good.some(value=>value.firstFailed)}
}
