import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { currentSeason } from '@/lib/playerSync'
import { requireTier } from '@/lib/requireTier'

export const revalidate = 0

type AdminClient = ReturnType<typeof createAdminClient>
type SplitRow = { dims: Record<string, any>; metrics: Record<string, any> }

// Same weighting logic used for the "Current Form" headline: one overall
// number per window (e.g. season avg bat speed vs the last 6 days'),
// weighted by the given count field rather than naively averaged, since a
// 2-swing sample shouldn't count as much as a 200-swing one.
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

// League-wide value pools for the Quality of Contact card's heat-coloring —
// that card shows one player's single season number per metric, so unlike
// every other heat-mapped table on this page (which colors relative to the
// other rows already on screen) there's no natural comparison pool without
// pulling every other qualified player's same-season value for that metric.
const QOC_POOL_FIELDS = {
  exit_velocity_barrels: ['exit_velocity_avg', 'barrel_batted_rate', 'hard_hit_percent'],
  expected_stats: ['xba', 'xslg', 'xwoba'],
  home_runs: ['hr_total', 'xhr'],
  statcast_quality_of_contact: ['max_hit_speed', 'max_distance'],
} as const

async function fetchLeaguePool(admin: AdminClient, table: 'player_statcast_hitting_season' | 'player_statcast_pitching_season', season: number): Promise<Record<string, number[]>> {
  const pools: Record<string, number[]> = {}
  await Promise.all(Object.entries(QOC_POOL_FIELDS).map(async ([category, fields]) => {
    const { data } = await admin.from(table).select('metrics').eq('season', season).eq('category', category)
    for (const f of fields) pools[f] = []
    for (const row of data ?? []) {
      for (const f of fields) {
        const v = (row.metrics as any)?.[f]
        if (typeof v === 'number' && Number.isFinite(v)) pools[f].push(v)
      }
    }
  }))
  return pools
}

async function fetchSplitCategory(admin: AdminClient, mlbId: number, role: 'batter' | 'pitcher', category: string, windowType: 'season' | 'recency') {
  const { data } = await admin
    .from('player_statcast_splits')
    .select('dims, metrics')
    .eq('mlb_id', mlbId).eq('role', role).eq('category', category).eq('window_type', windowType)
  return (data ?? []) as SplitRow[]
}

// Categories with the bat_side/pitch_hand/api_pitch_type[/bat_contact_code]
// dim shape — sent to the client as raw rows (both windows, where they
// exist) rather than pre-aggregated server-side, so the page can offer
// real "change what you're viewing" controls (window, which dims to group
// by) instead of one fixed baked-in breakdown.
const DIM_SPLIT_CATEGORIES: { key: string; category: string; roles: ('batter' | 'pitcher')[]; hasRecency: boolean }[] = [
  { key: 'bat_tracking', category: 'bat_tracking', roles: ['batter', 'pitcher'], hasRecency: true },
  { key: 'batted_ball_splits', category: 'batted_ball_splits', roles: ['batter', 'pitcher'], hasRecency: true },
  { key: 'swing_timing_miss_distance', category: 'swing_timing_miss_distance', roles: ['batter', 'pitcher'], hasRecency: true },
  { key: 'swing_path_attack_angle', category: 'swing_path_attack_angle', roles: ['batter'], hasRecency: true },
]

