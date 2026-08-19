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

// Runs after the hourly morning pitch-log attempt. Savant sometimes publishes
// the prior day's detail payload after the first refresh, so the two-hour
// per-batter recheck window retries late rows while canonical fallbacks keep
// event coverage complete between attempts.
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
