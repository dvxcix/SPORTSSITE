import { nbaOddsMode } from '@/lib/nbaOddsMode'
import {NextRequest,NextResponse} from 'next/server'
import {requirePaintAccess} from '@/lib/paintAccess'
import {getPaintBoard,getPaintGame} from '@/lib/nbaPaintData'
import {getNbaResearchTracking} from '@/lib/nbaResearchResources'
import {nbaSeasonTrackingView} from '@/lib/nbaSeasonTrackingView'
import {resolveNbaResearchBundle} from '@/lib/nbaResearchBundle'
export const maxDuration=120
export async function GET(request:NextRequest){
 const gate=await requirePaintAccess();if(gate.error)return gate.error
  const mode = nbaOddsMode(request.nextUrl.searchParams.get('mode'))
 const id=request.nextUrl.searchParams.get('game');if(!id||!/^\d{1,10}$/.test(id))return NextResponse.json({error:'Choose a matchup'},{status:400})
 try{const initial=await getPaintBoard(await getPaintGame(Number(id)),mode),{board,value:data}=await resolveNbaResearchBundle(initial,mode,current=>getNbaResearchTracking(current,mode));if(data.gameId!==board.game.id)throw new Error('Tracking identity mismatch');return NextResponse.json(nbaSeasonTrackingView(board,data),{headers:{'Cache-Control':'private, no-store'}})}catch{return NextResponse.json({error:'Game tracking could not load. No saved sample is available for this matchup.'},{status:503})}
}
