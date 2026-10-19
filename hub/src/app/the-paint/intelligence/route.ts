import { NextRequest, NextResponse } from 'next/server'
import { requirePaintAccess } from '@/lib/paintAccess'
import { getPaintBoard, getPaintGame } from '@/lib/nbaPaintData'
import { getNbaDefenseContext } from '@/lib/nbaIntelligenceData'
export const maxDuration = 60
export async function GET(request: NextRequest) {
  const gate = await requirePaintAccess(); if (gate.error) return gate.error
  const id = request.nextUrl.searchParams.get('game')
  if (!id || !/^\d{1,10}$/.test(id)) return NextResponse.json({ error: 'Invalid matchup' }, { status: 400 })
  try {
    const board = await getPaintBoard(await getPaintGame(Number(id)))
    return NextResponse.json(await getNbaDefenseContext(board.sampleSeason, board.game.date), { headers: { 'Cache-Control': 'private, no-store' } })
  } catch { return NextResponse.json({ error: 'Defense research could not load. Try again shortly.' }, { status: 503 }) }
}
