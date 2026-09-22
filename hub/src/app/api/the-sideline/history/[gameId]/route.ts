import { NextResponse } from 'next/server'
import { requireNflAccess } from '@/lib/nflAccess'
import { getHistoricalGamePlays } from '@/app/the-sideline/analysis'

export async function GET(_request: Request, context: { params: Promise<{ gameId: string }> }) {
  const gate = await requireNflAccess()
  if (gate.error) return gate.error

  const { gameId } = await context.params
  if (!/^[A-Za-z0-9_-]{4,80}$/.test(gameId)) {
    return NextResponse.json({ error: 'Invalid game id' }, { status: 400 })
  }

  try {
    const plays = await getHistoricalGamePlays(gameId)
    return NextResponse.json({ plays }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch {
    return NextResponse.json({ error: 'Historical plays unavailable' }, { status: 500 })
  }
}
