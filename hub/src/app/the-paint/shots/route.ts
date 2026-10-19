import { NextRequest, NextResponse } from 'next/server'
import { requirePaintAccess } from '@/lib/paintAccess'
import { getPaintFinalStats, getPaintGame } from '@/lib/nbaPaintData'
import { getNbaPlays } from '@/lib/nbaShotsData'
import { nbaShots } from '@/lib/nbaShots'
export const maxDuration = 60
export async function GET(request: NextRequest) {
  const gate = await requirePaintAccess(); if (gate.error) return gate.error
  const game = request.nextUrl.searchParams.get('game'), player = request.nextUrl.searchParams.get('player')
  if (!game || !player || !/^\d{1,10}$/.test(game) || !/^\d{1,10}$/.test(player)) return NextResponse.json({ error: 'Invalid shot research' }, { status: 400 })
  try {
    const match = await getPaintGame(Number(game))
    if (match.season < 2025 || (match.status_state !== 'final' && match.status !== 'Final')) return NextResponse.json({ error: 'Shot research requires a completed game from 2025 onward' }, { status: 400 })
    const stats = await getPaintFinalStats(match.id), row = stats.rows.find(stat => stat.game.id === match.id && stat.player.id === Number(player))
    if (!stats.complete || !row?.player.first_name || !row.player.last_name) return NextResponse.json({ error: 'Player appearance could not be verified' }, { status: 404 })
    const source = await getNbaPlays(match.id, match.season)
    const shots = nbaShots(source.value, match.id, { id: row.player.id, first_name: row.player.first_name, last_name: row.player.last_name })
    return NextResponse.json({ gameId: match.id, playerId: row.player.id, shots, fetchedAt: source.fetchedAt, stale: source.stale, boxScoreAttempts: row.fga, coverageMatches: row.fga != null && shots.length === row.fga }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch { return NextResponse.json({ error: 'Shot locations could not load. Try again shortly.' }, { status: 503 }) }
}
