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
//
// Also reprocesses the trailing PAST_DAYS days, every run — same reasoning
// as dugout-statcast-precompute's own PAST_DAYS: savant-sync-pitch-log's
// own recheck logic exists because a date's per-pitch CSV sometimes lands a
// day or two late; that cron self-heals a late date on its NEXT run, so
// this precompute needs to reprocess that same trailing window to actually
// pick up the correction instead of leaving the first (incomplete) result
// cached forever.
const PAST_DAYS = 2

export async function GET(req: Request) {
  const authError = requireCronAuth(req)
  if (authError) return authError

  const { searchParams } = new URL(req.url)
  const explicitDate = searchParams.get('date')
  const todayEt = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

  const dates = explicitDate ? [explicitDate] : Array.from({ length: PAST_DAYS + 1 }, (_, i) => {
    const d = new Date(`${todayEt}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() - i)
    return d.toISOString().slice(0, 10)
  })

  const results: Record<string, unknown> = {}
  for (const date of dates) {
    try {
      results[date] = await precomputeMatchupEdgeForDate(date)
    } catch (e: any) {
      console.error('[dugout-matchup-edge-precompute] date failed', date, e)
      results[date] = { error: e?.message || String(e) }
    }
  }
  return NextResponse.json({ dates, results })
}
