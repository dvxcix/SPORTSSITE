import { gunzipSync } from 'zlib'
import type { createAdminClient } from '@/lib/supabase/admin'

// Free NFL data foundation — nflverse (nflreadr's underlying source) publishes
// static CSV/parquet files as GitHub release assets, refreshed nightly during
// the season, rather than a queryable live API. Unlike MLB's per-player
// playerSync.ts job queue (mlb-sync-bio etc., one HTTP call per player), each
// of these is a single bulk file covering every team/player/game at once —
// no queue/claim machinery needed, just fetch → parse → chunked upsert.
const RELEASE_BASE = 'https://github.com/nflverse/nflverse-data/releases/download'

// Same minimal-but-correct CSV parser as savantSync.ts's parseCsv — handles
// quoted fields containing commas/escaped quotes, which these files do use
// (e.g. team_logo_wikipedia URLs, player college names with commas). Kept as
// its own copy rather than importing savantSync.ts's version so this file
// has no dependency on baseball-specific code.
function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.length > 0)
  if (!lines.length) return []
  const parseLine = (line: string): string[] => {
    const fields: string[] = []
    let cur = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++ } else { inQuotes = false }
        } else cur += ch
      } else {
        if (ch === '"') inQuotes = true
        else if (ch === ',') { fields.push(cur); cur = '' }
        else cur += ch
      }
    }
    fields.push(cur)
    return fields
  }
  const header = parseLine(lines[0])
  return lines.slice(1).map(line => {
    const values = parseLine(line)
    const row: Record<string, string> = {}
    header.forEach((h, i) => { row[h] = values[i] ?? '' })
    return row
  })
}

async function fetchNflverseCsv(url: string): Promise<Record<string, string>[]> {
  const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(30_000) })
  const text = await res.text()
  if (!res.ok) throw new Error(`nflverse CSV request failed (${res.status})`)
  return parseCsv(text)
}

// player_stats.csv is plain text, but the combined NGS files (ngs_passing/
// receiving/rushing.csv.gz — the ones that actually stay current, unlike
// the stale/incomplete per-season ngs_YYYY_*.csv.gz assets) are gzipped.
// Node's built-in zlib covers this with no new dependency.
export class NflverseAssetError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly assetUrl: string,
  ) {
    super(message)
    this.name = 'NflverseAssetError'
  }
}

async function fetchNflverseCsvGz(url: string): Promise<Record<string, string>[]> {
  const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(30_000) })
  if (!res.ok) {
    throw new NflverseAssetError(`nflverse CSV.gz request failed (${res.status})`, res.status, url)
  }
  const buf = Buffer.from(await res.arrayBuffer())
  const text = gunzipSync(buf).toString('utf8')
  return parseCsv(text)
}

const s = (v: string | undefined): string | null => (v != null && v !== '' ? v : null)
const n = (v: string | undefined): number | null => {
  if (v == null || v === '') return null
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}
const b = (v: string | undefined): boolean | null => {
  if (v == null || v === '') return null
  return v === '1' || v.toLowerCase() === 'true'
}

// Real bug, confirmed live (2026-07-28): player_stats.csv has at least one
// genuine duplicate (player_id, season, week, season_type) combo — Postgres
// upsert rejects a whole batch outright ("ON CONFLICT DO UPDATE command
// cannot affect row a second time") the moment two rows in the SAME chunk
// share a conflict key, unlike a plain insert which would just error per-row.
// Keeping the LAST occurrence of each key (nflverse's own row order, so a
// later row for the same key is presumably a correction) sidesteps this for
// every composite-keyed sync here, not just player_stats — cheap enough to
// apply everywhere rather than debug field-by-field which source file has
// the duplicate this week.
function dedupeByKey<T extends Record<string, unknown>>(rows: T[], keyFields: (keyof T)[]): T[] {
  const byKey = new Map<string, T>()
  for (const row of rows) byKey.set(keyFields.map(f => String(row[f])).join('|'), row)
  return Array.from(byKey.values())
}

async function upsertChunked(
  admin: ReturnType<typeof createAdminClient>,
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string,
): Promise<number> {
  const CHUNK = 500
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await admin.from(table).upsert(rows.slice(i, i + CHUNK), { onConflict })
    if (error) throw error
  }
  return rows.length
}

