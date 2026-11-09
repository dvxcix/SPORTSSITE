import { nbaOddsMode } from '@/lib/nbaOddsMode'
import { NextRequest, NextResponse } from 'next/server'
import { requirePaintAccess } from '@/lib/paintAccess'
import { getPaintBoard, getPaintGame } from '@/lib/nbaPaintData'
import { nbaDate } from '@/lib/nbaPaint'
import { nbaSeasonDisplayBoard } from '@/lib/nbaSeasonDisplay'
import { getNbaOddsBoardPhase } from '@/lib/nbaOddsBoardPhaseData'
import { createHash } from 'node:crypto'
export const maxDuration = 120
export async function GET(request: NextRequest) {
  const gate = await requirePaintAccess(); if (gate.error) return gate.error
  const mode = nbaOddsMode(request.nextUrl.searchParams.get('mode'))
  const id = request.nextUrl.searchParams.get('game')
  const slateDate=request.nextUrl.searchParams.get('slate_date')
  const phaseOnly=request.nextUrl.searchParams.get('phase_only')==='1'
  if(slateDate!=null&&nbaDate(slateDate)!==slateDate)return NextResponse.json({error:'Choose a valid date'},{status:400})
  if(phaseOnly){
    if(!slateDate)return NextResponse.json({error:'Choose a valid date'},{status:400})
    const phase=await getNbaOddsBoardPhase(slateDate).catch(()=>null)
    if(!phase)return NextResponse.json({error:'Game times unavailable'},{status:503,headers:{'Cache-Control':'private, no-store'}})
    return new Response(null,{status:204,headers:{'Cache-Control':'private, no-store','X-NBA-Slate-Phase':phase.header,'X-NBA-Slate-Phase-Expires':String(phase.expiresAt)}})
  }
  if (!id || !/^\d{1,10}$/.test(id)) return NextResponse.json({ error: 'Choose a matchup' }, { status: 400 })
  try {
    // The lightweight phase check runs only for an open Odds Board. It is
    // shared across instances and applies even when the board returns 304.
    const phasePromise=slateDate?getNbaOddsBoardPhase(slateDate).catch(()=>null):Promise.resolve(null)
    const board=nbaSeasonDisplayBoard(await getPaintBoard(await getPaintGame(Number(id)), mode)),phase=await phasePromise
    if(slateDate&&board.game.date!==slateDate)return NextResponse.json({error:'Choose a valid date'},{status:400})
    // A changed quote timestamp is a new observation even at the same price.
    // Only the board fetch time is cosmetic; preserve all source quote times.
    const etag='W/"'+createHash('sha256').update(JSON.stringify({...board,fetchedAt:undefined})).digest('hex')+'"'
    const headers:Record<string,string>={'Cache-Control':'private, no-store',ETag:etag,'X-NBA-Fetched-At':board.fetchedAt}
    if(slateDate){headers['X-NBA-Slate-Phase']=phase?.header??'unavailable';if(phase)headers['X-NBA-Slate-Phase-Expires']=String(phase.expiresAt)}
    if(request.headers.get('if-none-match')===etag)return new Response(null,{status:304,headers})
    return NextResponse.json(board,{headers})
  }
  catch { return NextResponse.json({ error: 'NBA data could not refresh. Your last view is still available.' }, { status: 503 }) }
}
