import { NextResponse } from 'next/server'
import { withPipelineHealth } from '@/lib/pipelineHealth'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCronAuth } from '@/lib/cron-auth'
import { settleNbaPicks } from '@/lib/nbaSettlement'
import { settleSportPicks } from '@/lib/sportSettlement'

export const revalidate = 0
export const maxDuration = 60

async function run(req: Request) {
  const authError = requireCronAuth(req)
  if (authError) return authError
  const admin = createAdminClient(), deadline = Date.now() + 55_000
  const [mlb, nfl, nba] = await Promise.all([
    settleSportPicks(admin, 'MLB', deadline, false),
    settleSportPicks(admin, 'NFL', deadline),
    settleNbaPicks(admin, deadline),
  ])
  return NextResponse.json({
    graded: mlb.graded + nfl.graded + nba.graded,
    settled: mlb.graded + nfl.graded + nba.graded, won: mlb.won + nfl.won,
    checked: mlb.checked + nfl.checked + nba.checked,
    skipped: mlb.skipped + nfl.skipped + nba.skipped,
    mlb, nfl, nba,
  })
}

export const GET = withPipelineHealth('settle-picks', run)
