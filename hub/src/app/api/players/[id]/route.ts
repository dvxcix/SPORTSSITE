import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { currentSeason } from '@/lib/playerSync'

export const revalidate = 0

// Test/v1 read for the site-owned player data system built up across the
// player-data project — bio, season/career stats, the Savant Tier A season
// categories, fielding/baserunning, the pitch-arsenal-stats splits (both
// roles, in case of a two-way player), and a recent home-run log (as
// batter and, separately, allowed as pitcher). Deliberately does NOT
// surface the full pitch-by-pitch arsenal event log or the bat-tracking/
// batted-ball/swing-take splits (hundreds of dim combos per player) — this
// is the first real pass at the page, not the final one.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const mlbId = Number(id)
  if (!Number.isFinite(mlbId)) {
    return NextResponse.json({ error: 'Invalid player id' }, { status: 400 })
  }

  const admin = createAdminClient()
  const season = currentSeason()

  const [
    playerRes,
    seasonBatRes, seasonPitRes,
    careerBatRes, careerPitRes,
    hittingSeasonRes, pitchingSeasonRes,
    fieldingRes, baserunningRes,
    arsenalBatRes, arsenalPitRes,
    hrHitRes, hrAllowedRes,
  ] = await Promise.all([
    admin.from('players').select('*').eq('mlb_id', mlbId).maybeSingle(),
    admin.from('player_season_stats_batting').select('*').eq('mlb_id', mlbId).eq('season', season).eq('game_type', 'R').maybeSingle(),
    admin.from('player_season_stats_pitching').select('*').eq('mlb_id', mlbId).eq('season', season).eq('game_type', 'R').maybeSingle(),
    admin.from('player_career_stats_batting').select('*').eq('mlb_id', mlbId).maybeSingle(),
    admin.from('player_career_stats_pitching').select('*').eq('mlb_id', mlbId).maybeSingle(),
    admin.from('player_statcast_hitting_season').select('category, metrics').eq('mlb_id', mlbId).eq('season', season),
    admin.from('player_statcast_pitching_season').select('category, metrics').eq('mlb_id', mlbId).eq('season', season),
    admin.from('player_fielding_season').select('position, category, metrics').eq('mlb_id', mlbId).eq('season', season),
    admin.from('player_baserunning_season').select('category, metrics').eq('mlb_id', mlbId).eq('season', season),
    admin.from('player_statcast_splits').select('dims, metrics').eq('mlb_id', mlbId).eq('role', 'batter').eq('category', 'pitch_arsenal_stats').eq('window_type', 'season'),
    admin.from('player_statcast_splits').select('dims, metrics').eq('mlb_id', mlbId).eq('role', 'pitcher').eq('category', 'pitch_arsenal_stats').eq('window_type', 'season'),
    admin.from('player_home_run_events').select('*').eq('batter_id', mlbId).order('game_date', { ascending: false }).limit(15),
    admin.from('player_home_run_events').select('*').eq('pitcher_id', mlbId).order('game_date', { ascending: false }).limit(15),
  ])

  if (!playerRes.data) {
    return NextResponse.json({ error: 'Player not found' }, { status: 404 })
  }

  const toMetricsObject = (rows: { category: string; metrics: unknown }[] | null) =>
    Object.fromEntries((rows ?? []).map(r => [r.category, r.metrics]))

  const sortByPitches = (rows: { dims: unknown; metrics: unknown }[] | null) =>
    (rows ?? [])
      .map(r => ({ pitchType: (r.dims as any)?.pitch_type as string, ...(r.metrics as any) }))
      .sort((a, b) => (b.pitches ?? 0) - (a.pitches ?? 0))

  return NextResponse.json({
    season,
    player: playerRes.data,
    seasonStats: { batting: seasonBatRes.data, pitching: seasonPitRes.data },
    careerStats: { batting: careerBatRes.data, pitching: careerPitRes.data },
    statcastSeason: {
      hitting: toMetricsObject(hittingSeasonRes.data),
      pitching: toMetricsObject(pitchingSeasonRes.data),
    },
    fielding: fieldingRes.data ?? [],
    baserunning: toMetricsObject(baserunningRes.data),
    pitchArsenal: {
      batter: sortByPitches(arsenalBatRes.data),
      pitcher: sortByPitches(arsenalPitRes.data),
    },
    homeRuns: {
      hit: hrHitRes.data ?? [],
      allowed: hrAllowedRes.data ?? [],
    },
  })
}
