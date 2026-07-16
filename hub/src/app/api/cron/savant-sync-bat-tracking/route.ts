import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCronAuth } from '@/lib/cron-auth'
import { currentSeason } from '@/lib/playerSync'
import { BAT_TRACKING, syncSplitLeaderboard } from '@/lib/savantSplitsSync'

export const revalidate = 0
export const maxDuration = 60

const RECENCY_DAYS = 6
// MLB's own season-schedule endpoint confirmed 2026's regularSeasonStartDate.
// Falls back to a March 25 guess for a season this map doesn't have yet
// rather than hard-failing.
const REGULAR_SEASON_START: Record<number, string> = { 2026: '2026-03-25' }

function todayET(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}
function daysAgoET(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}

// The first "recency vs season" category — the actual competitive-edge
// data, not just season aggregates. Pulls both windows for both batter and
// pitcher roles (4 requests total); Savant's own `groupBy` already returns
// every split combination (bat side x pitch hand x pitch type x contact
// type) in one response per call. Each day's pull overwrites the previous
// day's row for the same (player, role, window), so this stays a rolling
// current snapshot rather than an ever-growing daily history.
export async function GET(req: Request) {
  const authError = requireCronAuth(req)
  if (authError) return authError

  const admin = createAdminClient()
  const season = currentSeason()
  const seasonStart = REGULAR_SEASON_START[season] ?? `${season}-03-25`
  const today = todayET()
  const recencyStart = daysAgoET(RECENCY_DAYS)

  const results: Record<string, { rows: number } | { error: string }> = {}

  for (const role of ['batter', 'pitcher'] as const) {
    for (const [windowType, dateStart, dateEnd] of [
      ['season', seasonStart, today],
      ['recency', recencyStart, today],
    ] as const) {
      const key = `${role}_${windowType}`
      try {
        results[key] = await syncSplitLeaderboard(admin, BAT_TRACKING, role, windowType, dateStart, dateEnd)
      } catch (e: any) {
        console.error('[savant-sync-bat-tracking] failed', key, e)
        results[key] = { error: e?.message || String(e) }
      }
    }
  }

  return NextResponse.json({ season, seasonStart, today, recencyStart, results })
}
