import { NextRequest, NextResponse } from 'next/server'
import { requirePaintAccess } from '@/lib/paintAccess'
import { getPaintBoard, getPaintGame } from '@/lib/nbaPaintData'
import { createHash } from 'node:crypto'
export const maxDuration = 120
export async function GET(request: NextRequest) {
  const gate = await requirePaintAccess(); if (gate.error) return gate.error
  const id = request.nextUrl.searchParams.get('game')
  if (!id || !/^\d{1,10}$/.test(id)) return NextResponse.json({ error: 'Choose a matchup' }, { status: 400 })
  try {
    const board=await getPaintBoard(await getPaintGame(Number(id)))
    // Cosmetic fetch/provider timestamps must not resend unchanged historical
    // samples. Every economic quote, identity, stat and coverage flag is hashed.
    const etag='W/"'+createHash('sha256').update(JSON.stringify(board,(key,value)=>key==='fetchedAt'||key==='updated_at'?undefined:value)).digest('hex')+'"'
    const headers={'Cache-Control':'private, no-store',ETag:etag,'X-NBA-Fetched-At':board.fetchedAt}
    if(request.headers.get('if-none-match')===etag)return new Response(null,{status:304,headers})
    return NextResponse.json(board,{headers})
  }
  catch { return NextResponse.json({ error: 'NBA data could not refresh. Your last view is still available.' }, { status: 503 }) }
}