// 32 rows, effectively static reference data (colors/logos/division rarely
// change) — safe to fully re-upsert every run.
export async function syncNflTeams(admin: ReturnType<typeof createAdminClient>): Promise<number> {
  const rows = await fetchNflverseCsv(`${RELEASE_BASE}/teams/teams_colors_logos.csv`)
  const mapped = rows.map(r => ({
    team_abbr: r.team_abbr,
    team_name: r.team_name,
    team_id: s(r.team_id),
    team_nick: s(r.team_nick),
    team_conf: s(r.team_conf),
    team_division: s(r.team_division),
    team_color: s(r.team_color),
    team_color2: s(r.team_color2),
    team_color3: s(r.team_color3),
    team_color4: s(r.team_color4),
    team_logo_espn: s(r.team_logo_espn),
    team_logo_wikipedia: s(r.team_logo_wikipedia),
    team_wordmark: s(r.team_wordmark),
    team_logo_squared: s(r.team_logo_squared),
    updated_at: new Date().toISOString(),
  })).filter(r => r.team_abbr)
  return upsertChunked(admin, 'nfl_teams', mapped, 'team_abbr')
}

// players.csv covers every player in nflverse's history (~25k+ rows) —
// still a single file, just a bigger chunked upsert. gsis_id is the stable
// primary key nflverse uses everywhere else (pbp, rosters, NGS), and the
// file already includes the espn_id/pfr_id/nfl_id crosswalk directly, so no
// separate load_ff_playerids() fetch is needed for basic cross-referencing.
export async function syncNflPlayers(admin: ReturnType<typeof createAdminClient>): Promise<number> {
  const rows = await fetchNflverseCsv(`${RELEASE_BASE}/players/players.csv`)
  const mapped = rows.map(r => ({
    gsis_id: r.gsis_id,
    display_name: r.display_name,
    first_name: s(r.first_name),
    last_name: s(r.last_name),
    short_name: s(r.short_name),
    football_name: s(r.football_name),
    position_group: s(r.position_group),
    position: s(r.position),
    height: n(r.height),
    weight: n(r.weight),
    headshot: s(r.headshot),
    college_name: s(r.college_name),
    jersey_number: n(r.jersey_number),
    birth_date: s(r.birth_date),
    rookie_season: n(r.rookie_season),
    last_season: n(r.last_season),
    latest_team: s(r.latest_team),
    status: s(r.status),
    years_of_experience: n(r.years_of_experience),
    draft_year: n(r.draft_year),
    draft_round: n(r.draft_round),
    draft_pick: n(r.draft_pick),
    draft_team: s(r.draft_team),
    espn_id: s(r.espn_id),
    pfr_id: s(r.pfr_id),
    nfl_id: s(r.nfl_id),
    updated_at: new Date().toISOString(),
  })).filter(r => r.gsis_id)
  return upsertChunked(admin, 'nfl_players', mapped, 'gsis_id')
}

// games.csv covers every game back to 1999 — a full historical backfill is
// one fetch; in-season, re-running this same sync picks up final
// scores/results as they're published (nflverse republishes the whole file
// nightly, so this cron just re-upserts on top of whatever's already there,
// same self-healing shape as the Statcast precompute crons' PAST_DAYS
// reprocessing). Deliberately omits nflverse's own moneyline/spread/total
// columns — this site already has its own real-time odds pipeline
// (FanDuel/BetMGM/Pikkit scrapers), and a stale historical closing line from
// a third-party CSV would only ever be noise next to that.
export async function syncNflSchedule(admin: ReturnType<typeof createAdminClient>, sinceSeason?: number): Promise<number> {
  const rows = await fetchNflverseCsv(`${RELEASE_BASE}/schedules/games.csv`)
  const mapped = rows
    .filter(r => sinceSeason == null || Number(r.season) >= sinceSeason)
    .map(r => ({
      game_id: r.game_id,
      season: n(r.season),
      game_type: s(r.game_type),
      week: n(r.week),
      gameday: s(r.gameday),
      weekday: s(r.weekday),
      gametime: s(r.gametime),
      away_team: s(r.away_team),
      away_score: n(r.away_score),
      home_team: s(r.home_team),
      home_score: n(r.home_score),
      location: s(r.location),
      result: n(r.result),
      total: n(r.total),
      overtime: b(r.overtime),
      div_game: b(r.div_game),
      roof: s(r.roof),
      surface: s(r.surface),
      temp: n(r.temp),
      wind: n(r.wind),
      away_qb_id: s(r.away_qb_id),
      home_qb_id: s(r.home_qb_id),
      away_qb_name: s(r.away_qb_name),
      home_qb_name: s(r.home_qb_name),
      away_coach: s(r.away_coach),
      home_coach: s(r.home_coach),
      referee: s(r.referee),
      stadium_id: s(r.stadium_id),
      stadium: s(r.stadium),
      espn_game_id: s(r.espn),
      updated_at: new Date().toISOString(),
    }))
    .filter(r => r.game_id && r.season != null)
  return upsertChunked(admin, 'nfl_schedule', mapped, 'game_id')
}

