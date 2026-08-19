import { NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'
import { precomputeDugoutStatcastForDate } from '@/lib/dugoutStatcastPrecompute'
import { withPipelineHealth } from '@/lib/pipelineHealth'

export const revalidate = 0
export const maxDuration = 300
export const GET = withPipelineHealth('dugout-statcast-precompute', run)

// Runs daily after the savant-sync-* crons (see vercel.json) finish writing
// today's player_pitch_log/player_statcast_splits rows. Precomputes the
// Dugout grid's Statcast section for every batter who could appear today —
// see dugoutStatcastPrecompute.ts for why this moved out of the request
// path entirely (a real production incident: aggregating this live, per
// request, under concurrent user load was blowing past Postgres's
// statement_timeout even with the date-level lineup resolution cached).
//
// Also reprocesses the trailing PAST_DAYS days, every run — Savant's own
// per-pitch CSV export doesn't always land same-day (confirmed live:
// savant-sync-pitch-log's own recheck logic exists precisely because a
// date's data sometimes only shows up a day or two late, upstream of us
// entirely). That cron self-heals by retrying an incomplete PAST date on
// its NEXT run; if this precompute only ever computed "today," a date that
// was incomplete when its own precompute first ran would stay silently
// wrong forever, even after the underlying pitch log caught up. Re-running
// a small trailing window catches that automatically, same self-healing
// tolerance the sync cron already has — no manual backfill needed for the
// normal case, just a same-shape genuinely-new date range (e.g. a real
// season debut) still needs the admin backfill route once.
const PAST_DAYS = 2

async function run(req: Request) {
  const authError = requireCronAuth(req)
  if (authError) return authError

  const { searchParams } = new URL(req.url)
  const explicitDate = searchParams.get('date')
  const currentOnly = searchParams.get('currentOnly') === '1'
  const todayEt = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

  // An explicit ?date= (manual/admin trigger) still means exactly that one
  // date — the trailing-window reprocessing is only for the cron's own
  // unparameterized daily run.
  //
  // Real incident (2026-07-25): this briefly also precomputed tomorrow's
  // slate (day-ahead prefetching), matching dugout-pitchlog-stat-precompute
  // and dugout-matchup-edge-precompute. Confirmed live via Vercel's runtime
  // errors: `precomputeDugoutStatcastForDate` alone takes ~87s for a full
  // slate (measured directly, zero contention) — 3 dates already left only
  // ~39s of headroom under this route's 300s maxDuration, and adding a 4th
  // (tomorrow) pushed the sequential total to ~348s, over budget. Under
  // real contention (this cron fires right after a burst of savant-sync-*
  // crons), that manifested as TODAY's own date — first in the array —
  // hitting a genuine Postgres `57014 canceling statement due to statement
  // timeout`, silently leaving the live board's Statcast section blank for
  // the whole day. `dugout-pitchlog-stat-precompute`/`dugout-matchup-edge-
  // precompute` are structurally identical but empirically proven safe at 4
  // dates (their tables show complete data for today/tomorrow), so only
  // this route — the one with a documented prior incident — reverts to its
  // original 3-date trailing window. The admin backfill route
  // (/api/admin/dugout-statcast-backfill) remains the escape hatch for any
  // one-off miss.
  const dates = explicitDate ? [explicitDate] : currentOnly ? [todayEt] : Array.from({ length: PAST_DAYS + 1 }, (_, i) => {
    const d = new Date(`${todayEt}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() - i)
    return d.toISOString().slice(0, 10)
  })

  const results: Record<string, unknown> = {}
  let failed = false
  for (const date of dates) {
    try {
      results[date] = await precomputeDugoutStatcastForDate(date)
    } catch (e) {
      failed = true
      console.error('[dugout-statcast-precompute] date failed', { date, type: e instanceof Error ? e.name : typeof e })
      results[date] = { error: 'precompute failed' }
    }
  }
  return NextResponse.json({ ok: !failed, dates, results }, { status: failed ? 503 : 200 })
}
