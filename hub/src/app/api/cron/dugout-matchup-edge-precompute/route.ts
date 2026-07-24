import { NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'
import { precomputeMatchupEdgeForDate } from '@/lib/dugoutMatchupEdgePrecompute'

export const revalidate = 0
export const maxDuration = 300

// Runs daily after the savant-sync-pitch-log cron (see vercel.json) writes
// today's player_pitch_log rows. Precomputes Paper's matchup_edge/
// platoon_ops inputs for every batter AND probable starting pitcher who
// could appear today — see dugoutMatchupEdgePrecompute.ts for why this
// moved in-house instead of depending on mlb-party's own recency ingest.
export async function GET(req: Request) {
  const authError = requireCronAuth(req)
  if (authError) return authError

  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date') || new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

  try {
    const result = await precomputeMatchupEdgeForDate(date)
    return NextResponse.json(result)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 })
  }
}
