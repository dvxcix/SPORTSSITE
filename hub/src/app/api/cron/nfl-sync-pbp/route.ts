import { NextResponse } from 'next/server'
import { withPipelineHealth } from '@/lib/pipelineHealth'
import { safeApiError } from '@/lib/safeApiError'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCronAuth } from '@/lib/cron-auth'
import { syncNflPbp } from '@/lib/nflverseSync'

export const revalidate = 0
export const maxDuration = 120

// NFL seasons span two calendar years (Sept–Feb) — a game in Jan/Feb still
// belongs to the season that started the previous fall.
function currentNflSeason(): number {
  const now = new Date()
  const year = now.getUTCFullYear()
  return now.getUTCMonth() < 2 ? year - 1 : year
}

// Only re-syncs the current season — every past season is already final and
// won't change (that's what the one-time historical backfill covers). In
// live play nflverse republishes the whole season file with corrections
// (e.g. official stat corrections a day or two after a game), so re-running
// this nightly picks those up the same way nfl-sync-schedule does.
async function run(req: Request) {
  const authError = requireCronAuth(req)
  if (authError) return authError

  const admin = createAdminClient()
  const season = currentNflSeason()
  try {
    const count = await syncNflPbp(admin, season)
    return NextResponse.json({ synced: count, season })
  } catch (e: any) {
    console.error('[nfl-sync-pbp] failed', { type: e instanceof Error ? e.name : typeof e })
    return safeApiError('nfl-sync-pbp', e)
  }
}

export const GET = withPipelineHealth('nfl-sync-pbp', run)
