import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCronAuth } from '@/lib/cron-auth'
import { currentSeason } from '@/lib/playerSync'
import { syncHrDetailBatch } from '@/lib/savantHrDetailsSync'

export const revalidate = 0
export const maxDuration = 60

// Ticks every 5 min, claiming ~300 batters per tick, fetched concurrently
// (see savantHrDetailsSync.ts) — confirmed live that Savant's details
// endpoint has no meaningful rate limit (the entire ~500-batter leaderboard
// fetched concurrently in ~9s with zero errors), so the real constraint is
// just Vercel's 60s invocation cap, not the source. Clears the current
// backlog in 1-2 ticks instead of hours. Seeds its own pending queue from
// the already-synced Tier A `home_runs` leaderboard, and re-checks
// 'complete' rows after 20h so batters keep accumulating new home runs
// instead of going stale after their first sync.
export async function GET(req: Request) {
  const authError = requireCronAuth(req)
  if (authError) return authError

  const admin = createAdminClient()
  const result = await syncHrDetailBatch(admin, currentSeason())
  return NextResponse.json(result)
}
