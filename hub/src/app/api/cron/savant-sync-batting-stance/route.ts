import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCronAuth } from '@/lib/cron-auth'
import { currentSeason } from '@/lib/playerSync'
import { syncBattingStance } from '@/lib/savantSplitsSync'

export const revalidate = 0
export const maxDuration = 60

// Runs once daily, ~6am ET (see vercel.json — a fixed UTC hour, so it'll
// drift an hour off 6am ET across the DST changeover until adjusted).
// Batting Stance — batter-only, no pitcher/team variant on Savant's own
// page. Average stance position/foot separation/stance angle/plate
// intercept, split vs LHP/RHP/all, both season-to-date and recency.
export async function GET(req: Request) {
  const authError = requireCronAuth(req)
  if (authError) return authError

  const admin = createAdminClient()
  const result = await syncBattingStance(admin, currentSeason())
  return NextResponse.json(result)
}
