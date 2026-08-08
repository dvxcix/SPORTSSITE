import { NextResponse } from 'next/server'
import { requireTier } from '@/lib/requireTier'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const MAX_SNAPSHOTS = 2400
const PAGE_SIZE = 1000

export async function GET(req: Request) {
  const gate = await requireTier('ultimate')
  if (gate.error) return gate.error

  const { searchParams } = new URL(req.url)
  const gamePk = searchParams.get('gamePk')?.trim()
  const date = searchParams.get('date')?.trim()
  if (!gamePk || !/^\d+$/.test(gamePk) || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'A valid date and gamePk are required.' }, { status: 400 })
  }

  const admin = createAdminClient()
  // A single `.limit(MAX_SNAPSHOTS)` call USED to be trusted to return up to
  // 2400 rows — this project's PostgREST caps any single request at 1000
  // regardless of the requested limit, and bdl-odds polls every minute for
  // as long as a game stays pregame (often many hours once probable
  // pitchers post the evening before), so a busy game easily accumulates
  // 2000-2800+ real snapshot rows. Confirmed live: some games already have
  // 2700+. Ascending order meant the old single-shot call was silently
  // serving only the OLDEST 1000 — the terminal's intraday chart would
  // appear to just stop updating partway through the day. Paginated instead.
  const snapshots: { captured_at: string; prop_map: unknown }[] = []
  for (let from = 0; from < MAX_SNAPSHOTS; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from('pregame_odds_snapshot_history')
      .select('captured_at,prop_map')
      .eq('game_date', date)
      .eq('game_pk', gamePk)
      .order('captured_at', { ascending: true })
      .range(from, Math.min(from + PAGE_SIZE, MAX_SNAPSHOTS) - 1)

    if (error) {
      console.error('[odds-terminal] history read failed', { date, gamePk, error })
      return NextResponse.json({ error: 'Odds history is temporarily unavailable.' }, { status: 500 })
    }
    if (!data?.length) break
    snapshots.push(...data)
    if (data.length < PAGE_SIZE) break
  }

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  return NextResponse.json(
    { date, gamePk, snapshots },
    { headers: { 'Cache-Control': date === today ? 'private, max-age=20' : 'private, max-age=86400, immutable' } },
  )
}