// player_stats.csv is the combined all-seasons box-score file (~134k rows,
// one row per player per week) — nflverse's own aggregation of raw PBP
// into passing/rushing/receiving/fantasy totals, exactly the "season stat
// line + per-game log" a player page needs, with no PBP aggregation work
// of our own required. Real gap, confirmed live (2026-07-28): this combined
// file currently only goes through the 2024 season — nflverse hasn't
// published a 2025 file under this release yet (unlike nextgen_stats below,
// which IS current through the 2025 postseason) — but the sync re-fetches
// the same URL every run, so whenever nflverse catches up, the very next
// cron run picks up 2025+ with no code change needed here.
export async function syncNflPlayerStats(admin: ReturnType<typeof createAdminClient>, sinceSeason?: number): Promise<number> {
  const rows = await fetchNflverseCsv(`${RELEASE_BASE}/player_stats/player_stats.csv`)
  const mapped = rows
    .filter(r => sinceSeason == null || Number(r.season) >= sinceSeason)
    .map(r => ({
      player_id: r.player_id,
      season: n(r.season),
      week: n(r.week),
      season_type: s(r.season_type),
      player_name: s(r.player_name),
      player_display_name: s(r.player_display_name),
      position: s(r.position),
      position_group: s(r.position_group),
      headshot_url: s(r.headshot_url),
      recent_team: s(r.recent_team),
      opponent_team: s(r.opponent_team),
      completions: n(r.completions), attempts: n(r.attempts), passing_yards: n(r.passing_yards),
      passing_tds: n(r.passing_tds), interceptions: n(r.interceptions),
      sacks: n(r.sacks), sack_yards: n(r.sack_yards), sack_fumbles: n(r.sack_fumbles), sack_fumbles_lost: n(r.sack_fumbles_lost),
      passing_air_yards: n(r.passing_air_yards), passing_yards_after_catch: n(r.passing_yards_after_catch),
      passing_first_downs: n(r.passing_first_downs), passing_epa: n(r.passing_epa),
      passing_2pt_conversions: n(r.passing_2pt_conversions), pacr: n(r.pacr), dakota: n(r.dakota),
      carries: n(r.carries), rushing_yards: n(r.rushing_yards), rushing_tds: n(r.rushing_tds),
      rushing_fumbles: n(r.rushing_fumbles), rushing_fumbles_lost: n(r.rushing_fumbles_lost),
      rushing_first_downs: n(r.rushing_first_downs), rushing_epa: n(r.rushing_epa), rushing_2pt_conversions: n(r.rushing_2pt_conversions),
      receptions: n(r.receptions), targets: n(r.targets), receiving_yards: n(r.receiving_yards), receiving_tds: n(r.receiving_tds),
      receiving_fumbles: n(r.receiving_fumbles), receiving_fumbles_lost: n(r.receiving_fumbles_lost),
      receiving_air_yards: n(r.receiving_air_yards), receiving_yards_after_catch: n(r.receiving_yards_after_catch),
      receiving_first_downs: n(r.receiving_first_downs), receiving_epa: n(r.receiving_epa),
      receiving_2pt_conversions: n(r.receiving_2pt_conversions), racr: n(r.racr),
      target_share: n(r.target_share), air_yards_share: n(r.air_yards_share), wopr: n(r.wopr),
      special_teams_tds: n(r.special_teams_tds), fantasy_points: n(r.fantasy_points), fantasy_points_ppr: n(r.fantasy_points_ppr),
      updated_at: new Date().toISOString(),
    }))
    .filter(r => r.player_id && r.season != null && r.week != null && r.season_type)
  return upsertChunked(admin, 'nfl_player_stats', dedupeByKey(mapped, ['player_id', 'season', 'week', 'season_type']), 'player_id,season,week,season_type')
}

