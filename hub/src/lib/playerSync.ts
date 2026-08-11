import { createAdminClient } from '@/lib/supabase/admin'

export const MLB_SPORT_ID = 1
const STALE_CLAIM_MINUTES = 10
// Confirmed live (2026-07-30): claimBatch never re-selected a row once it
// reached 'mlb_complete', regardless of age — nearly the entire league's
// player_season_stats_*/player_career_stats_*/bio froze mid-July, since a
// real player's stats obviously keep changing every day they play but
// nothing here ever asked MLB's API again after the first successful pull.
// Mirrors the recheck-complete pattern already proven in
// savantHrDetailsSync.ts/savantPitchArsenalSync.ts — the family name here
// is 'mlb_complete' rather than 'complete', same idea.
const RECHECK_COMPLETE_HOURS = 20

// MLB Stats API returns most rate stats (avg/obp/era/whip/etc.) as strings
// (".248", "3.09", "75.2") and counting stats as plain numbers — this
// normalizes either to a real number, or null for anything unparseable.
export function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : null
}

export function currentSeason(): number {
  return new Date().getFullYear()
}

type AdminClient = ReturnType<typeof createAdminClient>
type ClaimedRow = { entity_id: string; season: number }

// Claims up to `batchSize` sync_state rows needing (re)work for one sync
// family: 'pending', 'error', or 'claimed' rows whose claim went stale (the
// claiming process died mid-run, e.g. a Vercel invocation that hit the
// maxDuration cap), or 'mlb_complete' rows overdue for a routine recheck.
// Never-seeded players (no sync_state row at all) aren't picked up here —
// each cron seeds its own family's rows the first time a player's bio
// syncs successfully (see mlb-sync-bio).
//
// Two separate queries, not one combined `.or()` — priority (pending/
// error/stale-claimed) rows are fetched FIRST and always fill the batch
// before any recheck rows are considered. A single combined query with no
// ordering leaves it to Postgres's scan order which rows land in the
// LIMIT, and a large recheck backlog (routinely thousands of rows here)
// can starve out a much smaller number of genuinely broken/never-synced
// rows indefinitely — confirmed live in the separate
// savant-sync-pitch-arsenal-details job, where exactly this pattern left
// 400 rows permanently stuck in 'claimed' after a crashed run, because
// ~2,800 due-for-recheck rows always filled the batch first.
export async function claimBatch(
  admin: AdminClient, entityType: string, season: number, batchSize: number
): Promise<ClaimedRow[]> {
  const staleBefore = new Date(Date.now() - STALE_CLAIM_MINUTES * 60_000).toISOString()
  const recheckBefore = new Date(Date.now() - RECHECK_COMPLETE_HOURS * 60 * 60_000).toISOString()

  const { data: priorityRows } = await admin
    .from('sync_state')
    .select('entity_id, season')
    .eq('source', 'mlb_stats_api')
    .eq('entity_type', entityType)
    .eq('season', season)
    .or(`status.eq.pending,status.eq.error,and(status.eq.claimed,claimed_at.lt.${staleBefore})`)
    .limit(batchSize)

  const rows: ClaimedRow[] = [...(priorityRows ?? [])]
  if (rows.length < batchSize) {
    const { data: recheckRows } = await admin
      .from('sync_state')
      .select('entity_id, season')
      .eq('source', 'mlb_stats_api')
      .eq('entity_type', entityType)
      .eq('season', season)
      .eq('status', 'mlb_complete')
      .lt('last_synced_at', recheckBefore)
      .limit(batchSize - rows.length)
    rows.push(...(recheckRows ?? []))
  }

  if (!rows.length) return []

  await admin.from('sync_state').upsert(
    rows.map(r => ({
      source: 'mlb_stats_api', entity_type: entityType, entity_id: r.entity_id, season: r.season,
      status: 'claimed', claimed_at: new Date().toISOString(),
    })),
    { onConflict: 'source,entity_type,entity_id,season' }
  )
  return rows
}

// Marks one claimed row done or failed. On success, stamps last_synced_at;
// on error, deliberately omits it so a previous successful sync's timestamp
// isn't wiped out by a later transient failure.
export async function markSyncState(
  admin: AdminClient, entityType: string, entityId: string, season: number,
  status: 'mlb_complete' | 'error'
) {
  const patch: Record<string, unknown> = {
    source: 'mlb_stats_api', entity_type: entityType, entity_id: entityId, season, status,
  }
  if (status === 'mlb_complete') patch.last_synced_at = new Date().toISOString()
  await admin.from('sync_state').upsert(patch, { onConflict: 'source,entity_type,entity_id,season' })
}

// Seeds a 'pending' row for a sync family if one doesn't already exist —
// `ignoreDuplicates` means an existing row (already synced, or mid-progress)
// is left completely untouched rather than reset back to pending.
export async function seedPending(admin: AdminClient, entityType: string, entityId: string, season: number) {
  await admin.from('sync_state').upsert(
    { source: 'mlb_stats_api', entity_type: entityType, entity_id: entityId, season, status: 'pending' },
    { onConflict: 'source,entity_type,entity_id,season', ignoreDuplicates: true }
  )
}

export async function fetchMlbJson(url: string): Promise<any> {
  const res = await fetch(url, { cache: 'no-store', headers: { 'User-Agent': 'SlipSurge/1.0' }, signal: AbortSignal.timeout(20_000) })
  if (!res.ok) throw new Error(`MLB API ${res.status}: ${url}`)
  return res.json()
}
