import { NextResponse } from 'next/server'
import { withPipelineHealth } from '@/lib/pipelineHealth'
import { safeApiError } from '@/lib/safeApiError'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCronAuth } from '@/lib/cron-auth'
import { syncNflPlayerStats } from '@/lib/nflverseSync'

export const revalidate = 0
export const maxDuration = 120

async function run(req: Request) {
  const authError = requireCronAuth(req)
  if (authError) return authError

  const admin = createAdminClient()
  try {
    const count = await syncNflPlayerStats(admin)
    return NextResponse.json({ synced: count })
  } catch (e: any) {
    console.error('[nfl-sync-player-stats] failed', { type: e instanceof Error ? e.name : typeof e })
    return safeApiError('nfl-sync-player-stats', e)
  }
}

export const GET = withPipelineHealth('nfl-sync-player-stats', run)