// The combined ngs_passing/receiving/rushing.csv.gz files (unlike the stale
// per-season ngs_YYYY_*.csv.gz assets, which stop after a couple of weeks
// each season) are nflverse's actively-maintained source, confirmed live
// running through the 2025 postseason. week=0 is nflverse's own convention
// for "full season aggregate" row, alongside individual weeks 1-18/POST —
// both are kept as-is rather than treated specially here, since which one
// a caller wants ("season" vs "recent") is a query-time concern, not a
// sync-time one.
export async function syncNflNgsPassing(admin: ReturnType<typeof createAdminClient>): Promise<number> {
  const rows = await fetchNflverseCsvGz(`${RELEASE_BASE}/nextgen_stats/ngs_passing.csv.gz`)
  const mapped = rows.map(r => ({
    player_gsis_id: r.player_gsis_id, season: n(r.season), week: n(r.week), season_type: s(r.season_type),
    player_display_name: s(r.player_display_name), player_first_name: s(r.player_first_name), player_last_name: s(r.player_last_name),
    player_short_name: s(r.player_short_name), player_position: s(r.player_position), team_abbr: s(r.team_abbr),
    player_jersey_number: n(r.player_jersey_number),
    avg_time_to_throw: n(r.avg_time_to_throw), avg_completed_air_yards: n(r.avg_completed_air_yards),
    avg_intended_air_yards: n(r.avg_intended_air_yards), avg_air_yards_differential: n(r.avg_air_yards_differential),
    aggressiveness: n(r.aggressiveness), max_completed_air_distance: n(r.max_completed_air_distance),
    avg_air_yards_to_sticks: n(r.avg_air_yards_to_sticks), attempts: n(r.attempts), pass_yards: n(r.pass_yards),
    pass_touchdowns: n(r.pass_touchdowns), interceptions: n(r.interceptions), passer_rating: n(r.passer_rating),
    completions: n(r.completions), completion_percentage: n(r.completion_percentage),
    expected_completion_percentage: n(r.expected_completion_percentage),
    completion_percentage_above_expectation: n(r.completion_percentage_above_expectation),
    avg_air_distance: n(r.avg_air_distance), max_air_distance: n(r.max_air_distance),
    updated_at: new Date().toISOString(),
  })).filter(r => r.player_gsis_id && r.season != null && r.week != null && r.season_type)
  return upsertChunked(admin, 'nfl_ngs_passing', dedupeByKey(mapped, ['player_gsis_id', 'season', 'week', 'season_type']), 'player_gsis_id,season,week,season_type')
}

export async function syncNflNgsReceiving(admin: ReturnType<typeof createAdminClient>): Promise<number> {
  const rows = await fetchNflverseCsvGz(`${RELEASE_BASE}/nextgen_stats/ngs_receiving.csv.gz`)
  const mapped = rows.map(r => ({
    player_gsis_id: r.player_gsis_id, season: n(r.season), week: n(r.week), season_type: s(r.season_type),
    player_display_name: s(r.player_display_name), player_first_name: s(r.player_first_name), player_last_name: s(r.player_last_name),
    player_short_name: s(r.player_short_name), player_position: s(r.player_position), team_abbr: s(r.team_abbr),
    player_jersey_number: n(r.player_jersey_number),
    avg_cushion: n(r.avg_cushion), avg_separation: n(r.avg_separation), avg_intended_air_yards: n(r.avg_intended_air_yards),
    percent_share_of_intended_air_yards: n(r.percent_share_of_intended_air_yards),
    receptions: n(r.receptions), targets: n(r.targets), catch_percentage: n(r.catch_percentage),
    yards: n(r.yards), rec_touchdowns: n(r.rec_touchdowns), avg_yac: n(r.avg_yac),
    avg_expected_yac: n(r.avg_expected_yac), avg_yac_above_expectation: n(r.avg_yac_above_expectation),
    updated_at: new Date().toISOString(),
  })).filter(r => r.player_gsis_id && r.season != null && r.week != null && r.season_type)
  return upsertChunked(admin, 'nfl_ngs_receiving', dedupeByKey(mapped, ['player_gsis_id', 'season', 'week', 'season_type']), 'player_gsis_id,season,week,season_type')
}

