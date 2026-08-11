import { NextResponse } from 'next/server'
import { withPipelineHealth } from '@/lib/pipelineHealth'
import { safeApiError } from '@/lib/safeApiError'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCronAuth } from '@/lib/cron-auth'
import { syncNflSchedule } from '@/lib/nflverseSync'

export const revalidate = 0
export const maxDuration = 60

// NFL seasons span two calendar years (Sept–Feb) — a game in Jan/Feb still
// belongs to the season that started the previous fall.
function currentNflSeason(): number {
  const now = new Date()
  const year = now.getUTCFullYear()
  return now.getUTCMonth() < 2 ? year - 1 : year
}

// Only re-syncs the current season day-to-day — every past season's games
// are already final and don't change, so there's no reason to re-upsert
// 25+ years of history on every run (that's what the one-time historical
// backfill is for). During the season this picks up final scores as games
// complete, since nflverse republishes the whole file nightly.
async function run(req: Request) {
  const authError = requireCronAuth(req)
  if (authError) return authError

  const admin = createAdminClient()
  try {
    const count = await syncNflSchedule(admin, currentNflSeason())
    return NextResponse.json({ synced: count, season: currentNflSeason() })
  } catch (e: any) {
    console.error('[nfl-sync-schedule] failed', { type: e instanceof Error ? e.name : typeof e })
    return safeApiError('nfl-sync-schedule', e)
  }
}

export const GET = withPipelineHealth('nfl-sync-schedule', run)
