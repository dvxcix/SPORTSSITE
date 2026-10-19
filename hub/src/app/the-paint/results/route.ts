import {NextRequest,NextResponse} from 'next/server'
import {requirePaintAccess} from '@/lib/paintAccess'
import {getPaintGame,getPaintFinalStats} from '@/lib/nbaPaintData'
import {nbaAppeared,nbaPeriod,nbaValue,PAINT_MARKETS,type PaintStat} from '@/lib/nbaPaint'
export const maxDuration=60
export async function GET(request:NextRequest){
 const gate=await requirePaintAccess();if(gate.error)return gate.error
 const id=request.nextUrl.searchParams.get('game')
 if(!id||!/^\d{1,10}$/.test(id))return NextResponse.json({error:'Choose a matchup'},{status:400})
 try{
  const game=await getPaintGame(Number(id)),started=['in_progress','final'].includes(game.status_state??'')||game.status==='Final',final=game.status_state==='final'||game.status==='Final'
  const [full,quarter]=await Promise.allSettled([started?getPaintFinalStats(game.id):Promise.resolve({rows:[] as PaintStat[],complete:true}),final?getPaintFinalStats(game.id,1):Promise.resolve({rows:[] as PaintStat[],complete:true})])
  if(full.status==='rejected')throw new Error('Results unavailable')
  const stats=full.value,quarters=quarter.status==='fulfilled'?quarter.value.rows:[]
  return NextResponse.json({status:game.status_state??(final?'final':'scheduled'),complete:stats.complete&&quarter.status==='fulfilled'&&quarter.value.complete,updatedAt:new Date().toISOString(),players:stats.rows.filter(r=>r.game.id===game.id).map(r=>({id:r.player.id,played:nbaAppeared(r)?true:null,values:Object.fromEntries(PAINT_MARKETS.map(m=>{const row=nbaPeriod(m.key)?quarters.find(q=>q.player.id===r.player.id&&q.game.id===game.id):r;return[m.key,row&&nbaAppeared(row)?nbaValue(row,m.key):null]}))}))},{headers:{'Cache-Control':'private, no-store'}})
 }catch{return NextResponse.json({error:'Game results could not refresh'},{status:503})}
}
