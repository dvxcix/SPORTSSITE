import { NextResponse } from 'next/server'
import { getTodaysMatchups, findPlayerToday } from '@/lib/mlbSchedule'
import { requireTier } from '@/lib/requireTier'

export const revalidate = 0

// Today's real opponent for a player — the opposing probable starter for a
// batter, or the opposing lineup for a pitcher — so Matchup Explorer /
// Zone Profile can default to whoever this player is actually facing
// today instead of "All". Separate, lean endpoint (not folded into
// /api/players/[id]/pitch-log): live MLB schedule fetch, nothing to do
// with Supabase or the pitch log at all.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireTier('basic')
  if (gate.error) return gate.error

  const { id } = await params
  const mlbId = Number(id)
  if (!Number.isFinite(mlbId)) {
    return NextResponse.json({ error: 'Invalid player id' }, { status: 400 })
  }

  const games = await getTodaysMatchups()
  const context = findPlayerToday(games, mlbId)

  return NextResponse.json({ playingToday: !!context, context })
}
