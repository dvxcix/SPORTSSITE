import { NextResponse } from 'next/server'
import { getTodaysGames } from '@slipsurge/core/mlb-api'
import { requireTier } from '@/lib/requireTier'

export async function GET() {
  const gate = await requireTier('basic')
  if (gate.error) return gate.error

  const games = await getTodaysGames()
  return NextResponse.json(games)
}
