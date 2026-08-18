import { NextResponse } from 'next/server'
import { withPipelineHealth } from '@/lib/pipelineHealth'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCronAuth } from '@/lib/cron-auth'
import { currentSeason } from '@/lib/playerSync'
import { syncHrDetailBatch } from '@/lib/savantHrDetailsSync'

export const revalidate = 0
// Was 60 — raised alongside BATCH_SIZE (see savantHrDetailsSync.ts) so a
// bigger claimed batch has real room to fetch+write in one tick instead of
// reintroducing a timeout-starvation failure mode of its own.
export const maxDuration = 180

// Runs once daily, ~6am ET (see vercel.json — a fixed UTC hour, so it'll
// drift an hour off 6am ET across the DST changeover until adjusted) —
// same reasoning as every other Savant-sourced cron: this data isn't live,
// it only settles once a day, so polling more often than that never buys
// real freshness. Claims batters per tick (BATCH_SIZE, see
// savantHrDetailsSync.ts), fetched concurrently — confirmed live that
// Savant's details endpoint has no meaningful rate limit, the entire
// ~500-batter leaderboard fetched concurrently in ~9s with zero errors —
// so one daily run comfortably covers the whole day's new home runs, AS
// LONG AS BATCH_SIZE actually covers the full daily-eligible pool (see
// that constant's own comment for the real incident where it didn't: 185
// batters silently frozen for 10+ days because the claim query had no
// ordering and the same under-sized batch won every day). Re-checks
// 'complete' rows after 20h so batters keep accumulating new home runs
// instead of going stale.
async function run(req: Request) {
  const authError = requireCronAuth(req)
  if (authError) return authError

  const admin = createAdminClient()
  const result = await syncHrDetailBatch(admin, currentSeason())
  const failures = Object.entries(result.results)
    .filter(([, item]) => 'error' in item)
    .map(([playerId, item]) => ({ playerId, error: 'error' in item ? item.error : 'sync failed' }))
  return NextResponse.json(
    { ok: failures.length === 0, ...result, failures },
    { status: failures.length ? 503 : 200 }
  )
}

export const GET = withPipelineHealth('savant-sync-hr-details', run)
