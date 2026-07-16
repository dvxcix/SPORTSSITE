import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCronAuth } from '@/lib/cron-auth'
import { currentSeason } from '@/lib/playerSync'
import { syncHrDetailBatch } from '@/lib/savantHrDetailsSync'

export const revalidate = 0
export const maxDuration = 60

// Runs once daily, ~6am ET (see vercel.json — a fixed UTC hour, so it'll
// drift an hour off 6am ET across the DST changeover until adjusted) —
// same reasoning as every other Savant-sourced cron: this data isn't live,
// it only settles once a day, so polling more often than that never buys
// real freshness. Claims ~300 batters per tick, fetched concurrently (see
// savantHrDetailsSync.ts — confirmed live that Savant's details endpoint
// has no meaningful rate limit, the entire ~500-batter leaderboard fetched
// concurrently in ~9s with zero errors), so one daily run comfortably
// covers the whole day's new home runs. The very first run(s) against the
// backlog of every batter with a home run this season already accumulated
// still need 1-2 manual triggers to fully catch up — after that, one
// scheduled run/day keeps it current. Re-checks 'complete' rows after 20h
// so batters keep accumulating new home runs instead of going stale.
export async function GET(req: Request) {
  const authError = requireCronAuth(req)
  if (authError) return authError

  const admin = createAdminClient()
  const result = await syncHrDetailBatch(admin, currentSeason())
  return NextResponse.json(result)
}
