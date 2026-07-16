import { createAdminClient } from '@/lib/supabase/admin'
import { fetchSavantCsv } from '@/lib/savantSync'

type AdminClient = ReturnType<typeof createAdminClient>

// Canonical, sorted "k=v|k=v" string of the split dimensions — used as the
// upsert conflict key since jsonb can't be compared for uniqueness
// directly. Sorted so identical dims always produce the same key
// regardless of object property order.
export function dimsKey(dims: Record<string, string | number>): string {
  return Object.keys(dims).sort().map(k => `${k}=${dims[k]}`).join('|')
}

export type SplitLeaderboard = {
  category: string
  // CSV columns that ARE the split dimensions, not metrics — everything
  // else (besides id/name) gets stored in `metrics`.
  dimColumns: string[]
  url: (opts: { role: 'batter' | 'pitcher'; dateStart: string; dateEnd: string; season: number }) => string
}

// Confirmed live: Savant's own `groupBy` already returns one row per
// combination of bat side x pitch hand x pitch type x contact type for
// every qualifying player in a SINGLE response — no need to fire off
// separate filtered requests per split combination.
export const BAT_TRACKING: SplitLeaderboard = {
  category: 'bat_tracking',
  dimColumns: ['bat_side', 'pitch_hand', 'api_pitch_type', 'bat_contact_code'],
  url: ({ role, dateStart, dateEnd, season }) =>
    `https://baseballsavant.mlb.com/leaderboard/bat-tracking?dateStart=${dateStart}&dateEnd=${dateEnd}` +
    `&gameType=Regular&groupBy=bat_contact_code%7Capi_pitch_type_group03%7Cpitch_hand%7Cbat_side` +
    `&isHardHit=&minSwings=1&minGroupSwings=1&seasonStart=${season}&seasonEnd=${season}` +
    `&type=${role}&sortColumn=avg_bat_speed&sortDirection=desc&csv=true`,
}

export async function syncSplitLeaderboard(
  admin: AdminClient, board: SplitLeaderboard,
  role: 'batter' | 'pitcher', windowType: 'season' | 'recency', dateStart: string, dateEnd: string
) {
  const rows = await fetchSavantCsv(board.url({ role, dateStart, dateEnd, season: Number(dateStart.slice(0, 4)) }))
  const withId = rows.filter(r => r.id)
  if (!withId.length) return { rows: 0 }

  // Same reasoning as the Tier A categories — every id seen here needs at
  // least a stub `players` row since this table FKs to players(mlb_id).
  await admin.from('players').upsert(
    withId.map(r => ({ mlb_id: Number(r.id), full_name: r.name || `Player ${r.id}` })),
    { onConflict: 'mlb_id', ignoreDuplicates: true }
  )

  const upsertRows = withId.map(r => {
    const dims: Record<string, string | number> = {}
    for (const col of board.dimColumns) dims[col] = r[col] ?? ''
    const metrics: Record<string, number | string> = {}
    for (const [k, v] of Object.entries(r)) {
      if (k === 'id' || k === 'name' || board.dimColumns.includes(k) || v === '') continue
      const n = Number(v)
      metrics[k] = Number.isFinite(n) && !/[a-zA-Z]/.test(v) ? n : v
    }
    return {
      mlb_id: Number(r.id), role, category: board.category, window_type: windowType,
      date_start: dateStart, date_end: dateEnd,
      dims, dims_key: dimsKey(dims), metrics, last_synced_at: new Date().toISOString(),
    }
  })

  const { error } = await admin.from('player_statcast_splits')
    .upsert(upsertRows, { onConflict: 'mlb_id,role,category,window_type,dims_key' })
  if (error) throw error

  return { rows: upsertRows.length }
}
