import { createAdminClient } from '@/lib/supabase/admin'

type AdminClient = ReturnType<typeof createAdminClient>

export const PITCH_LOG_SELECT_COLS = [
  'game_pk', 'game_date', 'pitcher_id', 'batter_id', 'pitch_type', 'zone', 'plate_x', 'plate_z',
  'balls', 'strikes', 'inning', 'events', 'description', 'is_in_play', 'is_swing', 'is_whiff', 'is_home_run',
  'launch_speed', 'launch_angle', 'xwoba', 'run_value', 'stand', 'p_throws', 'bat_speed', 'velocity', 'spin_rate',
  'raw',
].join(', ')

// Same pagination /api/players/[id]/pitch-log/route.ts already proved
// correct — player_pitch_log easily exceeds PostgREST's 1000-row default
// cap for a full-time player. Extracted so the bulk Synergy route can also
// call it (one role at a time — a batter never needs his near-empty
// pitcher_id rows fetched, and vice versa) without duplicating this query.
export async function fetchPlayerPitchRows(admin: AdminClient, mlbId: number, role: 'pitcher' | 'batter'): Promise<Record<string, any>[]> {
  const col = role === 'pitcher' ? 'pitcher_id' : 'batter_id'
  const PAGE_SIZE = 1000
  const rows: Record<string, any>[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from('player_pitch_log')
      .select(PITCH_LOG_SELECT_COLS)
      .eq(col, mlbId)
      .order('game_pk', { ascending: true }).order('at_bat_index', { ascending: true }).order('pitch_number', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    if (!data?.length) break
    rows.push(...data)
    if (data.length < PAGE_SIZE) break
  }
  return rows
}

// Every home run a player has hit/allowed this season — a small subset by
// nature, and player_pitch_log carries a partial index specifically for
// this (`... WHERE is_home_run`), so this stays fast across ~150 players at
// once even though fetchPlayerPitchRows' full per-pitch fetch (proven fine
// for ONE player at a time, see the per-player route) hits a real Postgres
// statement timeout when run concurrently across a whole day's slate —
// confirmed live via Synergy's bulk route. Used for the real HR-affinity
// evidence search, which only ever looks at home runs anyway.
export async function fetchPlayerHomeRuns(admin: AdminClient, mlbId: number, role: 'pitcher' | 'batter'): Promise<Record<string, any>[]> {
  const col = role === 'pitcher' ? 'pitcher_id' : 'batter_id'
  const { data, error } = await admin
    .from('player_pitch_log')
    .select(PITCH_LOG_SELECT_COLS)
    .eq(col, mlbId)
    .eq('is_home_run', true)
    .order('game_date', { ascending: false })
  if (error) throw error
  return data ?? []
}

// Every distinct date a player has actually played this season, skinny (one
// column, no raw JSONB) and ordered to match the table's own
// (id, game_date DESC) index — just enough to find his real last-N-games
// window without pulling every pitch of every game he's played. Stops once
// comfortably past any real recency window this app uses (last-10-games /
// last-3-starts) — a batter sees ~15-20 pitches a game, so this is almost
// always satisfied by the very first page.
export async function fetchPlayerGameDates(admin: AdminClient, mlbId: number, role: 'pitcher' | 'batter'): Promise<string[]> {
  const col = role === 'pitcher' ? 'pitcher_id' : 'batter_id'
  const PAGE_SIZE = 1000
  const dates = new Set<string>()
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from('player_pitch_log')
      .select('game_date')
      .eq(col, mlbId)
      .order('game_date', { ascending: false })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    if (!data?.length) break
    for (const r of data) dates.add(r.game_date)
    if (data.length < PAGE_SIZE || dates.size >= 15) break
  }
  // Ascending (oldest first) — matches lastNGameDates' own convention so a
  // plain .slice(-n) on this array always means "the n most recent."
  return Array.from(dates).sort()
}

// Attaches opponent identity + the couple raw-JSONB Savant fields every
// consumer of this table wants displayed. Generalized to enrich rows from
// many players against one shared, pre-batched opponents/games lookup —
// the single-player route does its own one-off lookup; the bulk Synergy
// route batches this once across ~150 players instead of per player.
export function enrichPitchRows(
  rows: Record<string, any>[],
  opponentKey: 'batter_id' | 'pitcher_id',
  opponents: Record<number, { full_name: string | null; current_team_abbr: string | null }>,
  gameInfo: Record<string, { day_night: string | null; venue_name: string | null }>,
): Record<string, any>[] {
  return rows.map(r => {
    const opp = opponents[r[opponentKey]]
    const raw = r.raw ?? {}
    return {
      ...r,
      opponent_id: r[opponentKey],
      opponent_name: opp?.full_name ?? `Player ${r[opponentKey]}`,
      opponent_team: opp?.current_team_abbr ?? null,
      day_night: gameInfo[r.game_pk]?.day_night ?? null,
      venue_name: gameInfo[r.game_pk]?.venue_name ?? null,
      swing_length: raw.swing_length !== undefined && raw.swing_length !== '' ? Number(raw.swing_length) : null,
      attack_angle: raw.attack_angle !== undefined && raw.attack_angle !== '' ? Number(raw.attack_angle) : null,
      hit_distance: raw.hit_distance_sc !== undefined && raw.hit_distance_sc !== '' ? Number(raw.hit_distance_sc) : null,
      bb_type: raw.bb_type || null,
      raw: undefined,
    }
  })
}
