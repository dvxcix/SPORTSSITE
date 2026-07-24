import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCronAuth } from '@/lib/cron-auth'
import { currentSeason } from '@/lib/playerSync'
import { BATTED_BALL_PROFILE, syncBothWindows } from '@/lib/savantSplitsSync'

export const revalidate = 0
export const maxDuration = 150

// Runs once daily, ~6am ET (see vercel.json — a fixed UTC hour, so it'll
// drift an hour off 6am ET across the DST changeover until adjusted).
// Ground/fly/line-drive/popup + pull/straight/oppo rates, split by pitch
// type x bat side x pitch hand, both season-to-date and rolling recency —
// second category on the same shared engine bat tracking uses.
export async function GET(req: Request) {
  const authError = requireCronAuth(req)
  if (authError) return authError

  const admin = createAdminClient()
  const result = await syncBothWindows(admin, BATTED_BALL_PROFILE, currentSeason())
  return NextResponse.json(result)
}
