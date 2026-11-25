import { nbaOddsMode } from '@/lib/nbaOddsMode'
import { NextRequest,NextResponse } from 'next/server'
import { requirePaintAccess } from '@/lib/paintAccess'
import { getPaintSchedule } from '@/lib/nbaPaintData'
import { nbaDate } from '@/lib/nbaPaint'
import { getNbaFirstOddsForMode,NbaFirstOddsUnavailable } from '@/lib/nbaFirstBasketOddsData'
import { attachNbaFirstBasketHistory } from '@/lib/nbaFirstBasketHistoryData'
import { nbaFirstQuoteVisible } from '@/lib/nbaFirstQuoteFreshness'
import { publicWorkspaceGames } from '@/lib/publicWorkspaceScope'
export const maxDuration=120
export async function GET(request:NextRequest){
  const gate=await requirePaintAccess();if(gate.error)return gate.error
  const mode = nbaOddsMode(request.nextUrl.searchParams.get('mode'))
  const date=request.nextUrl.searchParams.get('date'), selected=request.nextUrl.searchParams.get('game')
  if(!date||nbaDate(date)!==date)return NextResponse.json({error:'Choose a valid NBA slate date'},{status:400})
  if(selected!=null&&!/^[1-9]\d{0,9}$/.test(selected))return NextResponse.json({error:'Choose a valid NBA matchup'},{status:400})
  try{
    const fullSchedule=await getPaintSchedule(date,true)
    const scopedGames=publicWorkspaceGames(fullSchedule.games,'nba')
    const schedule={...fullSchedule,games:selected==null?scopedGames:scopedGames.filter(game=>String(game.id)===selected)}
    if(selected!=null&&!schedule.games.length)return NextResponse.json({error:'Matchup not found'},{status:404})
    const games=schedule.games.slice(0,16)
    const results=[]
    for(let offset=0;offset<games.length;offset+=4)results.push(...await Promise.allSettled(games.slice(offset,offset+4).map(async game=>{
      const result=await getNbaFirstOddsForMode(game, mode)
      try{return {...result,rows:await attachNbaFirstBasketHistory(game.id,result.rows,result.observedAt, mode),historyAvailable:true}}
      catch{return {...result,historyAvailable:false}}
    })))
    const rawRows=results.flatMap(r=>r.status==='fulfilled'?r.value.rows:[]),failures=results.filter(r=>r.status==='rejected')
    const frozenGameIds=results.flatMap((result,index)=>result.status==='fulfilled'&&'frozen' in result.value&&result.value.frozen?[games[index].id]:[])
    // History work and later game batches can cross a source expiry or tipoff.
    // Recheck the entire response at one server clock after all work completes.
    const responseAt=Date.now(),rows=rawRows.filter(row=>nbaFirstQuoteVisible(row,mode,responseAt,frozenGameIds))
    const bookCoverage=results.flatMap(result=>result.status==='fulfilled'&&'bookCoverage' in result.value?result.value.bookCoverage??[]:[]).map(report=>report.status==='fresh'&&responseAt-Date.parse(report.quoteAt??'')>300_000?{...report,status:'expired' as const,quotes:0}:report)
    const incompleteBooks=bookCoverage.some(row=>['expired','invalid','wrong_phase','unavailable'].includes(row.status))
    const connection=failures.some(r=>r.status==='rejected'&&r.reason instanceof NbaFirstOddsUnavailable&&['connection','authorization'].includes(r.reason.reason))
    return NextResponse.json({mode,date:schedule.date,requestedDate:date,games:schedule.games.length,loaded:results.filter(r=>r.status==='fulfilled').length,failed:failures.length,status:connection?'connection_unavailable':failures.length||incompleteBooks||rows.length!==rawRows.length?'partial':rows.length?'ready':'not_posted',rows,frozenGameIds,bookCoverage,historyAvailable:results.every(r=>r.status==='fulfilled'&&r.value.historyAvailable),unmatched:results.reduce((n,r)=>n+(r.status==='fulfilled'?r.value.unmatched:0),0),...(gate.isAdmin?{diagnostics:{withheldMethods:[...new Set(results.flatMap(r=>r.status==='fulfilled'?'withheldMethods' in r.value?r.value.withheldMethods??[]:[]:[]))]}}:{}),fetchedAt:new Date(responseAt).toISOString()},{headers:{'Cache-Control':'private, no-store'}})
  }catch{return NextResponse.json({error:'First-basket odds could not refresh.'},{status:503})}
}
