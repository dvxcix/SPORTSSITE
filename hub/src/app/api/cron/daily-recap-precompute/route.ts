import { NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { precomputeDailyRecapForDate } from '@/lib/dailyRecapPrecompute'

export const revalidate = 0
export const maxDuration = 60

// Runs every few minutes during the day so new home runs show up on the
// Daily Recap page live, not just after savant-sync-pitch-log's once-daily
// pass — player_pitch_log itself only carries FINAL, fully-charted pitches
// (Statcast's own lag, same as the rest of this pipeline), so this never
// gets ahead of what's actually verifiable. Also reprocesses the trailing
// PAST_DAYS days every run, same self-healing shape as the other Dugout
// precompute crons — a date whose pitch log landed late gets its recap
// corrected automatically instead of staying incomplete forever.
const PAST_DAYS = 2

export async function GET(req: Request) {
  const authError = requireCronAuth(req)
  if (authError) return authError

  const { searchParams } = new URL(req.url)
  const explicitDate = searchParams.get('date')
  const todayEt = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const dates = explicitDate ? [explicitDate] : Array.from({ length: PAST_DAYS + 1 }, (_, i) => {
    const d = new Date(`${todayEt}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() - i)
    return d.toISOString().slice(0, 10)
  })

  const admin = createAdminClient()
  const results: Record<string, unknown> = {}
  for (const date of dates) {
    try {
      results[date] = await precomputeDailyRecapForDate(admin, date)
    } catch (e: any) {
      console.error('[daily-recap-precompute] date failed', date, e)
      results[date] = { error: e?.message || String(e) }
    }
  }
  return NextResponse.json({ dates, results })
}
