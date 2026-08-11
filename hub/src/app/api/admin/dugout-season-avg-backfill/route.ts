import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { precomputeDugoutSeasonAvgForDate } from '@/lib/dugoutSeasonAvgPrecompute'

export const maxDuration = 300

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) }
  const { data: profile } = await supabase.from('users').select('account_type').eq('id', user.id).single()
  if (profile?.account_type !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return {}
}

// One-off manual backfill for the season-avg precompute (see
// dugoutSeasonAvgPrecompute.ts / the daily dugout-season-avg-precompute
// cron) — same shape as the existing dugout-pitchlog-stat-backfill route,
// gated by a real signed-in admin session instead of CRON_SECRET. Time-
// sensitive: mlb-party's own player_price_season_avg retention for a given
// through_date isn't guaranteed to last — running this now recovers
// whatever history still survives there before it erodes further.
// Accepts either ?date=YYYY-MM-DD (a single date) or
// ?dates=YYYY-MM-DD,YYYY-MM-DD,... (a specific list). Each date is
// isolated in its own try/catch, same as the cron's own trailing-window loop.
export async function GET(req: Request) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const { searchParams } = new URL(req.url)
  const single = searchParams.get('date')
  const list = searchParams.get('dates')
  const dates = list ? list.split(',').map(d => d.trim()).filter(Boolean) : single ? [single] : []

  if (!dates.length || dates.some(d => !/^\d{4}-\d{2}-\d{2}$/.test(d))) {
    return NextResponse.json({ error: 'Pass a ?date=YYYY-MM-DD or ?dates=YYYY-MM-DD,YYYY-MM-DD,... query param' }, { status: 400 })
  }

  const results: Record<string, unknown> = {}
  for (const date of dates) {
    try {
      results[date] = await precomputeDugoutSeasonAvgForDate(date)
    } catch (e) {
      console.error('[dugout-season-avg-backfill] date failed', { date, type: e instanceof Error ? e.name : typeof e })
      results[date] = { error: 'precompute failed' }
    }
  }
  return NextResponse.json({ dates, results })
}
