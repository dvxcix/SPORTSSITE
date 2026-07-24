import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireTier } from '@/lib/requireTier'

export const revalidate = 0

// A batter's own synced Savant bat-tracking splits — every window_type
// (season/recency/l1/l3/l5/l10), every real dims combination Savant returns
// (pitch type x contact type x bat side x pitch hand). Only the 4
// categories a per-pitch-type UI can actually use here; only ever written
// by the once-daily savant-sync-* crons, same 30-min-shared-cache reasoning
// as the pitch-log route this pairs with.
const getCachedSplits = unstable_cache(
  async (mlbId: number) => {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('player_statcast_splits')
      .select('category, window_type, dims, metrics')
      .eq('mlb_id', mlbId)
      .eq('role', 'batter')
      .in('category', ['bat_tracking', 'swing_path_attack_angle'])
    if (error) throw error
    return data ?? []
  },
  ['player-bat-tracking-splits'],
  { revalidate: 1800 }
)

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireTier('basic')
  if (gate.error) return gate.error

  const { id } = await params
  const mlbId = Number(id)
  if (!Number.isFinite(mlbId)) {
    return NextResponse.json({ error: 'Invalid player id' }, { status: 400 })
  }

  const rows = await getCachedSplits(mlbId)
  return NextResponse.json({ rows })
}
