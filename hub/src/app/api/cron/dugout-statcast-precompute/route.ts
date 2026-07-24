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

export async function GET(req: Request) {
  const authError = requireCronAuth(req)
  if (authError) return authError

  const { searchParams } = new URL(req.url)
  const explicitDate = searchParams.get('date')
  const todayEt = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

  // An explicit ?date= (manual/admin trigger) still means exactly that one
  // date — the trailing-window reprocessing is only for the cron's own
  // unparameterized daily run.
  const dates = explicitDate ? [explicitDate] : Array.from({ length: PAST_DAYS + 1 }, (_, i) => {
    const d = new Date(`${todayEt}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() - i)
    return d.toISOString().slice(0, 10)
  })

  const results: Record<string, unknown> = {}
  for (const date of dates) {
    try {
      results[date] = await precomputeDugoutStatcastForDate(date)
    } catch (e: any) {
      console.error('[dugout-statcast-precompute] date failed', date, e)
      results[date] = { error: e?.message || String(e) }
    }
  }
  return NextResponse.json({ dates, results })
}