export async function syncNflNgsRushing(admin: ReturnType<typeof createAdminClient>): Promise<number> {
  const rows = await fetchNflverseCsvGz(`${RELEASE_BASE}/nextgen_stats/ngs_rushing.csv.gz`)
  const mapped = rows.map(r => ({
    player_gsis_id: r.player_gsis_id, season: n(r.season), week: n(r.week), season_type: s(r.season_type),
    player_display_name: s(r.player_display_name), player_first_name: s(r.player_first_name), player_last_name: s(r.player_last_name),
    player_short_name: s(r.player_short_name), player_position: s(r.player_position), team_abbr: s(r.team_abbr),
    player_jersey_number: n(r.player_jersey_number),
    efficiency: n(r.efficiency), percent_attempts_gte_eight_defenders: n(r.percent_attempts_gte_eight_defenders),
    avg_time_to_los: n(r.avg_time_to_los), rush_attempts: n(r.rush_attempts), rush_yards: n(r.rush_yards),
    avg_rush_yards: n(r.avg_rush_yards), rush_touchdowns: n(r.rush_touchdowns),
    expected_rush_yards: n(r.expected_rush_yards), rush_yards_over_expected: n(r.rush_yards_over_expected),
    rush_yards_over_expected_per_att: n(r.rush_yards_over_expected_per_att), rush_pct_over_expected: n(r.rush_pct_over_expected),
    updated_at: new Date().toISOString(),
  })).filter(r => r.player_gsis_id && r.season != null && r.week != null && r.season_type)
  return upsertChunked(admin, 'nfl_ngs_rushing', dedupeByKey(mapped, ['player_gsis_id', 'season', 'week', 'season_type']), 'player_gsis_id,season,week,season_type')
}

// Raw play-by-play — unlike every sync above (one combined all-seasons file),
// nflverse only publishes pbp as one release asset PER SEASON (~372 columns,
// ~49k rows, ~98MB uncompressed each) under its own 'pbp' release tag, not
// under RELEASE_BASE's other per-category tags. Real gap confirmed live
// (2026-07-28): the field list is enormous and most of it (lateral-play
// tracking, individual tackle-assist attribution, WP curves for exotic bet
// markets) is never going to matter for player-prop research. Rather than
// hand-maintain 372 typed columns (or worse, silently drop the long tail),
// this keeps ~100 typed columns for everything prop research actually
// touches — situation (down/distance/red zone), efficiency (EPA/WPA/CPOE/
// xyac/pass_oe), and the passer/rusher/receiver id/name/yardage fields any
// per-player split needs — and stashes the ENTIRE untouched row in `raw`
// jsonb, so nothing is actually lost even though it isn't individually
// indexed.
const PBP_NUM_FIELDS = [
  'yardline_100', 'drive', 'quarter_seconds_remaining', 'half_seconds_remaining', 'game_seconds_remaining',
  'yards_gained', 'air_yards', 'yards_after_catch', 'penalty_yards',
  'ep', 'epa', 'wp', 'wpa', 'def_wp', 'home_wp', 'away_wp', 'qb_epa', 'air_epa', 'yac_epa', 'comp_air_epa', 'comp_yac_epa',
  'cp', 'cpoe', 'xyac_epa', 'xyac_mean_yardage', 'xyac_median_yardage', 'xyac_success', 'xyac_fd', 'xpass', 'pass_oe',
  'passing_yards', 'receiving_yards', 'rushing_yards',
  'result', 'total', 'spread_line', 'total_line', 'temp', 'wind', 'kick_distance',
  'fixed_drive', 'drive_play_count', 'drive_first_downs',
] as const
const PBP_INT_FIELDS = [
  'season', 'week', 'qtr', 'down', 'ydstogo', 'total_home_score', 'total_away_score',
  'posteam_score', 'defteam_score', 'score_differential', 'home_score', 'away_score',
] as const
const PBP_BOOL_FIELDS = [
  'goal_to_go', 'shotgun', 'no_huddle', 'qb_dropback', 'qb_kneel', 'qb_spike', 'qb_scramble',
  'sack', 'complete_pass', 'incomplete_pass', 'interception', 'fumble', 'fumble_lost',
  'touchdown', 'pass_touchdown', 'rush_touchdown', 'first_down', 'first_down_rush', 'first_down_pass', 'first_down_penalty',
  'third_down_converted', 'third_down_failed', 'fourth_down_converted', 'fourth_down_failed', 'penalty', 'safety', 'touchback',
  'div_game', 'success', 'rush_attempt', 'pass_attempt', 'field_goal_attempt', 'punt_attempt',
  'extra_point_attempt', 'two_point_attempt', 'drive_inside20', 'drive_ended_with_score',
  'special_teams_play', 'aborted_play', 'play_deleted',
] as const
const PBP_STR_FIELDS = [
  'old_game_id', 'season_type', 'home_team', 'away_team', 'posteam', 'posteam_type', 'defteam', 'side_of_field',
  'game_half', 'play_type', 'play_type_nfl', 'pass_length', 'pass_location', 'run_location', 'run_gap',
  'penalty_team', 'penalty_type', 'roof', 'surface', 'location', 'stadium',
  'field_goal_result', 'extra_point_result', 'two_point_conv_result', 'fixed_drive_result', 'drive_time_of_possession', 'st_play_type',
  'passer_player_id', 'passer_player_name', 'receiver_player_id', 'receiver_player_name', 'rusher_player_id', 'rusher_player_name',
  'interception_player_id', 'interception_player_name', 'sack_player_id', 'sack_player_name',
  'fumble_recovery_1_player_id', 'fumble_recovery_1_player_name',
  'punt_returner_player_id', 'punt_returner_player_name', 'kickoff_returner_player_id', 'kickoff_returner_player_name',
  'kicker_player_id', 'kicker_player_name', 'punter_player_id', 'punter_player_name',
] as const

