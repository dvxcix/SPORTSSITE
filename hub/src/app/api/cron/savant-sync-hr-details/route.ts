import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCronAuth } from '@/lib/cron-auth'
import { currentSeason } from '@/lib/playerSync'
import { syncHrDetailBatch } from '@/lib/savantHrDetailsSync'

export const revalidate = 0
export const maxDuration = 60

// Ticks every 15 min, claiming ~25 batters per tick (see
// savantHrDetailsSync.ts) — a full sweep is one request per qualifying
// batter (likely several hundred), which doesn't fit a single 60s
// invocation the way every other Savant category so far has. Seeds its own
// pending queue from the already-synced Tier A `home_runs` leaderboard, so
// it naturally catches up over a few hours, then just tops up new HRs
// daily once caught up (a batter finishes a HR-less day untouched — no
// re-fetch needed until their hr_total actually changes and re-seeds).
export async function GET(req: Request) {
  const authError = requireCronAuth(req)
  if (authError) return authError

  const admin = createAdminClient()
  const result = await syncHrDetailBatch(admin, currentSeason())
  return NextResponse.json(result)
}
