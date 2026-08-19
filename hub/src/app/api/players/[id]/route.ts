import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
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

// These responses are served through an admin client after a tier check.
// Keep their projection explicit so a future private/internal column cannot
// silently become part of the public player API.
const PLAYER_COLUMNS = 'mlb_id,full_name,first_name,last_name,birth_date,height,weight,bat_side,pitch_hand,primary_position,current_team_id,current_team_abbr,mlb_debut,active,last_synced_at'
const SEASON_BATTING_COLUMNS = 'id,mlb_id,season,game_type,team_id,team_abbr,games_played,at_bats,hits,home_runs,rbi,runs,stolen_bases,walks,strikeouts,avg,obp,slg,ops,last_synced_at'
const SEASON_PITCHING_COLUMNS = 'id,mlb_id,season,game_type,team_id,team_abbr,games_played,games_started,wins,losses,saves,innings_pitched,strikeouts,walks,earned_runs,home_runs_allowed,era,whip,last_synced_at'
const CAREER_BATTING_COLUMNS = 'mlb_id,games_played,at_bats,hits,home_runs,rbi,runs,stolen_bases,walks,strikeouts,avg,obp,slg,ops,last_synced_at'
const CAREER_PITCHING_COLUMNS = 'mlb_id,games_played,games_started,wins,losses,saves,innings_pitched,strikeouts,walks,earned_runs,home_runs_allowed,era,whip,last_synced_at'
const HOME_RUN_COLUMNS = 'game_pk,season,game_date,batter_id,batter_name,pitcher_id,pitcher_name,result,exit_velocity,launch_angle,hr_distance,hr_cat,hr_type,parks,detail_source'
const CANONICAL_HOME_RUN_COLUMNS = 'game_pk,season,game_date,batter_id,pitcher_id,launch_speed,launch_angle,hit_distance,at_bat_index,pitch_number'

type CanonicalHomeRunRow = {
  game_pk: string | number
  season: number | null
  game_date: string
  batter_id: number
  pitcher_id: number
  launch_speed: number | null
  launch_angle: number | null
  hit_distance: number | null
  at_bat_index: number | null
  pitch_number: number | null
}

type HomeRunDetailRow = {
  game_pk: string | number
  season: number | null
  game_date: string
  batter_id: number
  batter_name: string | null
  pitcher_id: number
  pitcher_name: string | null
  result: string | null
  exit_velocity: number | null
  launch_angle: number | null
  hr_distance: number | null
  hr_cat: string | null
  hr_type: string | null
  parks: Record<string, boolean> | null
  detail_source: 'savant' | 'canonical_pitch_log'
}

function measurementsMatch(left: number | null, right: number | null, tolerance: number) {
  return left != null && right != null && Math.abs(Number(left) - Number(right)) <= tolerance
}

/**
 * `player_pitch_log` is the canonical event ledger. Savant's dedicated
 * home-run feed has richer park/category data, but it does not publish every
 * real MLB home run. Provenance-marked canonical fallback rows close that
 * coverage gap without pretending source-only park projections exist.
 */
function enrichCanonicalHomeRuns(
  rows: CanonicalHomeRunRow[],
  details: HomeRunDetailRow[],
  playerNames: Record<number, string>,
) {
  const usedDetails = new Set<number>()

  return rows.map(row => {
    const sameParticipants = details
      .map((detail, index) => ({ detail, index }))
      .filter(({ detail, index }) => (
        !usedDetails.has(index)
        && Number(detail.game_pk) === Number(row.game_pk)
        && Number(detail.batter_id) === Number(row.batter_id)
        && Number(detail.pitcher_id) === Number(row.pitcher_id)
      ))

    let matched = sameParticipants.find(({ detail }) => {
      const agreements = [
        measurementsMatch(row.launch_speed, detail.exit_velocity, 0.25),
        measurementsMatch(row.launch_angle, detail.launch_angle, 0.25),
        measurementsMatch(row.hit_distance, detail.hr_distance, 2),
      ].filter(Boolean).length
      return agreements >= 2
    })

    // Some source rows omit one or more measurements. A participant-level
    // fallback is safe only when the game has exactly one unmatched HR for
    // this batter/pitcher pair; multi-HR games must remain unambiguously
    // matched or simply render without optional enrichment.
    if (!matched && sameParticipants.length === 1) matched = sameParticipants[0]
    if (matched) usedDetails.add(matched.index)
    const detail = matched?.detail

    return {
      game_pk: row.game_pk,
      season: row.season,
      game_date: row.game_date,
      batter_id: row.batter_id,
      batter_name: detail?.batter_name ?? playerNames[row.batter_id] ?? `Player ${row.batter_id}`,
      pitcher_id: row.pitcher_id,
      pitcher_name: detail?.pitcher_name ?? playerNames[row.pitcher_id] ?? `Player ${row.pitcher_id}`,
      result: 'home_run',
      exit_velocity: row.launch_speed,
      launch_angle: row.launch_angle,
      hr_distance: row.hit_distance,
      hr_cat: detail?.detail_source === 'savant' ? detail.hr_cat : null,
      hr_type: detail?.hr_type ?? null,
      parks: detail?.detail_source === 'savant' ? detail.parks : null,
      at_bat_index: row.at_bat_index,
      pitch_number: row.pitch_number,
      enrichment_available: detail?.detail_source === 'savant',
    }
  })
}

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

