import { createAdminClient } from '@/lib/supabase/admin'

type AdminClient = ReturnType<typeof createAdminClient>

// The per-play drill-down behind each (player, pitch_type) row on
// /leaderboard/pitch-arsenal-stats — confirmed live via the page's own
// client bundle, which calls this on row-expand as
// `GET /leaderboard/pitch-arsenal-stats?details=true&player_id=<id>&year=<y>&min_ab=1&type=batter|pitcher&pitchType=<pt>`.
// Returns one row per plate-appearance-ending event where that pitch type
// was the final pitch (row count matches the aggregate leaderboard's `pa`
// column for that combo, not the raw `pitches` count) — pitcher, batter,
// game date, event outcome, and the pitch speed of that specific pitch.
// Syncing only the PITCHER side is sufficient for full coverage: every
// real pitch has a real pitcher, and every rostered pitcher who's thrown
// at least 1 qualifying pitch already appears in the pitcher-side
// aggregate leaderboard (min=1) — so the ~3,170 pitcher x pitch_type combos
// cover the same universe of plays the ~4,750 batter x pitch_type combos
// would, just with fewer requests. Each row already carries both
// batter_id/name and pitcher_id/name, so a batter's "history vs this pitch
// type" view is just `WHERE batter_id = X AND pitch_type = Y`, no separate
// batter-side fetch needed.
async function fetchPitchArsenalDetails(playerId: number, pitchType: string, season: number): Promise<any[]> {
  const url = `https://baseballsavant.mlb.com/leaderboard/pitch-arsenal-stats?details=true&player_id=${playerId}&year=${season}&min_ab=1&type=pitcher&pitchType=${pitchType}`
  const res = await fetch(url, {
    cache: 'no-store',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json,text/plain,*/*',
    },
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Savant pitch-arsenal details ${res.status}: player ${playerId} pitch ${pitchType} :: ${text.slice(0, 300)}`)
  try {
    const parsed = JSON.parse(text)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    console.error('[savant-pitch-arsenal-details] unparseable response', { playerId, pitchType, preview: text.slice(0, 300) })
    return []
  }
}

const SOURCE = 'savant_pitch_arsenal_details'
const ENTITY_TYPE = 'pitch_arsenal_combo'
const STALE_CLAIM_MINUTES = 20
// Real-world test before committing to a number: 80 mixed (player, pitch_type)
// combos completed in 4s at concurrency 20, avg ~59KB/response (larger
// payloads than HR-details, since some combos carry hundreds of PAs) — so
// this uses a smaller per-tick batch and concurrency than HR-details to
// stay comfortably inside the 60s cap while still clearing the ~3,170-combo
// backlog in a handful of ticks.
const BATCH_SIZE = 400
const FETCH_CONCURRENCY = 25
const WRITE_CHUNK_SIZE = 500
const RECHECK_COMPLETE_HOURS = 20

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

function parseCombo(entityId: string): { mlbId: number; pitchType: string } {
  const [mlbId, pitchType] = entityId.split(':')
  return { mlbId: Number(mlbId), pitchType }
}

// Seeds a 'pending' claim row for every (pitcher, pitch_type) combo already
// in the aggregate leaderboard (`syncPitchArsenalStats`, category
// 'pitch_arsenal_stats', role 'pitcher') — reusing that already-synced
// combo list rather than re-deriving it. `ignoreDuplicates` leaves an
// already-seeded combo (mid-progress or complete) untouched.
async function seedPendingCombos(admin: AdminClient, season: number) {
  // player_statcast_splits has no `season` column — season is implicit via
  // date_start/date_end, not a literal column (unlike
  // player_statcast_hitting_season/pitching_season). Filtering on `.eq('season', ...)`
  // here fails outright (real Postgres error), and this destructured only
  // `data`, silently discarding `error` — so the seed step failed instantly
  // and quietly every single run, leaving sync_state completely empty.
  const { data: rows, error } = await admin
    .from('player_statcast_splits')
    .select('mlb_id, dims')
    .eq('category', 'pitch_arsenal_stats').eq('role', 'pitcher').eq('window_type', 'season')

  if (error) {
    console.error('[savant-pitch-arsenal-details] seed query failed', error)
    return
  }

  const combos = (rows ?? [])
    .map(r => ({ mlbId: r.mlb_id as number, pitchType: (r.dims as any)?.pitch_type as string | undefined }))
    .filter((c): c is { mlbId: number; pitchType: string } => !!c.pitchType)

  if (!combos.length) return

  await admin.from('sync_state').upsert(
    combos.map(c => ({
      source: SOURCE, entity_type: ENTITY_TYPE, entity_id: `${c.mlbId}:${c.pitchType}`, season, status: 'pending',
    })),
    { onConflict: 'source,entity_type,entity_id,season', ignoreDuplicates: true }
  )
}

export async function syncPitchArsenalDetailBatch(admin: AdminClient, season: number) {
  await seedPendingCombos(admin, season)

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

  // Fetch every claimed combo concurrently, then write everything in one
  // bulk pass — same lesson learned from the HR-details sync: the fetches
  // are cheap, per-row sequential Supabase writes are what actually costs
  // time.
  const fetched = await mapWithConcurrency(claimedIds, FETCH_CONCURRENCY, async idStr => {
    const { mlbId, pitchType } = parseCombo(idStr)
    try {
      return { idStr, events: await fetchPitchArsenalDetails(mlbId, pitchType, season), error: null as string | null }
    } catch (e: any) {
      console.error('[savant-pitch-arsenal-details] combo fetch failed', idStr, e)
      return { idStr, events: [] as any[], error: e?.message || String(e) }
    }
  })

  const allEvents = fetched.flatMap(f => f.events)

  let writeFailed: string | null = null
  if (allEvents.length) {
    try {
      // Every batter faced needs at least a stub `players` row — the
      // pitcher already has one (that's how combos were seeded from the
      // pitcher-side leaderboard), but a batter who hasn't synced via
      // mlb-sync-bio yet would otherwise fail the FK on
      // player_pitch_arsenal_events.batter_id.
      const batterStubs = new Map<number, string>()
      for (const e of allEvents) {
        const bid = Number(e.batter_id)
        if (bid && !batterStubs.has(bid)) batterStubs.set(bid, e.batter_name || `Player ${bid}`)
      }
      await admin.from('players').upsert(
        Array.from(batterStubs, ([mlb_id, full_name]) => ({ mlb_id, full_name })),
        { onConflict: 'mlb_id', ignoreDuplicates: true }
      )

      // `play_id` is globally unique per real MLB play regardless of which
      // (player, pitch_type) combo surfaced it, so this is a real dedup key
      // even across overlapping/re-checked combos.
      const upsertRows = allEvents.filter(e => e.play_id).map(e => ({
        play_id: e.play_id, season, game_date: e.game_date || null,
        pitcher_id: Number(e.pitcher_id), pitcher_name: e.pitcher_name || null,
        batter_id: Number(e.batter_id), batter_name: e.batter_name || null,
        pitch_type: e.api_pitch_type_merged || null, pitch_name: e.pitch_name || null,
        pitch_speed: e.pitch_speed ? Number(e.pitch_speed) : null,
        event_type: e.event_type || null,
        outs: e.outs !== undefined && e.outs !== '' ? Number(e.outs) : null,
        pre_strike_count: e.pre_strike_count !== undefined && e.pre_strike_count !== '' ? Number(e.pre_strike_count) : null,
        raw: e,
        last_synced_at: new Date().toISOString(),
      }))

      for (let i = 0; i < upsertRows.length; i += WRITE_CHUNK_SIZE) {
        const { error } = await admin.from('player_pitch_arsenal_events')
          .upsert(upsertRows.slice(i, i + WRITE_CHUNK_SIZE), { onConflict: 'play_id' })
        if (error) throw error
      }
    } catch (e: any) {
      console.error('[savant-pitch-arsenal-details] bulk write failed', e)
      writeFailed = e?.message || String(e)
    }
  }

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