export async function syncNflPbp(admin: ReturnType<typeof createAdminClient>, season: number): Promise<number> {
  const rows = await fetchNflverseCsvGz(`https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_${season}.csv.gz`)
  const mapped = rows.map(r => {
    const row: Record<string, unknown> = {
      play_id: n(r.play_id),
      game_id: r.game_id,
      game_date: s(r.game_date),
      play_desc: s(r.desc),
      raw: r,
      updated_at: new Date().toISOString(),
    }
    for (const f of PBP_NUM_FIELDS) row[f] = n(r[f])
    for (const f of PBP_INT_FIELDS) row[f] = n(r[f])
    for (const f of PBP_BOOL_FIELDS) row[f] = b(r[f])
    for (const f of PBP_STR_FIELDS) row[f] = s(r[f])
    return row
  }).filter(r => r.game_id && r.play_id != null)
  return upsertChunked(admin, 'nfl_pbp', dedupeByKey(mapped, ['game_id', 'play_id']), 'game_id,play_id')
}

// Opponent-adjustment ("defense vs position") — the real answer to "is this
// matchup good for a prop" doesn't need play-by-play at all: nfl_player_stats
// (already synced, full history) already has opponent_team + position on
// every weekly box score row, so "how much does this defense allow to WRs
// per game, vs the league average" is a pure aggregation over data already
// on hand. PBP (above) is for deeper route/leverage-specific splits later;
// this is the immediate, cheap layer.
const DVP_STAT_FIELDS: Record<string, readonly string[]> = {
  QB: ['passing_yards', 'passing_tds', 'interceptions', 'completions', 'attempts'],
  RB: ['rushing_yards', 'rushing_tds', 'receiving_yards', 'receptions'],
  FB: ['rushing_yards', 'rushing_tds', 'receiving_yards', 'receptions'],
  WR: ['receiving_yards', 'receiving_tds', 'receptions', 'targets'],
  TE: ['receiving_yards', 'receiving_tds', 'receptions', 'targets'],
}

