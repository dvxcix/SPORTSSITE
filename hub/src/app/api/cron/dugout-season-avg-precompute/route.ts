import { NextResponse } from 'next/server'
import { withPipelineHealth } from '@/lib/pipelineHealth'
import { requireCronAuth } from '@/lib/cron-auth'
import { precomputeDugoutSeasonAvgForDate } from '@/lib/dugoutSeasonAvgPrecompute'

export const revalidate = 0
export const maxDuration = 300

// Runs daily, staggered after the other Dugout precompute crons (see
// vercel.json). Snapshots FHR%/HR%'s two season-average inputs
// (mlb-party's player_price_season_avg, "latest through_date at or before
// today") for today's date — see dugoutSeasonAvgPrecompute.ts for the full
// incident this fixes (FHR%/HR% showing blank on older past dates because
// this codebase had no local historical record of these averages at all).
//
// Same trailing-window self-heal as the other precompute crons — mlb-
// party's own nightly rollup doesn't always land before this runs, so a
// date that came back empty/incomplete gets picked back up automatically
// on a later run instead of staying silently wrong.
const PAST_DAYS = 2

async function run(req: Request) {
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
      results[date] = await precomputeDugoutSeasonAvgForDate(date)
    } catch (e: any) {
      console.error('[dugout-season-avg-precompute] date failed', date, e)
      results[date] = { error: e?.message || String(e) }
    }
  }
  return NextResponse.json({ dates, results })
}

export const GET = withPipelineHealth('dugout-season-avg-precompute', run)
