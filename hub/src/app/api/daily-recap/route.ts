import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireTier } from '@/lib/requireTier'

export const revalidate = 0

// Once a date is fully in the past (ET), its home runs can never change —
// cache it hard so re-visiting an old recap never re-hits the DB per
// viewer. Today's date stays short-lived since new HRs land throughout the
// day (the daily-recap-precompute cron writes them every 15 min).
const getCachedRecap = unstable_cache(
  async (date: string, isPast: boolean) => fetchRecap(date),
  ['daily-recap'],
  { revalidate: 180 } // overridden per-call below for past dates
)

async function fetchRecap(date: string) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('daily_recap_hr')
    .select('*')
    .eq('game_date', date)
    .order('at_bat_index', { ascending: true })
  if (error) throw error
  return { date, hrs: data ?? [] }
}

export async function GET(req: Request) {
  const gate = await requireTier('ultimate')
  if (gate.error) return gate.error

  const { searchParams } = new URL(req.url)
  const todayEt = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const date = searchParams.get('date') || todayEt
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 })
  }

  const isPast = date < todayEt
  // Past dates are frozen forever — a distinct, permanently-fresh cache key
  // per date means this literally never recomputes once written, matching
  // "cache it once the day's over" exactly. Today's own key is reused daily
  // (same 'daily-recap' tag) with a short revalidate so it stays live.
  const data = isPast
    ? await unstable_cache(async () => fetchRecap(date), ['daily-recap', date], { revalidate: false })()
    : await getCachedRecap(date, false)

  return NextResponse.json(data)
}