export async function computeNflDvp(admin: ReturnType<typeof createAdminClient>, season: number): Promise<number> {
  // PostgREST caps a single select at 1000 rows by default — a REG season
  // is ~5,300+ nfl_player_stats rows, so this must page through with
  // .range() or it silently undercounts games for every team.
  const rows: Record<string, unknown>[] = []
  const PAGE = 1000
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin
      .from('nfl_player_stats')
      .select('opponent_team, position, week, completions, attempts, passing_yards, passing_tds, interceptions, rushing_yards, rushing_tds, receptions, targets, receiving_yards, receiving_tds')
      .eq('season', season)
      .eq('season_type', 'REG')
      .range(offset, offset + PAGE - 1)
    if (error) throw error
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE) break
  }

  // Step 1: sum every stat allowed to each position, by (opponent_team, week)
  // — multiple players of the same position facing the same defense in the
  // same week all contribute to that one game's "allowed" total. week=0
  // season-aggregate rows (a stopgap fill for a season with no real weekly
  // data yet) are skipped here — DVP is fundamentally per-opponent, and a
  // player's season total is collapsed across every team they actually
  // faced, so there's no single defense to attribute it to. That gap is
  // covered by computeNflDvpFromPbp below, which derives real per-game,
  // per-opponent splits straight from play-by-play instead.
  type Agg = { games: number; totals: Record<string, number> }
  const byTeamPos = new Map<string, Agg>()
  const weeksSeenByTeamPos = new Map<string, Set<number>>()
  for (const r of rows ?? []) {
    const position = r.position as string | null
    if (!position || !DVP_STAT_FIELDS[position] || r.opponent_team == null || r.week == null || r.week === 0) continue
    const teamPosKey = `${r.opponent_team}|${position}`
    const teamPosAgg = byTeamPos.get(teamPosKey) ?? { games: 0, totals: {} }
    const weeksSeen = weeksSeenByTeamPos.get(teamPosKey) ?? new Set<number>()
    if (!weeksSeen.has(r.week as number)) { weeksSeen.add(r.week as number); teamPosAgg.games += 1 }
    weeksSeenByTeamPos.set(teamPosKey, weeksSeen)
    for (const f of DVP_STAT_FIELDS[position]) teamPosAgg.totals[f] = (teamPosAgg.totals[f] ?? 0) + (Number((r as Record<string, unknown>)[f]) || 0)
    byTeamPos.set(teamPosKey, teamPosAgg)
  }

  // League-wide totals for the pct_diff baseline — sum of every team's
  // totals/games for that position, computed the same way per team above.
  const byPos = new Map<string, Agg>()
  for (const [key, agg] of byTeamPos) {
    const [, position] = key.split('|')
    const posAgg = byPos.get(position) ?? { games: 0, totals: {} }
    posAgg.games += agg.games
    for (const [f, v] of Object.entries(agg.totals)) posAgg.totals[f] = (posAgg.totals[f] ?? 0) + v
    byPos.set(position, posAgg)
  }

  const mapped: Record<string, unknown>[] = []
  for (const [key, agg] of byTeamPos) {
    const [opponent_team, position] = key.split('|')
    const leagueAgg = byPos.get(position)
    for (const f of DVP_STAT_FIELDS[position]) {
      const avg_allowed = agg.totals[f] != null ? agg.totals[f] / agg.games : null
      const leagueAvg = leagueAgg && leagueAgg.games > 0 ? (leagueAgg.totals[f] ?? 0) / leagueAgg.games : null
      if (avg_allowed == null || leagueAvg == null) continue
      mapped.push({
        season, position, opponent_team, stat_category: f,
        games: agg.games,
        total_allowed: agg.totals[f] ?? 0,
        avg_allowed,
        league_avg_allowed: leagueAvg,
        pct_diff: leagueAvg !== 0 ? ((avg_allowed - leagueAvg) / leagueAvg) * 100 : null,
        updated_at: new Date().toISOString(),
      })
    }
  }
  return upsertChunked(admin, 'nfl_dvp', mapped, 'season,position,opponent_team,stat_category')
}

