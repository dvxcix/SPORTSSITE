import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { precomputeDugoutStatcastForDate } from '@/lib/dugoutStatcastPrecompute'

export const maxDuration = 300

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) }
  const { data: profile } = await supabase.from('users').select('account_type').eq('id', user.id).single()
  if (profile?.account_type !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return {}
}

// One-off manual backfill for the Dugout Statcast precompute (see
// dugoutStatcastPrecompute.ts / the daily dugout-statcast-precompute cron)
// for a SPECIFIC past date — the cron itself only ever runs for "today,"
// and Vercel's own dashboard "Run" button on a scheduled cron always hits
// its configured path with no way to pass a custom date through. Gated by
// a real signed-in admin session instead of CRON_SECRET specifically so
// this is safe to hit directly from a logged-in admin browser tab — no
// secret ever needs to be typed in or shared. Runs the exact same
// precomputeDugoutStatcastForDate() the daily cron calls, just for
// whichever date is passed - same both-hands, all-5-windows result. Past
// dates are insert-only snapshots: this fills absent rows without changing
// Batter Charge inputs that were already visible on that historical board.
//
// Accepts either ?date=YYYY-MM-DD (a single date, original behavior) or
// ?dates=YYYY-MM-DD,YYYY-MM-DD,... (a specific list, not necessarily
// contiguous — e.g. skipping All-Star break days with no real slate) —
// same shape as dugout-pitchlog-stat-backfill's own multi-date support,
// added for the exact same reason: re-running a whole season's worth of
// past dates after adding a brand-new StatcastLine field (e.g. Sweet Spot
// %) shouldn't need one manual request per date.
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
      results[date] = await precomputeDugoutStatcastForDate(date)
    } catch (e) {
      console.error('[dugout-statcast-backfill] date failed', { date, type: e instanceof Error ? e.name : typeof e })
      results[date] = { error: 'precompute failed' }
    }
  }
  return NextResponse.json({ dates, results })
}
