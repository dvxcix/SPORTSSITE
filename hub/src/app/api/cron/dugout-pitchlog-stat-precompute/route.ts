import { NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'
import { precomputeDugoutPitchlogStatForDate } from '@/lib/dugoutPitchlogStatPrecompute'

export const revalidate = 0
export const maxDuration = 300

// Runs daily after savant-sync-pitch-log (see vercel.json) finishes writing
// today's player_pitch_log rows. Precomputes Custom Matrix's pitchlog_stat
// category for every batter who could appear today — see
// dugoutPitchlogStatPrecompute.ts for why this moved out of the request
// path entirely (a real production incident: 28-56s request spikes for
// the specific real members whose Matrix uses this category).
//
// Same trailing-window self-heal as dugout-statcast-precompute — Savant's
// per-pitch CSV export doesn't always land same-day, so a date that was
// incomplete when this first ran gets picked back up automatically on a
// later run instead of staying silently wrong.
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

  const results: Record<string, unknown> = {}
  for (const date of dates) {
    try {
      results[date] = await precomputeDugoutPitchlogStatForDate(date)
    } catch (e: any) {
      console.error('[dugout-pitchlog-stat-precompute] date failed', date, e)
      results[date] = { error: e?.message || String(e) }
    }
  }
  return NextResponse.json({ dates, results })
}
