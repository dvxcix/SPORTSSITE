import { NextRequest,NextResponse } from 'next/server'
import { requirePaintAccess } from '@/lib/paintAccess'
import { getPaintSchedule } from '@/lib/nbaPaintData'
import { nbaDate } from '@/lib/nbaPaint'
import { getNbaFirstOdds,NbaFirstOddsUnavailable } from '@/lib/nbaFirstBasketOddsData'
import { attachNbaFirstBasketHistory } from '@/lib/nbaFirstBasketHistoryData'
export const maxDuration=120
export async function GET(request:NextRequest){
  const gate=await requirePaintAccess();if(gate.error)return gate.error
  const date=request.nextUrl.searchParams.get('date')
  if(!date||nbaDate(date)!==date)return NextResponse.json({error:'Choose a valid NBA slate date'},{status:400})
  try{
    const schedule=await getPaintSchedule(date),games=schedule.games.slice(0,16)
    const results=[]
    for(let offset=0;offset<games.length;offset+=4)results.push(...await Promise.allSettled(games.slice(offset,offset+4).map(async game=>{
      const result=await getNbaFirstOdds(game)
      try{return {...result,rows:await attachNbaFirstBasketHistory(game.id,result.rows,result.observedAt),historyAvailable:true}}
      catch{return {...result,historyAvailable:false}}
    })))
    const rows=results.flatMap(r=>r.status==='fulfilled'?r.value.rows:[]),failures=results.filter(r=>r.status==='rejected')
    const connection=failures.some(r=>r.status==='rejected'&&r.reason instanceof NbaFirstOddsUnavailable&&['connection','authorization'].includes(r.reason.reason))
    return NextResponse.json({date:schedule.date,requestedDate:date,games:schedule.games.length,loaded:results.filter(r=>r.status==='fulfilled').length,failed:failures.length,status:connection?'connection_unavailable':failures.length?'partial':rows.length?'ready':'not_posted',rows,historyAvailable:results.every(r=>r.status==='fulfilled'&&r.value.historyAvailable),unmatched:results.reduce((n,r)=>n+(r.status==='fulfilled'?r.value.unmatched:0),0),...(gate.isAdmin?{diagnostics:{withheldMethods:[...new Set(results.flatMap(r=>r.status==='fulfilled'?'withheldMethods' in r.value?r.value.withheldMethods??[]:[]:[]))]}}:{}),fetchedAt:new Date().toISOString()},{headers:{'Cache-Control':'private, no-store'}})
  }catch{return NextResponse.json({error:'First-basket odds could not refresh.'},{status:503})}
}
