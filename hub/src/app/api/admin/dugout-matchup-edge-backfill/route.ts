import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { precomputeMatchupEdgeForDate } from '@/lib/dugoutMatchupEdgePrecompute'

export const maxDuration = 300

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) }
  const { data: profile } = await supabase.from('users').select('account_type').eq('id', user.id).single()
  if (profile?.account_type !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return {}
}

// One-off manual backfill for the matchup_edge/platoon_ops precompute (see
// dugoutMatchupEdgePrecompute.ts / the daily cron of the same name) for a
// SPECIFIC past date — same admin-session-gated pattern as
// dugout-statcast-backfill, so this is safe to hit directly from a
// logged-in admin browser tab with no secret ever typed in or shared.
export async function GET(req: Request) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date')
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Pass a ?date=YYYY-MM-DD query param' }, { status: 400 })
  }

  try {
    const result = await precomputeMatchupEdgeForDate(date)
    return NextResponse.json(result)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 })
  }
}
