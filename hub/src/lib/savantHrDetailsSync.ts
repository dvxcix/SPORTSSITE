import { createAdminClient } from '@/lib/supabase/admin'

type AdminClient = ReturnType<typeof createAdminClient>

// The per-event home run log behind Savant's expandable leaderboard row —
// a genuinely different endpoint from the aggregate CSV leaderboard
// (`SAVANT_TIER_A`'s `home_runs` category): confirmed live via the page's
// own client bundle, which calls this on row-expand as
// `GET /leaderboard/home-runs?type=details&player_id=<id>&year=<y>&player_type=Batter&cat=xhr`.
// Returns real per-batted-ball JSON (not CSV) — every home run AND every
// "would-be" near-miss barrel (result can be a real double/field_out, not
// just home_run), each with the batter+pitcher id/name, exit velo, launch
// angle, distance, trot time, and a boolean per MLB ballpark for whether
// that specific ball would have left THAT park. Fetching only the batter
// side is sufficient for full coverage — every event already carries the
// opposing pitcher's id/name, so a pitcher's "who's hit off me" view is
// just `WHERE pitcher_id = X` on the same table, no separate pitcher-side
// fetch needed.
const PARK_COLUMNS = [
  'laa', 'bal', 'bos', 'cws', 'cle', 'kc', 'oak', 'tb', 'tex', 'tor',
  'ari', 'chc', 'col', 'lad', 'pit', 'mil', 'sea', 'hou', 'det', 'sf',
  'cin', 'sd', 'phi', 'stl', 'nym', 'wsh', 'min', 'nyy', 'mia', 'atl',
]

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : null
}

