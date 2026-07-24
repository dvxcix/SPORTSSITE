import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireTier } from '@/lib/requireTier'
import { fetchPlayerPitchRows, enrichPitchRows } from '@/lib/pitchLogFetch'

export const revalidate = 0

// Same response for every caller who passes the tier gate (no per-user/
// per-tier field shaping here, unlike /api/dugout/data) — safe to cache
// as a flat function of mlbId alone. player_pitch_log is only ever written
// by the once-daily savant-sync-pitch-log cron (10:10 UTC), so a real
// player's full season log genuinely cannot change in between.
//
// Tagged (not just time-revalidated): a plain rolling `revalidate` window
// is the wrong tool here — if a player's entry gets cached shortly BEFORE
// that day's sync cron runs, a rolling window measured from cache-creation
// time would keep serving yesterday's log for up to a full extra day after
// fresh data already landed, since the window's clock has nothing to do
// with when the cron actually writes. savant-sync-pitch-log calls
// revalidateTag('player-pitch-log') once it finishes each run, so this
// invalidates the instant new data is confirmed written — not on some
// timer that may or may not line up with the cron. The 24h `revalidate` is
// just a defensive fallback (self-heals even if a revalidateTag call is
// ever missed), not the real freshness mechanism.
const getCachedPitchLog = unstable_cache(
  async (mlbId: number) => {
    const admin = createAdminClient()

    const [pitcherRows, batterRows] = await Promise.all([
      fetchPlayerPitchRows(admin, mlbId, 'pitcher'),
      fetchPlayerPitchRows(admin, mlbId, 'batter'),
    ])

    if (!pitcherRows.length && !batterRows.length) {
      return { pitcherRows: [], batterRows: [] }
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

    return {
      pitcherRows: enrichPitchRows(pitcherRows, 'batter_id', opponents, gameInfo),
      batterRows: enrichPitchRows(batterRows, 'pitcher_id', opponents, gameInfo),
    }
  },
  ['player-pitch-log'],
  { revalidate: 86400, tags: ['player-pitch-log'] }
)

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

  const data = await getCachedPitchLog(mlbId)
  return NextResponse.json(data)
}
