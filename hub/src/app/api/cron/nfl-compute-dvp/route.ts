import { NextResponse } from 'next/server'
import { withPipelineHealth } from '@/lib/pipelineHealth'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCronAuth } from '@/lib/cron-auth'
import { computeNflDvp, computeNflDvpFromPbp } from '@/lib/nflverseSync'

export const revalidate = 0
export const maxDuration = 60

function currentNflSeason(): number {
  const now = new Date()
  const year = now.getUTCFullYear()
  return now.getUTCMonth() < 2 ? year - 1 : year
}

// Recomputes off nfl_player_stats, which is already synced nightly — this is
// pure aggregation, no new fetch, so cheap enough to redo the current AND
// prior season every run rather than track exactly when a week's box scores
// finalize. Runs the PBP-derived fallback FIRST, then the box-score version
// — nflverse's player_stats.csv is the more authoritative, already-official
// source, so it's allowed to overwrite the PBP reconstruction whenever real
// weekly rows exist; PBP only fills the gap while player_stats.csv lags
// behind pbp/nextgen_stats' own release (a real, recurring lag, not a
// one-off).
async function run(req: Request) {
  const authError = requireCronAuth(req)
  if (authError) return authError

  const admin = createAdminClient()
  const season = currentNflSeason()
  try {
    await Promise.all([
      computeNflDvpFromPbp(admin, season),
      computeNflDvpFromPbp(admin, season - 1),
    ])
    const [current, prior] = await Promise.all([
      computeNflDvp(admin, season),
      computeNflDvp(admin, season - 1),
    ])
    return NextResponse.json({ current, prior, seasons: [season, season - 1] })
  } catch (e: any) {
    console.error('[nfl-compute-dvp] failed', e)
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 })
  }
}

export const GET = withPipelineHealth('nfl-compute-dvp', run)
