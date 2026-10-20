import {NextRequest,NextResponse} from 'next/server'
import {requirePaintAccess} from '@/lib/paintAccess'
import {createAdminClient} from '@/lib/supabase/admin'
export async function GET(request:NextRequest){
  const gate=await requirePaintAccess();if(gate.error)return gate.error
  const id=request.nextUrl.searchParams.get('game')
  if(!id||!/^\d{1,10}$/.test(id))return NextResponse.json({error:'Choose a matchup'},{status:400})
  const {data,error}=await createAdminClient().from('nba_public_captures').select('snapshot,captured_at').eq('game_id',Number(id)).order('captured_at',{ascending:false}).limit(2).abortSignal(AbortSignal.timeout(12000))
  if(error)return NextResponse.json({error:'Public activity could not load'},{status:503})
  const captures=(data??[]).map(({snapshot,captured_at})=>({captured_at,snapshot:{gameId:snapshot.gameId,capturedAt:snapshot.capturedAt,rows:snapshot.rows,markets:snapshot.markets}}))
  return NextResponse.json({captures},{headers:{'Cache-Control':'private, no-store'}})
}
