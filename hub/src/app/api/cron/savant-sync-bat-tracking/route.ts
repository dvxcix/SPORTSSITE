import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCronAuth } from '@/lib/cron-auth'
import { currentSeason } from '@/lib/playerSync'
import { BAT_TRACKING, syncBothWindows } from '@/lib/savantSplitsSync'

export const revalidate = 0
export const maxDuration = 150

// Runs once daily, ~6am ET (see vercel.json — a fixed UTC hour, so it'll
// drift an hour off 6am ET across the DST changeover until adjusted) — one
// pull each morning is enough to catch yesterday's now-final game onto
// both windows; Savant's data isn't live, so polling more often gains
// nothing. The first "recency vs season" category — the actual
// competitive-edge data, not just season aggregates. See syncBothWindows
// for the shared batter/pitcher x season/recency loop every split-based
// category uses.
export async function GET(req: Request) {
  const authError = requireCronAuth(req)
  if (authError) return authError

  const admin = createAdminClient()
  const result = await syncBothWindows(admin, BAT_TRACKING, currentSeason())
  return NextResponse.json(result)
}
