import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { precomputeDailyRecapForDate } from '@/lib/dailyRecapPrecompute'

export const maxDuration = 300

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) }
  const { data: profile } = await supabase.from('users').select('account_type').eq('id', user.id).single()
  if (profile?.account_type !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return {}
}

// One-off manual backfill for Daily Recap — same shape as
// dugout-statcast-backfill/route.ts: ?date=YYYY-MM-DD or
// ?dates=YYYY-MM-DD,YYYY-MM-DD,... — the daily cron only ever reprocesses a
// trailing few-day window, so a real season's worth of past dates (or any
// date further back than that window) needs this to populate once.
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

  const admin = createAdminClient()
  const results: Record<string, unknown> = {}
  for (const date of dates) {
    try {
      results[date] = await precomputeDailyRecapForDate(admin, date)
    } catch (e: any) {
      console.error('[daily-recap-backfill] date failed', date, e)
      results[date] = { error: e?.message || String(e) }
    }
  }
  return NextResponse.json({ dates, results })
}
