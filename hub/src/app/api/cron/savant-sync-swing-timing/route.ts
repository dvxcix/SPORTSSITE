import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCronAuth } from '@/lib/cron-auth'
import { currentSeason } from '@/lib/playerSync'
import { SWING_TIMING_MISS_DISTANCE, syncBothWindows } from '@/lib/savantSplitsSync'

export const revalidate = 0
export const maxDuration = 150

// Runs once daily, ~6am ET (see vercel.json — a fixed UTC hour, so it'll
// drift an hour off 6am ET across the DST changeover until adjusted).
// Swing Timing + Miss Distance — tied-up/centered/flail (in/out), early/
// on-time/late, under/lined-up/over, whiff rate, and miss distance, split
// by pitch type x bat side x pitch hand x contact type, both season and
// recency. Same shape class + engine as bat tracking/batted ball.
export async function GET(req: Request) {
  const authError = requireCronAuth(req)
  if (authError) return authError

  const admin = createAdminClient()
  const result = await syncBothWindows(admin, SWING_TIMING_MISS_DISTANCE, currentSeason())
  return NextResponse.json(result)
}
