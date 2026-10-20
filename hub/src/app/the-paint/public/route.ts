import {NextRequest,NextResponse} from 'next/server'
import {requirePaintAccess} from '@/lib/paintAccess'
import {getNbaPublicCaptures} from '@/lib/nbaPublicData'
export async function GET(request:NextRequest){
  const gate=await requirePaintAccess();if(gate.error)return gate.error
  const id=request.nextUrl.searchParams.get('game')
  if(!id||!/^\d{1,10}$/.test(id))return NextResponse.json({error:'Choose a matchup'},{status:400})
  try {
  const captures=await getNbaPublicCaptures(Number(id))
  return NextResponse.json({captures},{headers:{'Cache-Control':'private, no-store'}})
  } catch {return NextResponse.json({error:'Public activity could not load'},{status:503})}
}
