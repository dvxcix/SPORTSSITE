import { nbaOddsMode } from '@/lib/nbaOddsMode'
import { NextRequest, NextResponse } from 'next/server'
import { requirePaintAccess } from '@/lib/paintAccess'
import { getPaintBoard, getPaintGame } from '@/lib/nbaPaintData'
import { nbaDate, nbaPeriod, PAINT_MARKETS } from '@/lib/nbaPaint'
import { nbaMarketRanks } from '@/lib/nbaMarketMetrics'
import { nbaSeasonDisplayBoard } from '@/lib/nbaSeasonDisplay'
import { getNbaOddsBoardPhase } from '@/lib/nbaOddsBoardPhaseData'
import { createHash } from 'node:crypto'
import { publicWorkspacePhase, publicWorkspaceScope } from '@/lib/publicWorkspaceScope'
import { nbaOddsBoardPhaseHeader, nbaReadOddsBoardPhase } from '@/lib/nbaOddsBoardPhase'
export const maxDuration = 120
export async function GET(request: NextRequest) {
  const gate = await requirePaintAccess(); if (gate.error) return gate.error
  const mode = nbaOddsMode(request.nextUrl.searchParams.get('mode'))
  const id = request.nextUrl.searchParams.get('game')
  const slateDate=request.nextUrl.searchParams.get('slate_date')
  const phaseOnly=request.nextUrl.searchParams.get('phase_only')==='1'
  const nativeMetric = request.nextUrl.searchParams.get('native_mm')
  const market = PAINT_MARKETS.find(item => item.key === nativeMetric)?.key
  const book = request.nextUrl.searchParams.get('book') ?? 'all'
  if (nativeMetric !== null && (!market || !/^[a-z0-9_]{1,30}$/.test(book) || phaseOnly)) {
    return NextResponse.json({ error: 'Choose a valid market and sportsbook' }, { status: 400 })
  }
  if(slateDate!=null&&nbaDate(slateDate)!==slateDate)return NextResponse.json({error:'Choose a valid date'},{status:400})
  if(phaseOnly){
    if(!slateDate)return NextResponse.json({error:'Choose a valid date'},{status:400})
    const phase=await getNbaOddsBoardPhase(slateDate).catch(()=>null)
    if(!phase)return NextResponse.json({error:'Game times unavailable'},{status:503,headers:{'Cache-Control':'private, no-store'}})
    const parsed=nbaReadOddsBoardPhase(phase.header,slateDate,Date.now())
    const header=parsed?nbaOddsBoardPhaseHeader(publicWorkspacePhase(parsed)):publicWorkspaceScope('nba')?'unavailable':phase.header
    return new Response(null,{status:204,headers:{'Cache-Control':'private, no-store','X-NBA-Slate-Phase':header,'X-NBA-Slate-Phase-Expires':String(phase.expiresAt)}})
  }
  if (!id || !/^\d{1,10}$/.test(id)) return NextResponse.json({ error: 'Choose a matchup' }, { status: 400 })
  try {
    // The lightweight phase check runs only for an open Odds Board. It is
    // shared across instances and applies even when the board returns 304.
    const phasePromise=slateDate && !market?getNbaOddsBoardPhase(slateDate).catch(()=>null):Promise.resolve(null)
    const source = await getPaintBoard(await getPaintGame(Number(id)), mode)
    const board=nbaSeasonDisplayBoard(source),phase=await phasePromise
    if(slateDate&&board.game.date!==slateDate)return NextResponse.json({error:'Choose a valid date'},{status:400})
    if (market) {
      // A reduced presentation board cannot replace the original ranking pool.
      const ranked = board === source && source.statsComplete && (!nbaPeriod(market) || source.periodStatsComplete === true)
        ? nbaMarketRanks(source.players, market, book, 'all', { gameId: source.game.id, beforeDate: source.game.date })
        : new Map()
      const rows = [...ranked].map(([playerId, result]) => ({ playerId, mm: result.mm, marketRank: result.marketRank, statRank: result.statRank }))
      return NextResponse.json({ gameId: board.game.id, date: board.game.date, mode, market, book,
        snapshotAt: board.researchSnapshot?.observedAt ?? board.fetchedAt, rows }, { headers: { 'Cache-Control': 'private, no-store' } })
    }
    // A changed quote timestamp is a new observation even at the same price.
    // Only the board fetch time is cosmetic; preserve all source quote times.
    const etag='W/"'+createHash('sha256').update(JSON.stringify({...board,fetchedAt:undefined})).digest('hex')+'"'
    const headers:Record<string,string>={'Cache-Control':'private, no-store',ETag:etag,'X-NBA-Fetched-At':board.fetchedAt}
    if(slateDate){const parsed=phase&&nbaReadOddsBoardPhase(phase.header,slateDate,Date.now());headers['X-NBA-Slate-Phase']=parsed?nbaOddsBoardPhaseHeader(publicWorkspacePhase(parsed)):publicWorkspaceScope('nba')?'unavailable':phase?.header??'unavailable';if(phase)headers['X-NBA-Slate-Phase-Expires']=String(phase.expiresAt)}
    if(request.headers.get('if-none-match')===etag)return new Response(null,{status:304,headers})
    return NextResponse.json(board,{headers})
  }
  catch { return NextResponse.json({ error: 'NBA data could not refresh. Your last view is still available.' }, { status: 503 }) }
}
