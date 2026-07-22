import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireTier } from '@/lib/requireTier'
import { fetchPlayerPitchRows, enrichPitchRows } from '@/lib/pitchLogFetch'

export const revalidate = 0

// Every pitch a player has thrown (as pitcher) and/or seen (as batter) this
// season, trimmed to the fields the zone-heatmap and matchup-explorer cards
// need — feeds src/components/players/PitchZoneHeatmap.tsx and
// BatterMatchupExplorer.tsx. Deliberately a separate endpoint from
// /api/players/[id]: this payload (thousands of raw rows, filtered/
// aggregated entirely client-side same as the split explorers) is much
// heavier than everything else on the page combined, so it loads
// independently rather than blocking the rest of the page on it.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireTier('basic')
  if (gate.error) return gate.error

  const { id } = await params
  const mlbId = Number(id)
  if (!Number.isFinite(mlbId)) {
    return NextResponse.json({ error: 'Invalid player id' }, { status: 400 })
  }

  const admin = createAdminClient()

  const [pitcherRows, batterRows] = await Promise.all([
    fetchPlayerPitchRows(admin, mlbId, 'pitcher'),
    fetchPlayerPitchRows(admin, mlbId, 'batter'),
  ])

  if (!pitcherRows.length && !batterRows.length) {
    return NextResponse.json({ pitcherRows: [], batterRows: [] })
  }

  const opponentIds = new Set<number>()
  pitcherRows.forEach(r => opponentIds.add(r.batter_id))
  batterRows.forEach(r => opponentIds.add(r.pitcher_id))
  const gamePks = new Set<string>()
  pitcherRows.forEach(r => gamePks.add(r.game_pk))
  batterRows.forEach(r => gamePks.add(r.game_pk))

  const [oppRes, gamesRes] = await Promise.all([
    opponentIds.size ? admin.from('players').select('mlb_id, full_name, current_team_abbr').in('mlb_id', Array.from(opponentIds)) : Promise.resolve({ data: [] as { mlb_id: number; full_name: string | null; current_team_abbr: string | null }[] }),
    gamePks.size ? admin.from('games').select('game_pk, day_night, venue_name').in('game_pk', Array.from(gamePks)) : Promise.resolve({ data: [] as { game_pk: string; day_night: string | null; venue_name: string | null }[] }),
  ])
  const opponents = Object.fromEntries((oppRes.data ?? []).map(p => [p.mlb_id, p]))
  const gameInfo = Object.fromEntries((gamesRes.data ?? []).map(g => [g.game_pk, g]))

  return NextResponse.json({
    pitcherRows: enrichPitchRows(pitcherRows, 'batter_id', opponents, gameInfo),
    batterRows: enrichPitchRows(batterRows, 'pitcher_id', opponents, gameInfo),
  })
}
