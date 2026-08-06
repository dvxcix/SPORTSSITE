import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { addDays, format, parseISO } from 'date-fns'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCronAuth } from '@/lib/cron-auth'
import { currentSeason } from '@/lib/playerSync'
import { seasonStartDate, daysAgoET } from '@/lib/savantSplitsSync'
import { syncStatcastDay, PITCH_LOG_TABLE } from '@/lib/statcastPitchLogSync'
import { checkPitchLogFreshnessAndAlert } from '@/lib/pitchLogAlert'

export const revalidate = 0
// Was 60s — too tight for MAX_DAYS_PER_RUN=4 dates processed sequentially,
// each doing a schedule fetch + Savant CSV fetch + several chunked upserts.
// Confirmed root cause of the 4-day recurring stall (08/03-08/06): Vercel's
// platform-level timeout kills the whole invocation mid-loop, which is a
// hard abort the per-date try/catch below can't see or log — and since
// checkPitchLogFreshnessAndAlert only runs AFTER the loop finishes, the one
// mechanism meant to catch "this didn't work" never got to run either.
// Raised to match dugout-pitchlog-stat-precompute's own budget for a
// lighter version of the same job, and paired with parallelizing the
// per-date chunk upserts (see statcastPitchLogSync.ts) so the extra budget
// is real headroom, not just a bigger window for the same slow path.
export const maxDuration = 300

// Runs daily alongside the other savant-sync-* crons (see vercel.json).
// Backfills full per-pitch Statcast data (every pitch, every game context —
// count, inning, runners, day/night, venue via the `games` table) one
// calendar date at a time, resuming from the day after the latest date
// already in `games` for this season. Capped at a few days per invocation
// so a missed run or two catches back up over subsequent days rather than
// risking the 60s cap on one huge invocation — the initial full-season
// backfill runs separately via scripts/backfill-statcast-pitch-log.mjs.
const MAX_DAYS_PER_RUN = 4

export async function GET(req: Request) {
  const authError = requireCronAuth(req)
  if (authError) return authError

  const admin = createAdminClient()
  const season = currentSeason()
  const end = daysAgoET(1)

  // Confirmed live (2026-07-22): `games` already carries rows for
  // postponed-game makeups MLB schedules far in advance (single-game dates
  // like 2026-09-22, weeks past anything actually played), because
  // syncGamesForDate writes whatever officialDate the schedule API reports
  // for a queried day. An unbounded `order by game_date desc limit 1` picks
  // one of those future rows as "latest", pushing `start` past `end` — the
  // date loop below then produces zero dates and the cron silently no-ops
  // every single day. Bounding this lookup to real, already-happened dates
  // (<= end) keeps it anchored to what's actually been processed.
  const { data: latest, error: latestError } = await admin
    .from('games')
    .select('game_date')
    .eq('season', season)
    .lte('game_date', end)
    .order('game_date', { ascending: false })
    .limit(1)
  if (latestError) return NextResponse.json({ error: latestError.message }, { status: 500 })

  let start = latest?.[0]?.game_date ? format(addDays(parseISO(latest[0].game_date), 1), 'yyyy-MM-dd') : seasonStartDate(season)

  // Confirmed live (2026-07-24, and again 2026-07-26 through 07-28 as a
  // 3-day stall): `games` gets written unconditionally, one upsert per
  // date, BEFORE the (much heavier, separately-fetched) pitch CSV is even
  // requested — so a date where Savant's own search index simply isn't
  // ready yet (its normal lag), or returns an empty CSV outright (Savant
  // returning HTTP 200 with a header-only CSV, not an error — confirmed
  // live via Vercel logs for 07-26/07-27/07-28), still gets a `games` row
  // and permanently advances this cursor past it, since the cursor only
  // ever checked `games`. That date's pitch log then silently never gets
  // retried by any future run. Checking only the ONE day immediately
  // before `start` (the original fix) self-heals a single missed day, but
  // not a multi-day stall — each day's own 1-day recheck caught the day
  // before it, but by the time a THIRD day passed, the cursor had already
  // moved on and the earliest failed date was never revisited. Scan a real
  // window and roll `start` back to the EARLIEST incomplete date found in
  // it, so the loop below naturally walks forward through the whole gap
  // instead of only ever re-touching the single newest broken date.
  const RECHECK_WINDOW_DAYS = 7
  const seasonStart = seasonStartDate(season)
  const checkDates = Array.from({ length: RECHECK_WINDOW_DAYS }, (_, i) => format(addDays(parseISO(start), -(i + 1)), 'yyyy-MM-dd'))
    .filter(d => d >= seasonStart)
  const checks = await Promise.all(checkDates.map(async checkDate => {
    const [{ count: gameCount }, { data: loggedGamePks }] = await Promise.all([
      admin.from('games').select('game_pk', { count: 'exact', head: true }).eq('season', season).eq('game_date', checkDate),
      admin.from(PITCH_LOG_TABLE).select('game_pk').eq('season', season).eq('game_date', checkDate),
    ])
    const loggedCount = new Set((loggedGamePks ?? []).map(r => r.game_pk)).size
    return { checkDate, incomplete: (gameCount ?? 0) > 0 && loggedCount < (gameCount ?? 0) }
  }))
  const incompleteDates = checks.filter(c => c.incomplete).map(c => c.checkDate).sort()
  if (incompleteDates.length) start = incompleteDates[0]

  const dates: string[] = []
  for (let d = start; d <= end && dates.length < MAX_DAYS_PER_RUN; d = format(addDays(parseISO(d), 1), 'yyyy-MM-dd')) {
    dates.push(d)
  }

  const results: Record<string, unknown> = {}
  for (const date of dates) {
    try {
      results[date] = await syncStatcastDay(admin, date, season)
    } catch (e: any) {
      console.error('[savant-sync-pitch-log] date failed', date, e)
      results[date] = { error: e?.message || String(e) }
    }
  }

  // Invalidates every cached /api/players/[id]/pitch-log entry the instant
  // this run actually writes new rows — see that route's own comment for
  // why a rolling time-based revalidate alone can't correctly track "did
  // today's cron already run," regardless of when each player was cached.
  // Safe to call even when dates=[] (nothing to sync yet) or every date
  // errored — an unnecessary revalidation just costs one extra recompute
  // on next read, not a correctness issue.
  if (dates.length) revalidateTag('player-pitch-log', 'max')

  // Checked AFTER this run's own attempt at self-healing (the recheck
  // window above already tried to catch up on anything incomplete) — so an
  // alert here means the automatic retry genuinely didn't fix it, not just
  // "today's run hasn't happened yet." See pitchLogAlert.ts for the
  // debounce (fires once per ongoing gap, not once per cron run).
  const { data: freshness } = await admin
    .from(PITCH_LOG_TABLE)
    .select('game_date')
    .eq('season', season)
    .order('game_date', { ascending: false })
    .limit(1)
  await checkPitchLogFreshnessAndAlert(admin, freshness?.[0]?.game_date ?? null, end)

  return NextResponse.json({ season, table: PITCH_LOG_TABLE, start, end, processed: dates, results })
}
