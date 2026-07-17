import { NextResponse } from 'next/server'
import { fetchTeamPitcherIds } from '@/lib/mlbSchedule'

export const revalidate = 0

// Every pitcher on a team's active roster (starters + bullpen) — feeds
// Slate Breakdown's "vs team" batter scope.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const teamId = Number(searchParams.get('teamId'))
  if (!Number.isFinite(teamId)) {
    return NextResponse.json({ error: 'Invalid teamId' }, { status: 400 })
  }
  const pitchers = await fetchTeamPitcherIds(teamId)
  return NextResponse.json({ pitchers })
}