// The exact same league-wide pool for EVERY player page — it only depends
// on `season`, not on which player is being viewed — so this was being
// rescanned (2 full-table category scans) on every single player pageview.
// Cached once per season instead: one real computation serves every player
// page on the site until the next cache window, not one per pageview.
// Source tables (player_statcast_*_season) are only ever written by the
// once-daily savant-sync-tier-a cron (10:00 UTC), so an hour-long window
// loses zero real freshness.
const getCachedLeaguePools = unstable_cache(
  async (season: number) => {
    const admin = createAdminClient()
    const [hitting, pitching] = await Promise.all([
      fetchLeaguePool(admin, 'player_statcast_hitting_season', season),
      fetchLeaguePool(admin, 'player_statcast_pitching_season', season),
    ])
    return { hitting, pitching }
  },
  ['player-league-pools'],
  { revalidate: 3600 }
)

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

// Everything below is the same response for every caller who passes the
// tier gate — no per-user/per-tier field shaping — so it's safe to cache
// as a flat function of (mlbId, season). The fastest-changing real inputs
// here are the bio/season/career-stats crons (mlb-sync-bio/season-stats/
// career-stats, all every 15 min); everything else (Statcast splits, HR
// log, arsenal) is the once-daily 10:00 UTC savant-sync-* batch. A 10-min
// window stays safely inside the 15-min floor with margin, while cutting
// out this entire fan-out (18 parallel queries) being repeated for every
// single pageview of a popular player.
async function fetchPlayerData(mlbId: number, season: number) {
  const admin = createAdminClient()

  const [
    playerRes,
    seasonBatRes, seasonPitRes,
    careerBatRes, careerPitRes,
    hittingSeasonRes, pitchingSeasonRes,
    fieldingRes, baserunningRes,
    arsenalBatRes, arsenalPitRes,
    canonicalHrHitRes, canonicalHrAllowedRes,
    hrHitDetailRes, hrAllowedDetailRes,
    swingTakeBatRes, swingTakePitRes,
    stanceSeasonRes, stanceRecencyRes,
  ] = await Promise.all([
    admin.from('players').select(PLAYER_COLUMNS).eq('mlb_id', mlbId).maybeSingle(),
    // A player traded mid-season gets one row per team PLUS an aggregate
    // row (team_id null, MLB's own season total) — all three share the
    // same (mlb_id, season, game_type), just different team_id, so a bare
    // .maybeSingle() here threw a "multiple rows" error on anyone traded
    // this year and silently fell back to "no stats synced" (confirmed on
    // Derek Hill: PHI split + CWS split + a null-team total, all for 2026).
    // Ordering team_id nulls-first means the season-total row wins when it
    // exists; a never-traded player only ever has the one real-team row.
    admin.from('player_season_stats_batting').select(SEASON_BATTING_COLUMNS).eq('mlb_id', mlbId).eq('season', season).eq('game_type', 'R').order('team_id', { ascending: true, nullsFirst: true }).limit(1).maybeSingle(),
    admin.from('player_season_stats_pitching').select(SEASON_PITCHING_COLUMNS).eq('mlb_id', mlbId).eq('season', season).eq('game_type', 'R').order('team_id', { ascending: true, nullsFirst: true }).limit(1).maybeSingle(),
    admin.from('player_career_stats_batting').select(CAREER_BATTING_COLUMNS).eq('mlb_id', mlbId).maybeSingle(),
    admin.from('player_career_stats_pitching').select(CAREER_PITCHING_COLUMNS).eq('mlb_id', mlbId).maybeSingle(),
    admin.from('player_statcast_hitting_season').select('category, metrics').eq('mlb_id', mlbId).eq('season', season),
    admin.from('player_statcast_pitching_season').select('category, metrics').eq('mlb_id', mlbId).eq('season', season),
    admin.from('player_fielding_season').select('position, category, metrics').eq('mlb_id', mlbId).eq('season', season),
    admin.from('player_baserunning_season').select('category, metrics').eq('mlb_id', mlbId).eq('season', season),
    admin.from('player_statcast_splits').select('dims, metrics').eq('mlb_id', mlbId).eq('role', 'batter').eq('category', 'pitch_arsenal_stats').eq('window_type', 'season'),
    admin.from('player_statcast_splits').select('dims, metrics').eq('mlb_id', mlbId).eq('role', 'pitcher').eq('category', 'pitch_arsenal_stats').eq('window_type', 'season'),
    admin.from('player_pitch_log').select(CANONICAL_HOME_RUN_COLUMNS).eq('batter_id', mlbId).eq('is_home_run', true).order('game_date', { ascending: false }).order('at_bat_index', { ascending: false }).limit(15),
    admin.from('player_pitch_log').select(CANONICAL_HOME_RUN_COLUMNS).eq('pitcher_id', mlbId).eq('is_home_run', true).order('game_date', { ascending: false }).order('at_bat_index', { ascending: false }).limit(15),
    admin.from('player_home_run_events').select(HOME_RUN_COLUMNS).eq('batter_id', mlbId).eq('result', 'home_run').order('game_date', { ascending: false }).limit(30),
    admin.from('player_home_run_events').select(HOME_RUN_COLUMNS).eq('pitcher_id', mlbId).eq('result', 'home_run').order('game_date', { ascending: false }).limit(30),
    admin.from('player_statcast_splits').select('dims, metrics').eq('mlb_id', mlbId).eq('role', 'batter').eq('category', 'swing_take').eq('window_type', 'season'),
    admin.from('player_statcast_splits').select('dims, metrics').eq('mlb_id', mlbId).eq('role', 'pitcher').eq('category', 'swing_take').eq('window_type', 'season'),
    admin.from('player_statcast_splits').select('dims, metrics').eq('mlb_id', mlbId).eq('role', 'batter').eq('category', 'batting_stance').eq('window_type', 'season'),
    admin.from('player_statcast_splits').select('dims, metrics').eq('mlb_id', mlbId).eq('role', 'batter').eq('category', 'batting_stance').eq('window_type', 'recency'),
  ])

  if (!playerRes.data) return null

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
  const canonicalHrHit = (canonicalHrHitRes.data ?? []) as CanonicalHomeRunRow[]
  const canonicalHrAllowed = (canonicalHrAllowedRes.data ?? []) as CanonicalHomeRunRow[]
  const opponentIds = Array.from(new Set([
    mlbId,
    ...canonicalHrHit.map(r => r.pitcher_id),
    ...canonicalHrAllowed.map(r => r.batter_id),
  ].filter(Boolean)))

  let opponentTeams: Record<number, string | null> = {}
  let playerNames: Record<number, string> = { [mlbId]: playerRes.data.full_name }
  if (opponentIds.length) {
    const { data: opponents } = await admin.from('players').select('mlb_id, full_name, current_team_abbr').in('mlb_id', opponentIds)
    opponentTeams = Object.fromEntries((opponents ?? []).map(p => [p.mlb_id, p.current_team_abbr]))
    playerNames = {
      ...playerNames,
      ...Object.fromEntries((opponents ?? []).map(p => [p.mlb_id, p.full_name ?? `Player ${p.mlb_id}`])),
    }
  }

  const hrHit = enrichCanonicalHomeRuns(canonicalHrHit, (hrHitDetailRes.data ?? []) as HomeRunDetailRow[], playerNames)
  const hrAllowed = enrichCanonicalHomeRuns(canonicalHrAllowed, (hrAllowedDetailRes.data ?? []) as HomeRunDetailRow[], playerNames)

  const toMetricsObject = (rows: { category: string; metrics: unknown }[] | null) =>
    Object.fromEntries((rows ?? []).map(r => [r.category, r.metrics]))

  const sortByPitches = (rows: { dims: unknown; metrics: unknown }[] | null) =>
    (rows ?? [])
      .map(r => ({ pitchType: (r.dims as any)?.pitch_type as string, ...(r.metrics as any) }))
      .sort((a, b) => (b.pitches ?? 0) - (a.pitches ?? 0))

  return {
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
  }
}

const getCachedPlayerData = unstable_cache(fetchPlayerData, ['player-data'], { revalidate: 600 })

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
  if (!Number.isSafeInteger(mlbId) || mlbId <= 0 || mlbId > 10_000_000) {
    return NextResponse.json({ error: 'Invalid player id' }, { status: 400 })
  }

  const season = currentSeason()

  const [playerData, leaguePools] = await Promise.all([
    getCachedPlayerData(mlbId, season),
    getCachedLeaguePools(season),
  ])

  if (!playerData) {
    return NextResponse.json({ error: 'Player not found' }, { status: 404 })
  }

  return NextResponse.json({
    ...playerData,
    leaguePools,
  })
}
