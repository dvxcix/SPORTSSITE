import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { withPipelineHealth } from '@/lib/pipelineHealth'
import { safeApiError } from '@/lib/safeApiError'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCronAuth } from '@/lib/cron-auth'
import { syncNflPlayerStats } from '@/lib/nflverseSync'
import { currentNflSeason, refreshNflProduction } from '@/lib/nflProduction'

export const revalidate = 0
export const maxDuration = 120

async function run(req: Request) {
  const authError = requireCronAuth(req)
  if (authError) return authError

  const admin = createAdminClient()
  try {
    // Rebuild current production FIRST; the modern weekly provider then enriches it.
    const coverage = await refreshNflProduction(admin, currentNflSeason())
    const count = await syncNflPlayerStats(admin)
    revalidateTag('sideline:nfl-data', { expire: 0 })
    if (coverage.missingGames.length) {
      return NextResponse.json({ reason: 'Completed games lack complete play data', coverage }, { status: 503 })
    }
    return NextResponse.json({ synced: count, coverage })
  } catch (e: any) {
    console.error('[nfl-sync-player-stats] failed', { type: e instanceof Error ? e.name : typeof e })
    return safeApiError('nfl-sync-player-stats', e)
  }
}

export const GET = withPipelineHealth('nfl-sync-player-stats', run)
