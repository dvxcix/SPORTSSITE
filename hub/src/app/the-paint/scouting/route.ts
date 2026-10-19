import { NextRequest, NextResponse } from 'next/server'
import { requirePaintAccess } from '@/lib/paintAccess'
import { getPaintGame, getPaintScouting } from '@/lib/nbaPaintData'
export const maxDuration=60
export async function GET(request:NextRequest){
  const gate=await requirePaintAccess();if(gate.error)return gate.error
  const id=request.nextUrl.searchParams.get('game')
  if(!id||!/^\d{1,10}$/.test(id))return NextResponse.json({error:'Choose a matchup'},{status:400})
  try{return NextResponse.json(await getPaintScouting(await getPaintGame(Number(id))),{headers:{'Cache-Control':'private, no-store'}})}
  catch{return NextResponse.json({error:'Tracking could not load. Game logs are still available.'},{status:503})}
}
