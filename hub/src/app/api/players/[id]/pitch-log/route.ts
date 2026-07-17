import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const revalidate = 0

type AdminClient = ReturnType<typeof createAdminClient>

const SELECT_COLS = [
  'game_pk', 'game_date', 'pitcher_id', 'batter_id', 'pitch_type', 'zone', 'plate_x', 'plate_z',
  'balls', 'strikes', 'inning', 'events', 'description', 'is_in_play', 'is_swing', 'is_whiff', 'is_home_run',
  'launch_speed', 'launch_angle', 'xwoba', 'run_value', 'stand', 'p_throws', 'bat_speed',
  // swing_length/attack_angle/bb_type aren't their own typed columns (see
  // statcastPitchLogSync.ts) — they're real Savant CSV fields all the same,
  // just still living in `raw` until something needs to filter/index on
  // them rather than only display them. Pulled out below, then `raw`
  // itself is dropped before the response goes to the client.
  'raw',
].join(', ')

// player_pitch_log easily exceeds PostgREST's 1000-row default cap for a
// full-time player (a workhorse starter throws 2,500-3,500+ pitches a
// season) — paginated the same way the pitch-arsenal-details seed query
// had to be fixed to do (see commit e519162b). Ordered by the table's own
// composite PK (not game_date, which has huge ties within a day) so page
// boundaries are fully deterministic — same lesson as commit d4a3ef44.
async function fetchPlayerPitches(admin: AdminClient, mlbId: number, role: 'pitcher' | 'batter') {
  const col = role === 'pitcher' ? 'pitcher_id' : 'batter_id'
  const PAGE_SIZE = 1000
  const rows: Record<string, any>[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from('player_pitch_log')
      .select(SELECT_COLS)
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

// Every pitch a player has thrown (as pitcher) and/or seen (as batter) this
// season, trimmed to the fields the zone-heatmap and matchup-explorer cards
// need — feeds src/components/players/PitchZoneHeatmap.tsx and
// BatterMatchupExplorer.tsx. Deliberately a separate endpoint from
// /api/players/[id]: this payload (thousands of raw rows, filtered/
// aggregated entirely client-side same as the split explorers) is much
// heavier than everything else on the page combined, so it loads
// independently rather than blocking the rest of the page on it.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const mlbId = Number(id)
  if (!Number.isFinite(mlbId)) {
    return NextResponse.json({ error: 'Invalid player id' }, { status: 400 })
  }

  const admin = createAdminClient()

  const [pitcherRows, batterRows] = await Promise.all([
    fetchPlayerPitches(admin, mlbId, 'pitcher'),
    fetchPlayerPitches(admin, mlbId, 'batter'),
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

  const enrich = (rows: Record<string, any>[], opponentKey: 'batter_id' | 'pitcher_id') => rows.map(r => {
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
      bb_type: raw.bb_type || null,
      raw: undefined,
    }
  })

  return NextResponse.json({
    pitcherRows: enrich(pitcherRows, 'batter_id'),
    batterRows: enrich(batterRows, 'pitcher_id'),
  })
}
