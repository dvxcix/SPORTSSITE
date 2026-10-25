import { NextRequest, NextResponse } from 'next/server'
import { requirePaintAccess } from '@/lib/paintAccess'
import { getPaintBoard, getPaintGame } from '@/lib/nbaPaintData'
import { getNbaResearchProfiles } from '@/lib/nbaResearchResources'
import { nbaOddsMode } from '@/lib/nbaOddsMode'
export const maxDuration = 120
export async function GET(request: NextRequest) {
  const gate = await requirePaintAccess(); if (gate.error) return gate.error
  const id = request.nextUrl.searchParams.get('player'), game = request.nextUrl.searchParams.get('game')
  const mode = nbaOddsMode(request.nextUrl.searchParams.get('mode'))
  if (!/^\d{1,10}$/.test(id ?? '') || !/^\d{1,10}$/.test(game ?? '')) return NextResponse.json({ error: 'Choose a player and matchup' }, { status: 400 })
  try {
    const board = await getPaintBoard(await getPaintGame(Number(game)), mode)
    if (!board.players.some(player => player.id === Number(id))) return NextResponse.json({ error: 'Player not in this matchup' }, { status: 404 })
    const profiles = await getNbaResearchProfiles(board, mode), player = profiles.players.find(row => row.playerId === Number(id))
    if (!player) return NextResponse.json({ error: 'No profile captured for this player' }, { status: 404 })
    return NextResponse.json({ ...player.profile, gameId: board.game.id, playerId: Number(id), fetchedAt: profiles.fetchedAt, researchSnapshot: profiles.researchSnapshot }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch { return NextResponse.json({ error: 'No saved profile available for this matchup' }, { status: 503 }) }
}