// Test/v1 read for the site-owned player data system built up across the
// player-data project — bio, season/career stats, the Savant Tier A season
// snapshot, the pitch-arsenal-stats table (both roles for a two-way
// player), the recency-vs-season bat-tracking headline ("is this player
// hot right now"), every split-based category as raw customizable rows
// (bat tracking, batted ball, swing timing, swing path, swing/take,
// batting stance), and a recent home-run log (as batter, and separately
// allowed as pitcher).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireTier('basic')
  if (gate.error) return gate.error

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
    swingTakeBatRes, swingTakePitRes,
    stanceSeasonRes, stanceRecencyRes,
    hittingPool, pitchingPool,
  ] = await Promise.all([
    admin.from('players').select('*').eq('mlb_id', mlbId).maybeSingle(),
    // A player traded mid-season gets one row per team PLUS an aggregate
    // row (team_id null, MLB's own season total) — all three share the
    // same (mlb_id, season, game_type), just different team_id, so a bare
    // .maybeSingle() here threw a "multiple rows" error on anyone traded
    // this year and silently fell back to "no stats synced" (confirmed on
    // Derek Hill: PHI split + CWS split + a null-team total, all for 2026).
    // Ordering team_id nulls-first means the season-total row wins when it
    // exists; a never-traded player only ever has the one real-team row.
    admin.from('player_season_stats_batting').select('*').eq('mlb_id', mlbId).eq('season', season).eq('game_type', 'R').order('team_id', { ascending: true, nullsFirst: true }).limit(1).maybeSingle(),
    admin.from('player_season_stats_pitching').select('*').eq('mlb_id', mlbId).eq('season', season).eq('game_type', 'R').order('team_id', { ascending: true, nullsFirst: true }).limit(1).maybeSingle(),
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
    admin.from('player_statcast_splits').select('dims, metrics').eq('mlb_id', mlbId).eq('role', 'batter').eq('category', 'swing_take').eq('window_type', 'season'),
    admin.from('player_statcast_splits').select('dims, metrics').eq('mlb_id', mlbId).eq('role', 'pitcher').eq('category', 'swing_take').eq('window_type', 'season'),
    admin.from('player_statcast_splits').select('dims, metrics').eq('mlb_id', mlbId).eq('role', 'batter').eq('category', 'batting_stance').eq('window_type', 'season'),
    admin.from('player_statcast_splits').select('dims, metrics').eq('mlb_id', mlbId).eq('role', 'batter').eq('category', 'batting_stance').eq('window_type', 'recency'),
    fetchLeaguePool(admin, 'player_statcast_hitting_season', season),
    fetchLeaguePool(admin, 'player_statcast_pitching_season', season),
  ])

  if (!playerRes.data) {
    return NextResponse.json({ error: 'Player not found' }, { status: 404 })
  }

  const isBatter = !!seasonBatRes.data || (arsenalBatRes.data && arsenalBatRes.data.length > 0)
  const isPitcher = !!seasonPitRes.data || (arsenalPitRes.data && arsenalPitRes.data.length > 0)
  const roles: ('batter' | 'pitcher')[] = [...(isBatter ? ['batter' as const] : []), ...(isPitcher ? ['pitcher' as const] : [])]

  // "Current Form" headline (bat tracking only — the one category this
  // fixed at-a-glance comparison is built around; the raw `splits` data
  // below covers the fully customizable view for everything else).
  const formTracking: Record<string, any> = {}
  // Raw split rows per (category, role, window) — aggregation and
  // grouping happens client-side so users can pick which dims to break
  // out by instead of one fixed server-computed shape.
  const splits: Record<string, Record<string, { season: SplitRow[]; recency: SplitRow[] }>> = {}

  for (const role of roles) {
    splits[role] = {}
    for (const cat of DIM_SPLIT_CATEGORIES) {
      if (!cat.roles.includes(role)) continue
      const [seasonRows, recencyRows] = await Promise.all([
        fetchSplitCategory(admin, mlbId, role, cat.category, 'season'),
        cat.hasRecency ? fetchSplitCategory(admin, mlbId, role, cat.category, 'recency') : Promise.resolve([]),
      ])
      splits[role][cat.key] = { season: seasonRows, recency: recencyRows }
      if (cat.key === 'bat_tracking') {
        formTracking[role] = {
          season: aggregateOverall(seasonRows, 'swings_competitive', BAT_TRACKING_RATE_KEYS),
          recency: aggregateOverall(recencyRows, 'swings_competitive', BAT_TRACKING_RATE_KEYS),
        }
      }
    }
  }

  // Swing/Take — dims are {group_type, sub_type}, a different shape than
  // the pitch/hand/contact-type categories above (season-only, no recency
  // window exists for this leaderboard). Sent raw so the client can offer
  // the same Group Type + Sub Type pickers the real Savant page has.
  const swingTake: Record<string, SplitRow[]> = {}
  if (isBatter) swingTake.batter = (swingTakeBatRes.data ?? []) as SplitRow[]
  if (isPitcher) swingTake.pitcher = (swingTakePitRes.data ?? []) as SplitRow[]

  // Batting Stance — batter-only, dims are just {pitch_hand: 'All'|'L'|'R'}.
  const battingStance = isBatter
    ? { season: (stanceSeasonRes.data ?? []) as SplitRow[], recency: (stanceRecencyRes.data ?? []) as SplitRow[] }
    : null

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
    splits,
    swingTake,
    battingStance,
    homeRuns: {
      hit: hrHit.map(r => ({ ...r, opponent_team: opponentTeams[r.pitcher_id] ?? null })),
      allowed: hrAllowed.map(r => ({ ...r, opponent_team: opponentTeams[r.batter_id] ?? null })),
    },
    leaguePools: { hitting: hittingPool, pitching: pitchingPool },
  })
}
