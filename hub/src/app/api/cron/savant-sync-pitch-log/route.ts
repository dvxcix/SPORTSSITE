import { NextResponse } from 'next/server'
import { addDays, format, parseISO } from 'date-fns'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCronAuth } from '@/lib/cron-auth'
import { currentSeason } from '@/lib/playerSync'
import { seasonStartDate, daysAgoET } from '@/lib/savantSplitsSync'
import { syncStatcastDay, PITCH_LOG_TABLE } from '@/lib/statcastPitchLogSync'

export const revalidate = 0
export const maxDuration = 60

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

  const start = latest?.[0]?.game_date ? format(addDays(parseISO(latest[0].game_date), 1), 'yyyy-MM-dd') : seasonStartDate(season)

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

  return NextResponse.json({ season, table: PITCH_LOG_TABLE, start, end, processed: dates, results })
}
