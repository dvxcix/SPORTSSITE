import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCronAuth } from '@/lib/cron-auth'
import { currentSeason } from '@/lib/playerSync'
import { syncPitchArsenalDetailBatch } from '@/lib/savantPitchArsenalSync'

export const revalidate = 0
export const maxDuration = 60

// Runs once daily, ~6am ET (see vercel.json — a fixed UTC hour, so it'll
// drift an hour off 6am ET across the DST changeover until adjusted) —
// same reasoning as every other Savant-sourced cron: this data settles
// once a day, not live in-game. Depends on savant-sync-pitch-arsenal-stats
// having already populated the pitcher-side combo list it seeds from — run
// that one first (both here and on the initial manual catch-up). Claims
// ~400 (pitcher, pitch_type) combos per tick, fetched concurrently (see
// savantPitchArsenalSync.ts). The initial backlog (~3,170 combos) needs a
// few manual triggers to fully catch up; after that, one daily run covers
// each day's new plate appearances.
export async function GET(req: Request) {
  const authError = requireCronAuth(req)
  if (authError) return authError

  const admin = createAdminClient()
  const result = await syncPitchArsenalDetailBatch(admin, currentSeason())
  return NextResponse.json(result)
}
