import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCronAuth } from '@/lib/cron-auth'
import { currentSeason } from '@/lib/playerSync'
import { syncSwingTake } from '@/lib/savantSplitsSync'

export const revalidate = 0
export const maxDuration = 60

// Runs once daily, ~6am ET (see vercel.json — a fixed UTC hour, so it'll
// drift an hour off 6am ET across the DST changeover until adjusted).
// Swing/Take (Batting Run Value) needs 38 separate requests (2 roles x 19
// sub-types across Pitch Type/Swing-Take/Attack Region/Bat-side), unlike
// the single-groupBy-response categories, so it gets its own route rather
// than folding into an existing one — a slow or failing batch here
// shouldn't risk timing out sibling categories. Season-only, no recency
// window (this leaderboard has no date-range params).
export async function GET(req: Request) {
  const authError = requireCronAuth(req)
  if (authError) return authError

  const admin = createAdminClient()
  const result = await syncSwingTake(admin, currentSeason())
  return NextResponse.json(result)
}
