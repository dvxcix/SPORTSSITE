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
// whichever date is passed — same both-hands, all-5-windows result,
// upserted the same way, instantly usable by every viewer of that date
// afterward.
export async function GET(req: Request) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date')
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Pass a ?date=YYYY-MM-DD query param' }, { status: 400 })
  }

  try {
    const result = await precomputeDugoutStatcastForDate(date)
    return NextResponse.json(result)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 })
  }
}
