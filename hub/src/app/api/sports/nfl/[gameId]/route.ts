import { NextResponse } from 'next/server'
import { getNflGameCenter } from '@/lib/nflGameCenterServer'

export async function GET(_request: Request, { params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params
  if (!/^\d{4}_\d{2}_[A-Z]{2,3}_[A-Z]{2,3}$/.test(gameId)) return NextResponse.json({ error: 'Invalid game' }, { status: 400 })
  try {
    const data = await getNflGameCenter(gameId)
    if (!data) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    return NextResponse.json(data, { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=15, stale-while-revalidate=30' } })
  } catch {
    return NextResponse.json({ error: 'Scores temporarily unavailable' }, { status: 503 })
  }
}
