import { NextResponse } from 'next/server'
import { requireNflAccess } from '@/lib/nflAccess'
import { getNflGameOverview } from '@/lib/nflGameOverviewData'
import { publicWorkspaceGames } from '@/lib/publicWorkspaceScope'
import { getSidelineGames } from '../data'

export async function GET(request: Request) {
  const gate = await requireNflAccess()
  if (gate.error) return gate.error
  const params = new URL(request.url).searchParams, id = params.get('game') ?? '', at = params.get('at')
  const headers = { 'Cache-Control': 'private, no-store' }
  if (!/^\d{4}_\d{2}_[A-Z]{2,3}_[A-Z]{2,3}$/.test(id) || at != null && !Number.isFinite(Date.parse(at))) return NextResponse.json({ error: 'Choose a matchup' }, { status: 400, headers })
  try {
    const schedule = await getSidelineGames(undefined, id)
    const game = publicWorkspaceGames(schedule.games, 'nfl').find(item => item.id === id)
    if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404, headers })
    return NextResponse.json({ overview: await getNflGameOverview(game, at) }, { headers })
  } catch {
    return NextResponse.json({ error: 'Public activity could not refresh' }, { status: 503, headers })
  }
}
