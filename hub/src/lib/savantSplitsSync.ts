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
  // Some Savant leaderboards (batting stance, swing path/attack angle) are
  // batter-only biomechanics pages with no pitcher variant at all — default
  // both when omitted, override to ['batter'] for those.
  roles?: readonly ('batter' | 'pitcher')[]
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

const ALL_PITCH_TYPES = ['FF', 'SI', 'FC', 'CH', 'FS', 'FO', 'SC', 'CU', 'SL', 'ST', 'SV', 'KN']

// Same confirmed pattern: `split[]` params return every combination of
// pitch type x bat side x pitch hand for every qualifying player in one
// response.
export const BATTED_BALL_PROFILE: SplitLeaderboard = {
  category: 'batted_ball_splits',
  dimColumns: ['bat_side', 'pitch_hand', 'api_pitch_type'],
  url: ({ role, dateStart, dateEnd, season }) =>
    `https://baseballsavant.mlb.com/leaderboard/batted-ball?type=${role}&season%5B%5D=${season}` +
    `&splitYear=0&min=1&split%5B%5D=api_pitch_type_group03&split%5B%5D=bat_side&split%5B%5D=pitch_hand` +
    `&minSplit=1&gameType%5B%5D=R&dateStart=${dateStart}&dateEnd=${dateEnd}&batSide=&pitchHand=` +
    ALL_PITCH_TYPES.map(pt => `&pitchType%5B%5D=${pt}`).join('') +
    `&csv=true`,
}

// Swing Path / Attack Angle — batter-only (confirmed: this leaderboard's
// own Type dropdown only offers Batters/Batters-Team/League, no Pitchers,
// same as Batting Stance). Its `groupBy` param is a single pipe-delimited
// STRING (confirmed: passing repeated `groupBy[]` params like bat-tracking/
// batted-ball use gets a real 500 — "groupBy.split is not a function" —
// this endpoint expects the exact `groupBy=a%7Cb%7Cc` shape the original
// non-split /leaderboard/bat-tracking endpoint also uses), not the `split[]`
// array style. Avg bat speed, swing tilt, attack angle/direction, ideal-
// attack-angle rate, plate/batter intercept position.
export const SWING_PATH_ATTACK_ANGLE: SplitLeaderboard = {
  category: 'swing_path_attack_angle',
  dimColumns: ['bat_side', 'pitch_hand', 'api_pitch_type'],
  roles: ['batter'],
  url: ({ dateStart, dateEnd, season }) =>
    `https://baseballsavant.mlb.com/leaderboard/bat-tracking/swing-path-attack-angle?type=batter&gameType=Regular&team=&min=1` +
    `&seasonStart=${season}&seasonEnd=${season}&dateStart=${dateStart}&dateEnd=${dateEnd}` +
    `&batSide=&contactType=&isHardHit=&attackZone=&pitchHand=` +
    `&groupBy=api_pitch_type_group03%7Cpitch_hand%7Cbat_side&minGroupSwings=1&csv=true`,
}

// Same confirmed pattern as bat-tracking/batted-ball: `split[]` returns
// every pitch-type x bat-side x pitch-hand x contact-type combination for
// every qualifying player in one response. Swing timing (tied up/centered/
// flail, early/on-time/late, under/lined-up/over) + whiff/miss-distance
// data — left the 3 swingTiming[XYZ][] filters at "all values" (matching
// the page's own defaults) so nothing is excluded, since those are really
// output dimensions here, not a filter the user asked to narrow by.
export const SWING_TIMING_MISS_DISTANCE: SplitLeaderboard = {
  category: 'swing_timing_miss_distance',
  dimColumns: ['bat_side', 'pitch_hand', 'api_pitch_type', 'bat_contact_code'],
  url: ({ role, dateStart, dateEnd, season }) =>
    `https://baseballsavant.mlb.com/leaderboard/bat-tracking/swing-timing-miss-distance?type=${role}&season%5B%5D=${season}` +
    `&splitYear=0&min=1&split%5B%5D=api_pitch_type_group03&split%5B%5D=bat_contact_code&split%5B%5D=pitch_hand&split%5B%5D=bat_side` +
    `&minSplit=1&gameType%5B%5D=R&dateStart=${dateStart}&dateEnd=${dateEnd}&batSide=&contactType=&attackZone=&pitchHand=` +
    ALL_PITCH_TYPES.map(pt => `&pitchType%5B%5D=${pt}`).join('') +
    `&swingTimingX%5B%5D=Tiedup&swingTimingX%5B%5D=Centered&swingTimingX%5B%5D=Flail` +
    `&swingTimingY%5B%5D=Early&swingTimingY%5B%5D=OnTime&swingTimingY%5B%5D=Late` +
    `&swingTimingZ%5B%5D=Under&swingTimingZ%5B%5D=Linedup&swingTimingZ%5B%5D=Over` +
    `&sortColumn=bat_contact_code&sortDirection=asc&csv=true`,
}

