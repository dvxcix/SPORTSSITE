import { nbaOddsMode } from '@/lib/nbaOddsMode'
import { NextRequest, NextResponse } from 'next/server'
import { requirePaintAccess } from '@/lib/paintAccess'
import { getPaintBoard, getPaintGame } from '@/lib/nbaPaintData'
import { getNbaResearchFirstBasket } from '@/lib/nbaResearchResources'
export const maxDuration = 120
export async function GET(request: NextRequest) {
  const gate = await requirePaintAccess(); if (gate.error) return gate.error
  const mode = nbaOddsMode(request.nextUrl.searchParams.get('mode'))
  const id = request.nextUrl.searchParams.get('game')
  if (!id || !/^\d{1,10}$/.test(id)) return NextResponse.json({ error: 'Choose a valid NBA game' }, { status: 400 })
  try {
    const board = await getPaintBoard(await getPaintGame(Number(id)), mode)
    return NextResponse.json(await getNbaResearchFirstBasket(board, mode), { headers: { 'Cache-Control': 'private, no-store' } })
  } catch { return NextResponse.json({ error: 'No saved first-basket research available for this matchup' }, { status: 503 }) }
}
