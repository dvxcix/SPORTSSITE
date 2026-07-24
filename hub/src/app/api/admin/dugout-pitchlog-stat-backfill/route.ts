import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { precomputeDugoutPitchlogStatForDate } from '@/lib/dugoutPitchlogStatPrecompute'

export const maxDuration = 300

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) }
  const { data: profile } = await supabase.from('users').select('account_type').eq('id', user.id).single()
  if (profile?.account_type !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return {}
}

// One-off manual backfill for the pitchlog_stat precompute (see
// dugoutPitchlogStatPrecompute.ts / the daily dugout-pitchlog-stat-
// precompute cron) — same shape as the existing dugout-statcast-backfill
// route, gated by a real signed-in admin session instead of CRON_SECRET.
// Accepts either ?date=YYYY-MM-DD (a single date, original behavior) or
// ?dates=YYYY-MM-DD,YYYY-MM-DD,... (a specific list, not necessarily
// contiguous — e.g. skipping All-Star break days with no real slate) so a
// one-off catch-up across several real past dates doesn't need one manual
// request per date. Each date is isolated in its own try/catch, same as
// the cron's own trailing-window loop — one bad date doesn't abort the rest.
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
      results[date] = await precomputeDugoutPitchlogStatForDate(date)
    } catch (e: any) {
      console.error('[dugout-pitchlog-stat-backfill] date failed', date, e)
      results[date] = { error: e?.message || String(e) }
    }
  }
  return NextResponse.json({ dates, results })
}
