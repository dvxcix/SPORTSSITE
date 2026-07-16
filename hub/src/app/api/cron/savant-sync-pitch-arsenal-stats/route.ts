import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCronAuth } from '@/lib/cron-auth'
import { currentSeason } from '@/lib/playerSync'
import { syncPitchArsenalStats } from '@/lib/savantSplitsSync'

export const revalidate = 0
export const maxDuration = 60

// Runs once daily, ~6am ET (see vercel.json — a fixed UTC hour, so it'll
// drift an hour off 6am ET across the DST changeover until adjusted).
// Pitch Arsenal Stats — RV/100, run value, usage%, BA/SLG/wOBA, whiff%/K%/
// put-away%, xBA/xSLG/xwOBA, hard-hit% per (player, pitch_type), both
// batter and pitcher roles. Season-only aggregate; the per-pitch drill-down
// behind each row is the separate savant-sync-pitch-arsenal-details cron.
export async function GET(req: Request) {
  const authError = requireCronAuth(req)
  if (authError) return authError

  const admin = createAdminClient()
  const result = await syncPitchArsenalStats(admin, currentSeason())
  return NextResponse.json(result)
}
