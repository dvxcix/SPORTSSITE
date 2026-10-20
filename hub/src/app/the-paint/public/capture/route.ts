import {NextRequest,NextResponse} from 'next/server'
import {requirePaintAdmin} from '@/lib/paintAccess'
import {GET as capture} from '@/app/api/cron/poll-pikkit-nba-picks/route'
export const maxDuration=300
export async function POST(request:NextRequest){
  const gate=await requirePaintAdmin();if(gate.error)return gate.error
  const body=await request.json().catch(()=>null)
  if(!Number.isSafeInteger(body?.game)||body.game<=0)return NextResponse.json({error:'Choose a matchup'},{status:400})
  if(!process.env.CRON_SECRET)return NextResponse.json({error:'Capture is not configured'},{status:503})
  const url=new URL('/api/cron/poll-pikkit-nba-picks',request.url);url.searchParams.set('game',String(body.game))
  return capture(new Request(url,{headers:{authorization:`Bearer ${process.env.CRON_SECRET}`,'x-slipsurge-trigger':'admin-nba-public'}}))
}
