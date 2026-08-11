import { NextResponse } from 'next/server'
import { withPipelineHealth } from '@/lib/pipelineHealth'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCronAuth } from '@/lib/cron-auth'
import { currentSeason } from '@/lib/playerSync'
import { daysAgoET } from '@/lib/savantSplitsSync'
import { PITCH_LOG_TABLE } from '@/lib/statcastPitchLogSync'
import { checkPitchLogFreshnessAndAlert } from '@/lib/pitchLogAlert'
import { safeApiError } from '@/lib/safeApiError'

export const revalidate = 0
export const maxDuration = 30

// savant-sync-pitch-log already calls checkPitchLogFreshnessAndAlert itself
// — but only AFTER its own sync loop finishes, so a Vercel platform-level
// timeout on that route (its real failure mode, see that route's own
// maxDuration comment) kills the alert along with everything else. This is
// the same freshness check, run as its own tiny standalone request so an
// alert can fire even when the sync route never reaches the end of its own
// invocation. Scheduled ~80min after savant-sync-pitch-log (vercel.json),
// giving that route's own recheck-window self-heal a real shot first.
async function run(req: Request) {
  const authError = requireCronAuth(req)
  if (authError) return authError

  const admin = createAdminClient()
  const season = currentSeason()
  const end = daysAgoET(1)

  const { data: freshness, error } = await admin
    .from(PITCH_LOG_TABLE)
    .select('game_date')
    .eq('season', season)
    .order('game_date', { ascending: false })
    .limit(1)
  if (error) return safeApiError('pitch-log-freshness-query', error)

  const latestDate = freshness?.[0]?.game_date ?? null
  await checkPitchLogFreshnessAndAlert(admin, latestDate, end)

  return NextResponse.json({ season, latestDate, expected: end })
}

export const GET = withPipelineHealth('pitch-log-freshness-check', run)
