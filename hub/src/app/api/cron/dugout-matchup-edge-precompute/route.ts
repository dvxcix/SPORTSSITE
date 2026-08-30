import { NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'
import { precomputeMatchupEdgeForDate } from '@/lib/dugoutMatchupEdgePrecompute'
import { withPipelineHealth } from '@/lib/pipelineHealth'

export const revalidate = 0
export const maxDuration = 300
export const GET = withPipelineHealth('dugout-matchup-edge-precompute', run)

// Runs daily after the savant-sync-pitch-log cron (see vercel.json) writes
// today's player_pitch_log rows. Precomputes Paper's matchup_edge/
// platoon_ops inputs for every batter AND probable starting pitcher who
// could appear today — see dugoutMatchupEdgePrecompute.ts for why this
// moved in-house instead of depending on mlb-party's own recency ingest.
//
// Also checks the trailing PAST_DAYS days every run - same reasoning
// as dugout-statcast-precompute's own PAST_DAYS: savant-sync-pitch-log's
// own recheck logic exists because a date's per-pitch CSV sometimes lands a
// day or two late; that cron self-heals a late date on its NEXT run, so
// this precompute checks that same trailing window for absent rows. Existing
// historical rows remain immutable so a past board's Batter Charge cannot
// drift; only today's rows are refreshed in place.
const PAST_DAYS = 2

async function run(req: Request) {
  const authError = requireCronAuth(req)
  if (authError) return authError

  const { searchParams } = new URL(req.url)
  const explicitDate = searchParams.get('date')
  const todayEt = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

  // Real gap, reported live (2026-07-27): this briefly also precomputed
  // tomorrow's slate (day-ahead prefetching) — but this table's own source
  // (player_pitch_log) for "yesterday" doesn't finish ingesting until the
  // NEXT morning's savant-sync-pitch-log cron run, so running "day-ahead"
  // means computing matchup_edge/platoon_ops off a pitch log still missing
  // games from the day that just happened — a genuinely wrong snapshot that
  // then never gets revisited once the date ages out of this window. See
  // dugout-pitchlog-stat-precompute's own route.ts for the confirmed live
  // incident this caused (a Matrix Factor lighting up a real player, Ty
  // France, off stale day-ahead data that disagreed with the board's own
  // same-day numbers). Reverted to the same trailing-window-only shape as
  // dugout-statcast-precompute (already reverted after its own 2026-07-25
  // timeout incident) so every Dugout precompute cron stays in lockstep.
  const dates = explicitDate ? [explicitDate] : Array.from({ length: PAST_DAYS + 1 }, (_, i) => {
    const d = new Date(`${todayEt}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() - i)
    return d.toISOString().slice(0, 10)
  })

  const results: Record<string, unknown> = {}
  for (const date of dates) {
    try {
      results[date] = await precomputeMatchupEdgeForDate(date)
    } catch (e) {
      console.error('[dugout-matchup-edge-precompute] date failed', { date, type: e instanceof Error ? e.name : typeof e })
      results[date] = { error: 'precompute failed' }
    }
  }
  return NextResponse.json({ dates, results })
}
