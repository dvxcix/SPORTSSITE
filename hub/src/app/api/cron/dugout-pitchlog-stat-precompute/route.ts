import { NextResponse } from 'next/server'
import { withPipelineHealth } from '@/lib/pipelineHealth'
import { requireCronAuth } from '@/lib/cron-auth'
import { precomputeDugoutPitchlogStatForDate } from '@/lib/dugoutPitchlogStatPrecompute'

export const revalidate = 0
export const maxDuration = 300

// Runs daily after savant-sync-pitch-log (see vercel.json) finishes writing
// today's player_pitch_log rows. Precomputes Custom Matrix's pitchlog_stat
// category for every batter who could appear today — see
// dugoutPitchlogStatPrecompute.ts for why this moved out of the request
// path entirely (a real production incident: 28-56s request spikes for
// the specific real members whose Matrix uses this category).
//
// Same trailing-window self-heal as dugout-statcast-precompute — Savant's
// per-pitch CSV export doesn't always land same-day, so a date that was
// incomplete when this first ran gets picked back up automatically on a
// later run instead of staying silently wrong.
const PAST_DAYS = 2

async function run(req: Request) {
  const authError = requireCronAuth(req)
  if (authError) return authError

  const { searchParams } = new URL(req.url)
  const explicitDate = searchParams.get('date')
  const todayEt = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

  // Real gap, reported live (2026-07-27): this briefly also precomputed
  // tomorrow's slate (day-ahead prefetching), matching
  // dugout-statcast-precompute/dugout-matchup-edge-precompute — but unlike
  // Statcast (a live third-party feed), this table's whole source
  // (player_pitch_log) for "yesterday" doesn't finish ingesting until the
  // NEXT morning's savant-sync-pitch-log cron run. Running this cron
  // "day-ahead" therefore means computing a real player's L1/L3/L5/L10
  // windows off a pitch log that's still missing games from the day that
  // just happened — a genuinely wrong snapshot, not just an early one — and
  // since that date is never revisited once it stops being "today" or
  // "tomorrow" in this window, the wrong numbers stick. Confirmed live: a
  // saved Matrix Factor ("Last 5 Δ vs Season bat speed is positive") lit up
  // a real player (Ty France, SD@MIA 2026-07-26) whose actual L5 delta was
  // negative — his day-ahead-precomputed row and the board's own (same-day,
  // not day-ahead) Statcast table had diverged because they were computed
  // at different points against different amounts of ingested pitch data.
  // Reverted to the same trailing-window-only shape as
  // dugout-statcast-precompute (which already reverted this after its own
  // 2026-07-25 timeout incident) — every Dugout precompute cron now stays
  // in the same today+PAST_DAYS window, so they can't drift apart this way.
  const dates = explicitDate ? [explicitDate] : Array.from({ length: PAST_DAYS + 1 }, (_, i) => {
    const d = new Date(`${todayEt}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() - i)
    return d.toISOString().slice(0, 10)
  })

  const results: Record<string, unknown> = {}
  for (const date of dates) {
    try {
      results[date] = await precomputeDugoutPitchlogStatForDate(date)
    } catch (e: any) {
      console.error('[dugout-pitchlog-stat-precompute] date failed', date, e)
      results[date] = { error: e?.message || String(e) }
    }
  }
  return NextResponse.json({ dates, results })
}

export const GET = withPipelineHealth('dugout-pitchlog-stat-precompute', run)
