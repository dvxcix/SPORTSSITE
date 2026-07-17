import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { currentSeason } from '@/lib/playerSync'

export const revalidate = 0

type AdminClient = ReturnType<typeof createAdminClient>
type SplitRow = { dims: Record<string, any>; metrics: Record<string, any> }

// Aggregates the many (bat_side, pitch_hand, api_pitch_type, bat_contact_code)
// / (bat_side, pitch_hand, api_pitch_type) dim combinations Savant returns
// per player into one row per (pitch type, opponent hand) — the same shape
// Pitcher Report's own matchup tables use ("VS RHB"/"VS LHB" split by pitch
// type). Which dim IS "opponent hand" flips by role: a batter's own bat_side
// is constant (their own side), so the split axis is the pitcher's hand
// (dims.pitch_hand); a pitcher's own pitch_hand is constant, so the split
// axis is the batter's side (dims.bat_side). Rate metrics are weighted by
// the given count field (e.g. swings_competitive, bbe) rather than naively
// averaged, since a 2-swing sample shouldn't count as much as a 200-swing one.
function aggregateByPitchAndHand(rows: SplitRow[], role: 'batter' | 'pitcher', weightKey: string, rateKeys: string[]) {
  const handDim = role === 'batter' ? 'pitch_hand' : 'bat_side'
  const groups = new Map<string, { pitchType: string; hand: string; weight: number; sums: Record<string, number> }>()

  for (const r of rows) {
    const pitchType = r.dims?.api_pitch_type
    const hand = r.dims?.[handDim]
    if (!pitchType || !hand) continue
    const key = `${pitchType}:${hand}`
    const w = Number(r.metrics?.[weightKey]) || 0
    let g = groups.get(key)
    if (!g) {
      g = { pitchType, hand, weight: 0, sums: Object.fromEntries(rateKeys.map(k => [k, 0])) }
      groups.set(key, g)
    }
    g.weight += w
    for (const k of rateKeys) {
      const v = r.metrics?.[k]
      if (typeof v === 'number' && Number.isFinite(v)) g.sums[k] += v * w
    }
  }

  return Array.from(groups.values()).map(g => ({
    pitchType: g.pitchType, hand: g.hand, weight: g.weight,
    ...Object.fromEntries(rateKeys.map(k => [k, g.weight > 0 ? g.sums[k] / g.weight : null])),
  }))
}

// Same weighting logic, collapsed to one overall number per window — the
// "current form" headline: e.g. season avg bat speed vs the last 6 days'.
function aggregateOverall(rows: SplitRow[], weightKey: string, rateKeys: string[]) {
  let weight = 0
  const sums = Object.fromEntries(rateKeys.map(k => [k, 0]))
  for (const r of rows) {
    const w = Number(r.metrics?.[weightKey]) || 0
    weight += w
    for (const k of rateKeys) {
      const v = r.metrics?.[k]
      if (typeof v === 'number' && Number.isFinite(v)) sums[k] += v * w
    }
  }
  return { weight, ...Object.fromEntries(rateKeys.map(k => [k, weight > 0 ? sums[k] / weight : null])) }
}

const BAT_TRACKING_RATE_KEYS = ['avg_bat_speed', 'hard_swing_rate', 'squared_up_per_swing', 'blast_per_swing', 'whiff_per_swing', 'swing_length']
const BATTED_BALL_RATE_KEYS = ['gb_rate', 'fb_rate', 'ld_rate', 'pu_rate', 'pull_rate', 'straight_rate', 'oppo_rate']

async function fetchSplitCategory(admin: AdminClient, mlbId: number, role: 'batter' | 'pitcher', category: string, windowType: 'season' | 'recency') {
  const { data } = await admin
    .from('player_statcast_splits')
    .select('dims, metrics')
    .eq('mlb_id', mlbId).eq('role', role).eq('category', category).eq('window_type', windowType)
  return (data ?? []) as SplitRow[]
}

// Test/v1 read for the site-owned player data system built up across the
// player-data project — bio, season/career stats, the Savant Tier A season
// snapshot, the pitch-arsenal-stats table (both roles for a two-way
// player), a recency-vs-season bat-tracking/batted-ball comparison (the
// actual competitive-edge feature — "is this player hot right now"), and a
// recent home-run log (as batter, and separately allowed as pitcher).
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

  const isBatter = !!seasonBatRes.data || arsenalBatRes.data && arsenalBatRes.data.length > 0
  const isPitcher = !!seasonPitRes.data || arsenalPitRes.data && arsenalPitRes.data.length > 0

  // Recency-vs-season bat tracking + batted ball — only fetched for
  // whichever role(s) this player actually has, since a pure batter has no
  // pitcher-side splits and vice versa.
  const roles: ('batter' | 'pitcher')[] = [...(isBatter ? ['batter' as const] : []), ...(isPitcher ? ['pitcher' as const] : [])]

  const formTracking: Record<string, any> = {}
  const heatmapByRole: Record<string, { batTracking: any[]; battedBall: any[] }> = {}

  for (const role of roles) {
    const [btSeason, btRecency, bbSeason, bbRecency] = await Promise.all([
      fetchSplitCategory(admin, mlbId, role, 'bat_tracking', 'season'),
      fetchSplitCategory(admin, mlbId, role, 'bat_tracking', 'recency'),
      fetchSplitCategory(admin, mlbId, role, 'batted_ball_splits', 'season'),
      fetchSplitCategory(admin, mlbId, role, 'batted_ball_splits', 'recency'),
    ])

    formTracking[role] = {
      season: aggregateOverall(btSeason, 'swings_competitive', BAT_TRACKING_RATE_KEYS),
      recency: aggregateOverall(btRecency, 'swings_competitive', BAT_TRACKING_RATE_KEYS),
    }
    heatmapByRole[role] = {
      batTracking: aggregateByPitchAndHand(btRecency.length ? btRecency : btSeason, role, 'swings_competitive', BAT_TRACKING_RATE_KEYS),
      battedBall: aggregateByPitchAndHand(bbRecency.length ? bbRecency : bbSeason, role, 'bbe', BATTED_BALL_RATE_KEYS),
    }
  }

  // Enrich the HR logs with the opponent's current team, so their avatar
  // shows a real team logo/color instead of a bare initial — a second,
  // small players lookup rather than joining in SQL (no FK-based join
  // helper available through the JS client for this shape).
  const hrHit = hrHitRes.data ?? []
  const hrAllowed = hrAllowedRes.data ?? []
  const opponentIds = Array.from(new Set([
    ...hrHit.map(r => r.pitcher_id),
    ...hrAllowed.map(r => r.batter_id),
  ].filter(Boolean)))

  let opponentTeams: Record<number, string | null> = {}
  if (opponentIds.length) {
    const { data: opponents } = await admin.from('players').select('mlb_id, current_team_abbr').in('mlb_id', opponentIds)
    opponentTeams = Object.fromEntries((opponents ?? []).map(p => [p.mlb_id, p.current_team_abbr]))
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
    isBatter, isPitcher,
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
    form: formTracking,
    heatmaps: heatmapByRole,
    homeRuns: {
      hit: hrHit.map(r => ({ ...r, opponent_team: opponentTeams[r.pitcher_id] ?? null })),
      allowed: hrAllowed.map(r => ({ ...r, opponent_team: opponentTeams[r.batter_id] ?? null })),
    },
  })
}
