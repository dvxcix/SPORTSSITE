import { NextResponse } from 'next/server'
import { getTodaysMatchups } from '@slipsurge/core/mlbSchedule'
import { hasTierAccess } from '@slipsurge/core/tiers'
import { getEffectiveTier } from '@/lib/requireTier'
import { getFeaturedGameKey } from '@/lib/featuredGame'

export const revalidate = 0

// Full slate for a date (defaults to today ET, same as getTodaysMatchups) —
// Slate Breakdown's game list. Same live-schedule data source as
// /api/players/[id]/today, just returning every game instead of resolving
// one player's spot in it.
//
// Below Advanced, only today's featured game (see lib/featuredGame.ts) comes
// back unlocked — every other game is still listed (so the full slate is
// visible, not hidden) but flagged `locked: true` for the client to gate on.
// Real Advanced+ members are unaffected: every game reports `locked: false`.
export async function GET(req: Request) {
  const gate = await getEffectiveTier()
  if (gate.error) return gate.error
  const tier = gate.tier!
  const isAdvancedPlus = hasTierAccess(tier, 'advanced')

  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date') || undefined
  const games = await getTodaysMatchups(date)

  if (isAdvancedPlus) {
    return NextResponse.json({ games: games.map(g => ({ ...g, locked: false })) })
  }
  const featuredGameKey = await getFeaturedGameKey(date)
  return NextResponse.json({
    games: games.map(g => ({ ...g, locked: g.gameKey !== featuredGameKey })),
  })
}
