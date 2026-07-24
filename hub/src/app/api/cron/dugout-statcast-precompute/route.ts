import { NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'
import { precomputeDugoutStatcastForDate } from '@/lib/dugoutStatcastPrecompute'

export const revalidate = 0
export const maxDuration = 300

// Runs daily after the savant-sync-* crons (see vercel.json) finish writing
// today's player_pitch_log/player_statcast_splits rows. Precomputes the
// Dugout grid's Statcast section for every batter who could appear today —
// see dugoutStatcastPrecompute.ts for why this moved out of the request
// path entirely (a real production incident: aggregating this live, per
// request, under concurrent user load was blowing past Postgres's
// statement_timeout even with the date-level lineup resolution cached).
export async function GET(req: Request) {
  const authError = requireCronAuth(req)
  if (authError) return authError

  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date') || new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

  try {
    const result = await precomputeDugoutStatcastForDate(date)
    return NextResponse.json(result)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 })
  }
}