async function fetchHrDetails(playerId: number, season: number): Promise<any[]> {
  const url = `https://baseballsavant.mlb.com/leaderboard/home-runs?type=details&player_id=${playerId}&year=${season}&player_type=Batter&cat=xhr`
  const res = await fetch(url, {
    cache: 'no-store',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json,text/plain,*/*',
    },
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Savant HR details ${res.status}: player ${playerId} :: ${text.slice(0, 300)}`)
  try {
    const parsed = JSON.parse(text)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    console.error('[savant-hr-details] unparseable response', { playerId, preview: text.slice(0, 300) })
    return []
  }
}

const SOURCE = 'savant_hr_details'
const ENTITY_TYPE = 'hr_detail_batter'
const STALE_CLAIM_MINUTES = 12
// Confirmed live: this endpoint has no meaningful rate limiting — 514
// concurrent requests (the entire batter leaderboard) at concurrency 40
// completed in 9s with zero errors. The real bottleneck wasn't fetch
// speed, it was doing one sequential Supabase round-trip per player; fixed
// by fetching concurrently and writing in one bulk upsert per tick. 300/
// tick (with real headroom to spare) clears the current ~475-batter
// backlog in 2 ticks instead of ~19.
const BATCH_SIZE = 300
const FETCH_CONCURRENCY = 20
const WRITE_CHUNK_SIZE = 500
const RECHECK_COMPLETE_HOURS = 20

// Runs a bounded number of jobs concurrently.
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

// Seeds a 'pending' claim row for every batter who actually has a home run
// this season, drawn straight from the already-synced Tier A `home_runs`
// leaderboard rows (`player_statcast_hitting_season`) rather than
// re-deriving the qualifying-player list from scratch — `ignoreDuplicates`
// means a batter already seeded (mid-progress or complete) is left alone.
async function seedPendingBatters(admin: AdminClient, season: number) {
  const { data: rows } = await admin
    .from('player_statcast_hitting_season')
    .select('mlb_id, metrics')
    .eq('season', season)
    .eq('category', 'home_runs')

  const qualifying = (rows ?? []).filter(r => Number((r.metrics as any)?.hr_total) > 0)
  if (!qualifying.length) return

  await admin.from('sync_state').upsert(
    qualifying.map(r => ({
      source: SOURCE, entity_type: ENTITY_TYPE, entity_id: String(r.mlb_id), season, status: 'pending',
    })),
    { onConflict: 'source,entity_type,entity_id,season', ignoreDuplicates: true }
  )
}

// Claims up to BATCH_SIZE pending/error/stale-claimed batter jobs — same
// claim-a-small-batch-per-tick shape as the MLB Stats API bio/season-stats
// crons, since a full sweep (one request per qualifying batter, likely
// several hundred) doesn't fit one 60s invocation the way every other
// Savant category so far has. Also re-checks 'complete' rows once they're
// over RECHECK_COMPLETE_HOURS old — otherwise a batter who's already
// caught up would never get re-synced for home runs hit AFTER their first
// successful pull.
export async function syncHrDetailBatch(admin: AdminClient, season: number) {
  await seedPendingBatters(admin, season)

  const staleClaimBefore = new Date(Date.now() - STALE_CLAIM_MINUTES * 60_000).toISOString()
  const recheckBefore = new Date(Date.now() - RECHECK_COMPLETE_HOURS * 60 * 60_000).toISOString()
  const { data: jobs } = await admin
    .from('sync_state')
    .select('entity_id')
    .eq('source', SOURCE).eq('entity_type', ENTITY_TYPE).eq('season', season)
    .or(`status.eq.pending,status.eq.error,and(status.eq.claimed,claimed_at.lt.${staleClaimBefore}),and(status.eq.complete,last_synced_at.lt.${recheckBefore})`)
    .limit(BATCH_SIZE)

  const claimedIds = (jobs ?? []).map(j => j.entity_id)
  if (!claimedIds.length) return { claimed: 0, results: {} }

  await admin.from('sync_state').upsert(
    claimedIds.map(id => ({ source: SOURCE, entity_type: ENTITY_TYPE, entity_id: id, season, status: 'claimed', claimed_at: new Date().toISOString() })),
    { onConflict: 'source,entity_type,entity_id,season' }
  )

  // Fetch every claimed batter concurrently — the slow part was never the
  // fetches, it was doing a Supabase round-trip per player sequentially.
  const fetched = await mapWithConcurrency(claimedIds, FETCH_CONCURRENCY, async idStr => {
    try {
      return { idStr, events: await fetchHrDetails(Number(idStr), season), error: null as string | null }
    } catch (e: any) {
      console.error('[savant-hr-details] batter fetch failed', idStr, e)
      return { idStr, events: [] as any[], error: e?.message || String(e) }
    }
  })

  const allEvents = fetched.flatMap(f => f.events)

  // Every pitcher named across the whole batch needs at least a stub
  // `players` row — the batter already has one (that's how they were
  // seeded), but an opposing pitcher who hasn't synced via mlb-sync-bio
  // yet would otherwise fail the FK on player_home_run_events.pitcher_id.
  // A write failure here is caught (not thrown) so it can't strand this
  // whole batch's sync_state rows on 'claimed' forever — leaving them
  // claimed-but-unmarked just means the stale-claim window picks them back
  // up on a later tick instead of wrongly recording 'complete'.
  let writeFailed: string | null = null
  if (allEvents.length) {
    try {
      const pitcherStubs = new Map<number, string>()
      for (const e of allEvents) {
        const pid = Number(e.pitcher_id)
        if (pid && !pitcherStubs.has(pid)) pitcherStubs.set(pid, e.pitcher_name || `Player ${pid}`)
      }
      await admin.from('players').upsert(
        Array.from(pitcherStubs, ([mlb_id, full_name]) => ({ mlb_id, full_name })),
        { onConflict: 'mlb_id', ignoreDuplicates: true }
      )

      const upsertRows = allEvents.map(e => ({
        game_pk: Number(e.game_pk), play_id: e.play_id, play_url: e.play_url || null,
        season, game_date: e.game_date || null,
        batter_id: Number(e.batter_id), batter_name: e.batter_name || null,
        pitcher_id: Number(e.pitcher_id), pitcher_name: e.pitcher_name || null,
        result: e.result || null,
        exit_velocity: toNum(e.exit_velocity), launch_angle: toNum(e.launch_angle),
        hr_distance: toNum(e.hr_distance), hr_trot: toNum(e.hr_trot),
        hr_cat: e.hr_cat || null, hr_type: e.hr_type || null,
        parks: Object.fromEntries(PARK_COLUMNS.map(p => [p, e[p] === '1'])),
        last_synced_at: new Date().toISOString(),
      }))

      for (let i = 0; i < upsertRows.length; i += WRITE_CHUNK_SIZE) {
        const { error } = await admin.from('player_home_run_events')
          .upsert(upsertRows.slice(i, i + WRITE_CHUNK_SIZE), { onConflict: 'game_pk,play_id' })
        if (error) throw error
      }
    } catch (e: any) {
      console.error('[savant-hr-details] bulk write failed', e)
      writeFailed = e?.message || String(e)
    }
  }

  // Mark each player's own claim complete/error based on whether ITS fetch
  // succeeded AND the shared bulk write above landed — a batter with zero
  // home runs this recheck cycle legitimately returns an empty (successful)
  // events array, but if the write step failed, nothing actually persisted
  // for anyone in this batch, so no one should be marked 'complete'.
  const results: Record<string, { rows: number } | { error: string }> = {}
  const now = new Date().toISOString()
  const completeRows: { source: string; entity_type: string; entity_id: string; season: number; status: string; last_synced_at: string }[] = []
  const errorRows: { source: string; entity_type: string; entity_id: string; season: number; status: string }[] = []

  if (writeFailed) {
    for (const f of fetched) {
      results[f.idStr] = { error: f.error ?? writeFailed }
      errorRows.push({ source: SOURCE, entity_type: ENTITY_TYPE, entity_id: f.idStr, season, status: 'error' })
    }
    if (errorRows.length) await admin.from('sync_state').upsert(errorRows, { onConflict: 'source,entity_type,entity_id,season' })
    return { claimed: claimedIds.length, results }
  }

  for (const f of fetched) {
    if (f.error) {
      results[f.idStr] = { error: f.error }
      errorRows.push({ source: SOURCE, entity_type: ENTITY_TYPE, entity_id: f.idStr, season, status: 'error' })
    } else {
      results[f.idStr] = { rows: f.events.length }
      completeRows.push({ source: SOURCE, entity_type: ENTITY_TYPE, entity_id: f.idStr, season, status: 'complete', last_synced_at: now })
    }
  }

  if (completeRows.length) await admin.from('sync_state').upsert(completeRows, { onConflict: 'source,entity_type,entity_id,season' })
  if (errorRows.length) await admin.from('sync_state').upsert(errorRows, { onConflict: 'source,entity_type,entity_id,season' })

  return { claimed: claimedIds.length, results }
}