export async function syncSplitLeaderboard(
  admin: AdminClient, board: SplitLeaderboard, season: number,
  role: 'batter' | 'pitcher', windowType: 'season' | 'recency', dateStart: string, dateEnd: string
) {
  const rows = await fetchSavantCsv(board.url({ role, dateStart, dateEnd, season }))
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
    const metrics: Record<string, number | string | null> = {}
    for (const [k, v] of Object.entries(r)) {
      if (k === 'id' || k === 'name' || board.dimColumns.includes(k) || v === '') continue
      // Savant emits a literal "NaN" for metrics that don't apply to a given
      // split (e.g. no squared-up rate on a swinging strike) — a real null,
      // not a value worth keeping as the string "NaN".
      if (v === 'NaN') { metrics[k] = null; continue }
      const n = Number(v)
      metrics[k] = Number.isFinite(n) ? n : v
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

// MLB's own season-schedule endpoint confirmed 2026's regularSeasonStartDate.
// Falls back to a March 25 guess for a season this map doesn't have yet
// rather than hard-failing.
const REGULAR_SEASON_START: Record<number, string> = { 2026: '2026-03-25' }
const RECENCY_DAYS = 6

export function seasonStartDate(season: number): string {
  return REGULAR_SEASON_START[season] ?? `${season}-03-25`
}
export function todayET(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}
export function daysAgoET(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}

// Swing/Take (Batting Run Value) leaderboard — a different shape class from
// bat-tracking/batted-ball: Savant has no `groupBy` here, so each of the 4
// "Group Type" dimensions x their sub-types needs its own separate request
// (confirmed live: the CSV always returns the SAME 5 metrics — runs_all +
// the 4 attack-region splits — regardless of filter, EXCEPT when filtering
// by Attack Region itself, which instead breaks out by pitch type). Real
// param names/values confirmed from the page's own client bundle (not
// guessed) since the visible dropdown labels don't match the URL params:
// type=`Swing-Take` (hyphenated, not "Swing/Take") and type=`Bat-side` (not
// "Bat/Throw Side"). No recency window — this leaderboard has no date-range
// params to support one, only `year`.
export type SwingTakeGroup = { groupType: string; subTypes: string[] }

export const SWING_TAKE_GROUPS: SwingTakeGroup[] = [
  {
    groupType: 'Pitch Type',
    subTypes: ['4-Seam Fastball', 'Changeup', 'Curveball', 'Cutter', 'Knuckleball', 'Screwball', 'Sinker', 'Slider', 'Slurve', 'Split-Finger', 'Sweeper'],
  },
  { groupType: 'Swing-Take', subTypes: ['Swing', 'Take'] },
  { groupType: 'Attack Region', subTypes: ['Heart', 'Shadow', 'Chase', 'Waste'] },
  { groupType: 'Bat-side', subTypes: ['R', 'L'] },
]

function swingTakeUrl(role: 'batter' | 'pitcher', groupType: string, subType: string, season: number): string {
  const group = role === 'batter' ? 'Batter' : 'Pitcher'
  return `https://baseballsavant.mlb.com/leaderboard/swing-take?year=${season}&team=&leverage=Neutral&group=${group}&type=${encodeURIComponent(groupType)}&sub_type=${encodeURIComponent(subType)}&min=10&csv=true`
}

// Runs a bounded number of jobs concurrently — 38 total requests here (2
// roles x 19 sub-types across the 4 group dimensions), one per HTTP call,
// batched so the cron stays well inside its 60s cap without firing all 38
// at once.
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const idx = next++
      results[idx] = await fn(items[idx])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

export async function syncSwingTake(admin: AdminClient, season: number) {
  const seasonStart = seasonStartDate(season)
  const today = todayET()

  const jobs: { role: 'batter' | 'pitcher'; groupType: string; subType: string }[] = []
  for (const role of ['batter', 'pitcher'] as const) {
    for (const group of SWING_TAKE_GROUPS) {
      for (const subType of group.subTypes) jobs.push({ role, groupType: group.groupType, subType })
    }
  }

  const entries = await mapWithConcurrency(jobs, 6, async job => {
    const key = `${job.role}_${job.groupType}_${job.subType}`
    try {
      const rows = await fetchSavantCsv(swingTakeUrl(job.role, job.groupType, job.subType, season))
      const withId = rows.filter(r => r.player_id)
      if (!withId.length) return [key, { rows: 0 }] as const

      await admin.from('players').upsert(
        withId.map(r => ({ mlb_id: Number(r.player_id), full_name: r['last_name, first_name'] || `Player ${r.player_id}` })),
        { onConflict: 'mlb_id', ignoreDuplicates: true }
      )

      const dims = { group_type: job.groupType, sub_type: job.subType }
      const dk = dimsKey(dims)
      const upsertRows = withId.map(r => {
        const metrics: Record<string, number | string | null> = {}
        for (const [k, v] of Object.entries(r)) {
          if (k === 'player_id' || k === 'last_name, first_name' || k === 'year' || v === '') continue
          if (v === 'NaN') { metrics[k] = null; continue }
          const n = Number(v)
          metrics[k] = Number.isFinite(n) ? n : v
        }
        return {
          mlb_id: Number(r.player_id), role: job.role, category: 'swing_take', window_type: 'season' as const,
          date_start: seasonStart, date_end: today,
          dims, dims_key: dk, metrics, last_synced_at: new Date().toISOString(),
        }
      })

      const { error } = await admin.from('player_statcast_splits')
        .upsert(upsertRows, { onConflict: 'mlb_id,role,category,window_type,dims_key' })
      if (error) throw error

      return [key, { rows: upsertRows.length }] as const
    } catch (e: any) {
      console.error('[savant-swing-take] job failed', key, e)
      return [key, { error: e?.message || String(e) }] as const
    }
  })

  return { season, seasonStart, today, results: Object.fromEntries(entries) }
}

// Batting Stance — batter-only (Savant's /visuals/batting-stance has no
// batter/pitcher `type` toggle at all, unlike every other category so
// far), and its only real groupBy dimension is bat_side, which is baked
// into every response automatically. Pitch Hand is a plain top-level
// FILTER, not a groupBy option, so getting "vs LHP" and "vs RHP" splits
// needs 2 separate filtered requests (plus a blank "vs all" baseline) —
// same one-request-per-filter-value shape as Swing/Take, just a much
// smaller combination space (3 filters x 2 windows = 6 requests, no
// concurrency limiter needed).
function battingStanceUrl(pitchHand: '' | 'L' | 'R', dateStart: string, dateEnd: string, season: number): string {
  return `https://baseballsavant.mlb.com/visuals/batting-stance?seasonStart=${season}&seasonEnd=${season}&dateStart=${dateStart}&dateEnd=${dateEnd}&gameType=Regular&team=&batSide=&pitchHand=${pitchHand}&contactType=&isHardHit=&min=1&minGroupSwings=1&csv=true`
}

export async function syncBattingStance(admin: AdminClient, season: number) {
  const seasonStart = seasonStartDate(season)
  const today = todayET()
  const recencyStart = daysAgoET(RECENCY_DAYS)

  const results: Record<string, { rows: number } | { error: string }> = {}

  for (const [windowType, dateStart, dateEnd] of [
    ['season', seasonStart, today],
    ['recency', recencyStart, today],
  ] as const) {
    for (const pitchHand of ['', 'L', 'R'] as const) {
      const key = `${windowType}_vs_${pitchHand || 'all'}`
      try {
        const rows = await fetchSavantCsv(battingStanceUrl(pitchHand, dateStart, dateEnd, season))
        const withId = rows.filter(r => r.id)
        if (!withId.length) { results[key] = { rows: 0 }; continue }

        await admin.from('players').upsert(
          withId.map(r => ({ mlb_id: Number(r.id), full_name: r.name || `Player ${r.id}` })),
          { onConflict: 'mlb_id', ignoreDuplicates: true }
        )

        const dims = { pitch_hand: pitchHand || 'All' }
        const dk = dimsKey(dims)
        const upsertRows = withId.map(r => {
          const metrics: Record<string, number | string | null> = {}
          for (const [k, v] of Object.entries(r)) {
            if (k === 'id' || k === 'name' || v === '') continue
            if (v === 'NaN') { metrics[k] = null; continue }
            const n = Number(v)
            metrics[k] = Number.isFinite(n) ? n : v
          }
          return {
            mlb_id: Number(r.id), role: 'batter' as const, category: 'batting_stance', window_type: windowType,
            date_start: dateStart, date_end: dateEnd,
            dims, dims_key: dk, metrics, last_synced_at: new Date().toISOString(),
          }
        })

        const { error } = await admin.from('player_statcast_splits')
          .upsert(upsertRows, { onConflict: 'mlb_id,role,category,window_type,dims_key' })
        if (error) throw error

        results[key] = { rows: upsertRows.length }
      } catch (e: any) {
        console.error('[savant-batting-stance] job failed', key, e)
        results[key] = { error: e?.message || String(e) }
      }
    }
  }

  return { season, seasonStart, today, recencyStart, results }
}

// The shared cron body for every split-and-recency category: pulls both
// batter and pitcher roles for both a season-to-date window and a rolling
// recency window (4 requests total). Each new category's cron route is
// just this one call plus its own SplitLeaderboard config.
export async function syncBothWindows(admin: AdminClient, board: SplitLeaderboard, season: number) {
  const seasonStart = seasonStartDate(season)
  const today = todayET()
  const recencyStart = daysAgoET(RECENCY_DAYS)

  const results: Record<string, { rows: number } | { error: string }> = {}

  for (const role of board.roles ?? (['batter', 'pitcher'] as const)) {
    for (const [windowType, dateStart, dateEnd] of [
      ['season', seasonStart, today],
      ['recency', recencyStart, today],
    ] as const) {
      const key = `${role}_${windowType}`
      try {
        results[key] = await syncSplitLeaderboard(admin, board, season, role, windowType, dateStart, dateEnd)
      } catch (e: any) {
        console.error(`[savant-splits:${board.category}] failed`, key, e)
        results[key] = { error: e?.message || String(e) }
      }
    }
  }

  return { season, seasonStart, today, recencyStart, results }
}
