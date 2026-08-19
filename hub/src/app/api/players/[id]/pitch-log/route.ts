import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireTier } from '@/lib/requireTier'
import { fetchPlayerPitchRows, fetchPlayerSprayRows, enrichPitchRows } from '@/lib/pitchLogFetch'
import { fetchMlbPartyRows } from '@/lib/mlbPartyServer'

export const revalidate = 0

type NearHrRow = {
  game_pk: number
  game_date: string
  result: string | null
  exit_velocity: number | null
  launch_angle: number | null
  hit_distance: number | null
  hit_bearing: number | null
  parks_hr_count: number | null
  park_hr_list: string | null
}

type HomeRunDetailRow = {
  game_pk: number
  exit_velocity: number | null
  launch_angle: number | null
  hr_distance: number | null
  parks: Record<string, boolean> | null
  detail_source: 'savant' | 'canonical_pitch_log'
}

function sameBattedBall(
  pitch: Record<string, unknown>,
  detail: { game_pk: number; exit_velocity: number | null; launch_angle: number | null; hit_distance?: number | null; hr_distance?: number | null },
) {
  if (Number(pitch.game_pk) !== Number(detail.game_pk)) return false
  const comparisons = [
    [pitch.launch_speed, detail.exit_velocity, 0.25],
    [pitch.launch_angle, detail.launch_angle, 0.25],
    [pitch.hit_distance, detail.hit_distance ?? detail.hr_distance, 2],
  ].filter(([left, right]) => left != null && right != null)

  // A game can contain several batted balls by the same hitter. Never
  // attach near-HR or park-count metadata from a merely game-level match:
  // require at least two independent Statcast measurements to agree.
  return comparisons.length >= 2 && comparisons.every(([left, right, tolerance]) => (
    Math.abs(Number(left) - Number(right)) <= Number(tolerance)
  ))
}

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

    const [pitcherRows, batterRows, sprayRows] = await Promise.all([
      fetchPlayerPitchRows(admin, mlbId, 'pitcher'),
      fetchPlayerPitchRows(admin, mlbId, 'batter'),
      fetchPlayerSprayRows(admin, mlbId),
    ])

    if (!pitcherRows.length && !batterRows.length && !sprayRows.length) {
      return { pitcherRows: [], batterRows: [], sprayRows: [] }
    }

    const opponentIds = new Set<number>()
    pitcherRows.forEach(r => opponentIds.add(r.batter_id))
    batterRows.forEach(r => opponentIds.add(r.pitcher_id))
    sprayRows.forEach(r => opponentIds.add(r.pitcher_id))
    const gamePks = new Set<string>()
    pitcherRows.forEach(r => gamePks.add(r.game_pk))
    batterRows.forEach(r => gamePks.add(r.game_pk))
    sprayRows.forEach(r => gamePks.add(r.game_pk))

    const firstDate = sprayRows.reduce<string | null>((oldest, row) => {
      const date = String(row.game_date ?? '')
      return date && (!oldest || date < oldest) ? date : oldest
    }, null)

    const [oppRes, gamesRes, nearHrRows, homeRunDetails] = await Promise.all([
      opponentIds.size ? admin.from('players').select('mlb_id, full_name, current_team_abbr').in('mlb_id', Array.from(opponentIds)) : Promise.resolve({ data: [] as { mlb_id: number; full_name: string | null; current_team_abbr: string | null }[] }),
      gamePks.size ? admin.from('games').select('game_pk, day_night, venue_id, venue_name, home_team_id, home_team, away_team_id, away_team').in('game_pk', Array.from(gamePks)) : Promise.resolve({ data: [] as { game_pk: string; day_night: string | null; venue_id: number | null; venue_name: string | null; home_team_id: number | null; home_team: string | null; away_team_id: number | null; away_team: string | null }[] }),
      firstDate ? fetchMlbPartyRows<NearHrRow>(
        `/rest/v1/near_hrs?batter_id=eq.${mlbId}&game_date=gte.${encodeURIComponent(firstDate)}&select=game_pk,game_date,result,exit_velocity,launch_angle,hit_distance,hit_bearing,parks_hr_count,park_hr_list`,
        { maxRows: 1000, revalidateSeconds: 86400 },
      ).catch(() => [] as NearHrRow[]) : Promise.resolve([] as NearHrRow[]),
      sprayRows.length ? admin.from('player_home_run_events')
        .select('game_pk,exit_velocity,launch_angle,hr_distance,parks,detail_source')
        .eq('batter_id', mlbId)
        .order('game_date', { ascending: false }) : Promise.resolve({ data: [] as HomeRunDetailRow[] }),
    ])
    const opponents = Object.fromEntries((oppRes.data ?? []).map(p => [p.mlb_id, p]))
    const gameInfo = Object.fromEntries((gamesRes.data ?? []).map(g => [g.game_pk, g]))

    const enrichedSprayRows = enrichPitchRows(sprayRows, 'pitcher_id', opponents, gameInfo).map(row => {
      const near = nearHrRows.find(detail => sameBattedBall(row, detail)) ?? null
      const homeRun = row.is_home_run
        ? (homeRunDetails.data ?? []).find(detail => sameBattedBall(row, detail)) ?? null
        : null
      const parksHrCount = homeRun?.detail_source === 'savant' && homeRun.parks
        ? Object.values(homeRun.parks).filter(Boolean).length
        : near?.parks_hr_count ?? null
      return {
        ...row,
        parks_hr_count: parksHrCount,
        park_hr_list: near?.park_hr_list ?? null,
        hit_bearing: near?.hit_bearing ?? null,
        is_near_hr: Boolean(near),
      }
    })

    return {
      pitcherRows: enrichPitchRows(pitcherRows, 'batter_id', opponents, gameInfo),
      batterRows: enrichPitchRows(batterRows, 'pitcher_id', opponents, gameInfo),
      sprayRows: enrichedSprayRows,
    }
  },
  ['player-pitch-log-v2'],
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
