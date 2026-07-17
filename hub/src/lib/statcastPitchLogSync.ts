import { createAdminClient } from '@/lib/supabase/admin'
import { fetchSavantCsv } from '@/lib/savantSync'

type AdminClient = ReturnType<typeof createAdminClient>

// Baseball Savant's statcast_search CSV export, `type=details` — the same
// undocumented endpoint the site's own search UI hits, confirmed live to
// return every tracked pitch (all counts, all pitchers/batters, full
// game context) for a single game_date in one response. `player_type` only
// controls which side's name resolves into `player_name` in the response —
// pinned to `pitcher` here since pitcher_id is already useful as-is via the
// `pitcher` column and this keeps the URL/parsing simple; the batter's own
// name isn't in this response at all (batter identified by id only), same
// gap the Tier A/splits syncs hit and solve the same way — a `Player {id}`
// stub name until mlb-sync-bio reaches that player.
function pitchLogCsvUrl(date: string): string {
  return `https://baseballsavant.mlb.com/statcast_search/csv?all=true&hfPT=&hfAB=&hfBBT=&hfPR=&hfZ=` +
    `&stadium=&hfBBL=&hfNewZones=&hfGT=R%7C&hfC=&hfSea=&hfSit=&player_type=pitcher&hfOuts=` +
    `&opponent=&pitcher_throws=&batter_stands=&hfSA=&game_date_gt=${date}&game_date_lt=${date}` +
    `&hfInfield=&team=&position=&hfOutfield=&hfRO=&home_road=&hfFlag=&hfPull=&metric_1=&hfInn=` +
    `&min_pitches=0&min_results=0&group_by=name&sort_col=pitches&player_event_sort=api_p_release_speed` +
    `&sort_order=desc&min_pas=0&type=details`
}