// Fallback DVP source for a season where nfl_player_stats has no real
// weekly rows yet (nflverse's player_stats.csv release consistently lags a
// season behind its own pbp/nextgen_stats releases — confirmed live, both
// currently reach 2025 while player_stats.csv still stops at 2024). Unlike
// a player's season total, a play in nfl_pbp already carries its own
// game_id/defteam, so per-opponent attribution is possible directly —
// each play is credited to whichever defense (defteam) was on the field.
export async function computeNflDvpFromPbp(admin: ReturnType<typeof createAdminClient>, season: number): Promise<number> {
  const positionById = new Map<string, string>()
  {
    const PAGE = 1000
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await admin.from('nfl_players').select('gsis_id, position').range(offset, offset + PAGE - 1)
      if (error) throw error
      for (const p of data ?? []) if (p.gsis_id && p.position) positionById.set(p.gsis_id, p.position)
      if (!data || data.length < PAGE) break
    }
  }

  const plays: Record<string, unknown>[] = []
  {
    const PAGE = 1000
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await admin
        .from('nfl_pbp')
        .select('game_id, defteam, pass_attempt, rush_attempt, complete_pass, interception, pass_touchdown, rush_touchdown, passer_player_id, rusher_player_id, receiver_player_id, passing_yards, rushing_yards, receiving_yards')
        .eq('season', season)
        .eq('season_type', 'REG')
        .range(offset, offset + PAGE - 1)
      if (error) throw error
      plays.push(...(data ?? []))
      if (!data || data.length < PAGE) break
    }
  }

  type Agg = { games: number; totals: Record<string, number> }
  const byTeamPos = new Map<string, Agg>()
  const gamesSeenByTeamPos = new Map<string, Set<string>>()
  const credit = (defteam: string, position: string, gameId: string, field: string, value: number) => {
    const key = `${defteam}|${position}`
    const agg = byTeamPos.get(key) ?? { games: 0, totals: {} }
    const gamesSeen = gamesSeenByTeamPos.get(key) ?? new Set<string>()
    if (!gamesSeen.has(gameId)) { gamesSeen.add(gameId); agg.games += 1 }
    gamesSeenByTeamPos.set(key, gamesSeen)
    agg.totals[field] = (agg.totals[field] ?? 0) + value
    byTeamPos.set(key, agg)
  }

  for (const p of plays) {
    const defteam = p.defteam as string | null
    const gameId = p.game_id as string
    if (!defteam) continue
    if (p.pass_attempt && p.passer_player_id) {
      const pos = positionById.get(p.passer_player_id as string)
      if (pos && DVP_STAT_FIELDS[pos]) {
        credit(defteam, pos, gameId, 'attempts', 1)
        if (p.complete_pass) credit(defteam, pos, gameId, 'completions', 1)
        if (p.interception) credit(defteam, pos, gameId, 'interceptions', 1)
        if (p.pass_touchdown) credit(defteam, pos, gameId, 'passing_tds', 1)
        credit(defteam, pos, gameId, 'passing_yards', Number(p.passing_yards) || 0)
      }
    }
    if (p.rush_attempt && p.rusher_player_id) {
      const pos = positionById.get(p.rusher_player_id as string)
      if (pos && DVP_STAT_FIELDS[pos]) {
        credit(defteam, pos, gameId, 'carries', 1)
        if (p.rush_touchdown) credit(defteam, pos, gameId, 'rushing_tds', 1)
        credit(defteam, pos, gameId, 'rushing_yards', Number(p.rushing_yards) || 0)
      }
    }
    if (p.pass_attempt && p.receiver_player_id) {
      const pos = positionById.get(p.receiver_player_id as string)
      if (pos && DVP_STAT_FIELDS[pos]) {
        credit(defteam, pos, gameId, 'targets', 1)
        if (p.complete_pass) {
          credit(defteam, pos, gameId, 'receptions', 1)
          credit(defteam, pos, gameId, 'receiving_yards', Number(p.receiving_yards) || 0)
          if (p.pass_touchdown) credit(defteam, pos, gameId, 'receiving_tds', 1)
        }
      }
    }
  }

  const byPos = new Map<string, Agg>()
  for (const [key, agg] of byTeamPos) {
    const [, position] = key.split('|')
    const posAgg = byPos.get(position) ?? { games: 0, totals: {} }
    posAgg.games += agg.games
    for (const [f, v] of Object.entries(agg.totals)) posAgg.totals[f] = (posAgg.totals[f] ?? 0) + v
    byPos.set(position, posAgg)
  }

  const mapped: Record<string, unknown>[] = []
  for (const [key, agg] of byTeamPos) {
    const [opponent_team, position] = key.split('|')
    const leagueAgg = byPos.get(position)
    for (const f of DVP_STAT_FIELDS[position]) {
      const avg_allowed = agg.totals[f] != null ? agg.totals[f] / agg.games : null
      const leagueAvg = leagueAgg && leagueAgg.games > 0 ? (leagueAgg.totals[f] ?? 0) / leagueAgg.games : null
      if (avg_allowed == null || leagueAvg == null) continue
      mapped.push({
        season, position, opponent_team, stat_category: f,
        games: agg.games,
        total_allowed: agg.totals[f] ?? 0,
        avg_allowed,
        league_avg_allowed: leagueAvg,
        pct_diff: leagueAvg !== 0 ? ((avg_allowed - leagueAvg) / leagueAvg) * 100 : null,
        updated_at: new Date().toISOString(),
      })
    }
  }
  return upsertChunked(admin, 'nfl_dvp', mapped, 'season,position,opponent_team,stat_category')
}
