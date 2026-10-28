import {NextRequest,NextResponse} from 'next/server'
import {requirePaintAdmin} from '@/lib/paintAccess'
import {GET as capture} from '@/app/api/cron/poll-pikkit-nba-picks/route'
import {nbaPublicCaptureSelection} from '@/lib/nbaPublicCaptureControl'
export const maxDuration=300
export async function POST(request:NextRequest){
  const gate=await requirePaintAdmin();if(gate.error)return gate.error
  const body=await request.json().catch(()=>null)
  if(body?.game!==undefined&&body?.games!==undefined)return NextResponse.json({error:'Choose one game selection'},{status:400})
  const games=nbaPublicCaptureSelection(body?.games??(body?.game===undefined?null:[body.game]))
  if(!games)return NextResponse.json({error:'Choose up to 12 matchups'},{status:400})
  if(!process.env.CRON_SECRET)return NextResponse.json({error:'Capture is not configured'},{status:503})
  const url=new URL('/api/cron/poll-pikkit-nba-picks',request.url);url.searchParams.set(games.length===1?'game':'games',games.join(','))
  return capture(new Request(url,{headers:{authorization:`Bearer ${process.env.CRON_SECRET}`,'x-slipsurge-trigger':'admin-nba-public'}}))
}