// Regular-season game log for a date — MLB's own schedule endpoint,
// `hydrate=venue` for stadium name. Gives day/night + venue + opponent,
// none of which appear anywhere in the Savant pitch CSV.
async function fetchScheduleJson(date: string): Promise<any> {
  const res = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}&hydrate=venue`, {
    cache: 'no-store',
    headers: { 'User-Agent': 'SlipSurge/1.0' },
  })
  if (!res.ok) throw new Error(`MLB schedule ${res.status}: ${date}`)
  return res.json()
}

// `player_pitch_log` is a declaratively partitioned table (RANGE by
// `season` — confirmed live via pg_inherits/pg_get_partkeydef), with
// `player_pitch_log_2026` as its 2026 partition. Always write to the
// parent name; Postgres routes each row to the right partition off the
// `season` column. PostgREST doesn't expose partitions directly — writing
// to `player_pitch_log_2026` by name 404s with PGRST205.
export const PITCH_LOG_TABLE = 'player_pitch_log'

function numOrNull(v: string | undefined): number | null {
  if (v === undefined || v === '' || v === 'NaN') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
function intOrNull(v: string | undefined): number | null {
  const n = numOrNull(v)
  return n === null ? null : Math.round(n)
}

// Swing/whiff classification off Savant's own `description` values — same
// vocabulary MLB's Gumbo feed call codes map to (see pitchLog.ts's
// SWING_CALL_CODES), just keyed by Savant's string instead of a call code.
const SWING_DESCRIPTIONS = new Set([
  'foul', 'foul_tip', 'foul_bunt', 'missed_bunt', 'bunt_foul_tip', 'foul_pitchout',
  'hit_into_play', 'swinging_strike', 'swinging_strike_blocked',
])
const WHIFF_DESCRIPTIONS = new Set(['swinging_strike', 'swinging_strike_blocked', 'missed_bunt'])

const WRITE_CHUNK_SIZE = 500

export async function syncGamesForDate(admin: AdminClient, date: string, season: number): Promise<{ games: number }> {
  const d = await fetchScheduleJson(date)
  const games = (d?.dates?.[0]?.games ?? []).filter((g: any) => g.gameType === 'R')
  if (!games.length) return { games: 0 }

  const rows = games.map((g: any) => ({
    game_pk: String(g.gamePk), season, game_date: g.officialDate, game_type: g.gameType,
    home_team_id: g.teams?.home?.team?.id ?? null, home_team: g.teams?.home?.team?.name ?? null,
    away_team_id: g.teams?.away?.team?.id ?? null, away_team: g.teams?.away?.team?.name ?? null,
    venue_id: g.venue?.id ?? null, venue_name: g.venue?.name ?? null, day_night: g.dayNight ?? null,
    last_synced_at: new Date().toISOString(),
  }))

  const { error } = await admin.from('games').upsert(rows, { onConflict: 'game_pk' })
  if (error) throw error
  return { games: rows.length }
}

export async function syncPitchLogForDate(admin: AdminClient, date: string, season: number): Promise<{ rows: number }> {
  const rows = await fetchSavantCsv(pitchLogCsvUrl(date))
  const withKeys = rows.filter(r => r.game_pk && r.pitcher && r.batter && r.at_bat_number && r.pitch_number)
  if (!withKeys.length) return { rows: 0 }

  // Every pitcher/batter id in this CSV needs at least a stub `players` row
  // — same reasoning as every other Savant sync in this codebase, since
  // player_pitch_log(_2026) FKs both columns to players(mlb_id).
  const stubs = new Map<number, string>()
  for (const r of withKeys) {
    const pid = Number(r.pitcher)
    if (pid && !stubs.has(pid)) stubs.set(pid, r.player_name || `Player ${pid}`)
    const bid = Number(r.batter)
    if (bid && !stubs.has(bid)) stubs.set(bid, `Player ${bid}`)
  }
  await admin.from('players').upsert(
    Array.from(stubs, ([mlb_id, full_name]) => ({ mlb_id, full_name })),
    { onConflict: 'mlb_id', ignoreDuplicates: true }
  )

  const upsertRows = withKeys.map(r => ({
    season, game_pk: String(r.game_pk), at_bat_index: Number(r.at_bat_number), pitch_number: Number(r.pitch_number),
    game_date: r.game_date, pitcher_id: Number(r.pitcher), batter_id: Number(r.batter),
    pitch_type: r.pitch_type || null,
    velocity: numOrNull(r.release_speed), spin_rate: intOrNull(r.release_spin_rate),
    pfx_x: numOrNull(r.pfx_x), pfx_z: numOrNull(r.pfx_z),
    balls: intOrNull(r.balls), strikes: intOrNull(r.strikes),
    inning: intOrNull(r.inning), top_bottom: r.inning_topbot || null, zone: intOrNull(r.zone),
    events: r.events || null, description: r.description || null,
    is_in_play: r.type === 'X',
    is_swing: SWING_DESCRIPTIONS.has(r.description),
    is_whiff: WHIFF_DESCRIPTIONS.has(r.description),
    is_home_run: r.events === 'home_run',
    launch_speed: numOrNull(r.launch_speed), launch_angle: numOrNull(r.launch_angle),
    xwoba: numOrNull(r.estimated_woba_using_speedangle),
    bat_speed: numOrNull(r.bat_speed),
    // Closest available per-pitch "run value" — Savant's own change in win/
    // run expectancy attributable to this pitch. Not literally labeled
    // run_value in the CSV (that's `delta_run_exp`), but the same concept
    // the column name in this table is going for.
    run_value: numOrNull(r.delta_run_exp),
    raw: r,
  }))

  for (let i = 0; i < upsertRows.length; i += WRITE_CHUNK_SIZE) {
    const { error } = await admin.from(PITCH_LOG_TABLE)
      .upsert(upsertRows.slice(i, i + WRITE_CHUNK_SIZE), { onConflict: 'season,game_pk,at_bat_index,pitch_number' })
    if (error) throw error
  }

  return { rows: upsertRows.length }
}

export async function syncStatcastDay(admin: AdminClient, date: string, season: number) {
  const gamesResult = await syncGamesForDate(admin, date, season)
  // No point hitting the (much heavier) pitch CSV on a real off day — every
  // date in range still gets a `games` row written above either way, so a
  // 0-game day is still recorded as "checked", not silently skipped.
  if (!gamesResult.games) return { date, ...gamesResult, pitches: 0 }
  const pitchResult = await syncPitchLogForDate(admin, date, season)
  return { date, ...gamesResult, pitches: pitchResult.rows }
}
