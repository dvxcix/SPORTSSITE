import { NextResponse } from 'next/server'
import { requireTier } from '@/lib/requireTier'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const MAX_SNAPSHOTS = 2400

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
  const { data, error } = await admin
    .from('pregame_odds_snapshot_history')
    .select('captured_at,prop_map')
    .eq('game_date', date)
    .eq('game_pk', gamePk)
    .order('captured_at', { ascending: true })
    .limit(MAX_SNAPSHOTS)

  if (error) {
    console.error('[odds-terminal] history read failed', { date, gamePk, error })
    return NextResponse.json({ error: 'Odds history is temporarily unavailable.' }, { status: 500 })
  }

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  return NextResponse.json(
    { date, gamePk, snapshots: data ?? [] },
    { headers: { 'Cache-Control': date === today ? 'private, max-age=20' : 'private, max-age=86400, immutable' } },
  )
}
