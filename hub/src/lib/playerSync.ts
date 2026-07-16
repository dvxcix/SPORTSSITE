import { createAdminClient } from '@/lib/supabase/admin'

export const MLB_SPORT_ID = 1
const STALE_CLAIM_MINUTES = 10

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
// maxDuration cap). Never-seeded players (no sync_state row at all) aren't
// picked up here — each cron seeds its own family's rows the first time a
// player's bio syncs successfully (see mlb-sync-bio).
export async function claimBatch(
  admin: AdminClient, entityType: string, season: number, batchSize: number
): Promise<ClaimedRow[]> {
  const staleBefore = new Date(Date.now() - STALE_CLAIM_MINUTES * 60_000).toISOString()
  const { data } = await admin
    .from('sync_state')
    .select('entity_id, season')
    .eq('source', 'mlb_stats_api')
    .eq('entity_type', entityType)
    .eq('season', season)
    .or(`status.eq.pending,status.eq.error,and(status.eq.claimed,claimed_at.lt.${staleBefore})`)
    .limit(batchSize)

  const rows = data ?? []
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
  const res = await fetch(url, { cache: 'no-store', headers: { 'User-Agent': 'SlipSurge/1.0' } })
  if (!res.ok) throw new Error(`MLB API ${res.status}: ${url}`)
  return res.json()
}
