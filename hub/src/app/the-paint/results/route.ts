import {NextRequest,NextResponse} from 'next/server'
import {requirePaintAccess} from '@/lib/paintAccess'
import {getPaintGame,getPaintFinalStats} from '@/lib/nbaPaintData'
import {nbaAppeared,nbaValue,PAINT_MARKETS} from '@/lib/nbaPaint'
export const maxDuration=30
export async function GET(request:NextRequest){
  const gate=await requirePaintAccess();if(gate.error)return gate.error
  const id=request.nextUrl.searchParams.get('game')
  if(!id||!/^\d{1,10}$/.test(id))return NextResponse.json({error:'Choose a matchup'},{status:400})
  try{
    const game=await getPaintGame(Number(id)),started=['in_progress','final'].includes(game.status_state??'')||game.status==='Final'
    const stats=started?await getPaintFinalStats(game.id):{rows:[],complete:true}
    return NextResponse.json({status:game.status_state??(game.status==='Final'?'final':'scheduled'),complete:stats.complete,updatedAt:new Date().toISOString(),players:stats.rows.filter(r=>r.game.id===game.id).map(r=>({id:r.player.id,played:nbaAppeared(r)?true:null,values:Object.fromEntries(PAINT_MARKETS.map(m=>[m.key,nbaValue(r,m.key)]))}))},{headers:{'Cache-Control':'private, no-store'}})
  }catch{return NextResponse.json({error:'Game results could not refresh'},{status:503})}
}
