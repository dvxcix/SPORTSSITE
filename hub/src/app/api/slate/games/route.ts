import { NextResponse } from 'next/server'
import { getTodaysMatchups } from '@/lib/mlbSchedule'
import { requireTier } from '@/lib/requireTier'

export const revalidate = 0

// Full slate for a date (defaults to today ET, same as getTodaysMatchups) —
// Slate Breakdown's game list. Same live-schedule data source as
// /api/players/[id]/today, just returning every game instead of resolving
// one player's spot in it.
export async function GET(req: Request) {
  const gate = await requireTier('advanced')
  if (gate.error) return gate.error

  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date') || undefined
  const games = await getTodaysMatchups(date)
  return NextResponse.json({ games })
}
