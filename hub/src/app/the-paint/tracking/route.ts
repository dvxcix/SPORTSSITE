import {NextRequest,NextResponse} from 'next/server'
import {requirePaintAccess} from '@/lib/paintAccess'
import {getPaintBoard,getPaintGame} from '@/lib/nbaPaintData'
import {getNbaTracking} from '@/lib/nbaTrackingData'
export const maxDuration=120
export async function GET(request:NextRequest){
 const gate=await requirePaintAccess();if(gate.error)return gate.error
 const id=request.nextUrl.searchParams.get('game');if(!id||!/^\d{1,10}$/.test(id))return NextResponse.json({error:'Choose a matchup'},{status:400})
 try{return NextResponse.json(await getNbaTracking(await getPaintBoard(await getPaintGame(Number(id)))),{headers:{'Cache-Control':'private, no-store'}})}catch{return NextResponse.json({error:'Game tracking could not load. Try again shortly.'},{status:503})}
}
