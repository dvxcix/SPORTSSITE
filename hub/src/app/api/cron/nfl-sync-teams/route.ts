import { NextResponse } from 'next/server'
import { withPipelineHealth } from '@/lib/pipelineHealth'
import { safeApiError } from '@/lib/safeApiError'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCronAuth } from '@/lib/cron-auth'
import { syncNflTeams } from '@/lib/nflverseSync'

export const revalidate = 0
export const maxDuration = 30

// 32 teams, static reference data (colors/logos/division) — cheap enough to
// just re-fetch and re-upsert the whole file daily rather than tracking
// staleness like MLB's per-player job queue does.
async function run(req: Request) {
  const authError = requireCronAuth(req)
  if (authError) return authError

  const admin = createAdminClient()
  try {
    const count = await syncNflTeams(admin)
    return NextResponse.json({ synced: count })
  } catch (e: any) {
    console.error('[nfl-sync-teams] failed', { type: e instanceof Error ? e.name : typeof e })
    return safeApiError('nfl-sync-teams', e)
  }
}

export const GET = withPipelineHealth('nfl-sync-teams', run)
