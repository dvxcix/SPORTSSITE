import { NextResponse } from 'next/server'
import { withPipelineHealth } from '@/lib/pipelineHealth'
import { safeApiError } from '@/lib/safeApiError'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCronAuth } from '@/lib/cron-auth'
import { syncNflPlayers } from '@/lib/nflverseSync'

export const revalidate = 0
export const maxDuration = 120

// players.csv covers every player in nflverse's history (~25k+ rows) in one
// file — a full daily re-upsert is simpler and more reliable than tracking
// which specific players changed, and nflverse republishes the whole file
// nightly anyway so there's no way to fetch just a delta.
async function run(req: Request) {
  const authError = requireCronAuth(req)
  if (authError) return authError

  const admin = createAdminClient()
  try {
    const count = await syncNflPlayers(admin)
    return NextResponse.json({ synced: count })
  } catch (e: any) {
    console.error('[nfl-sync-players] failed', { type: e instanceof Error ? e.name : typeof e })
    return safeApiError('nfl-sync-players', e)
  }
}

export const GET = withPipelineHealth('nfl-sync-players', run)
