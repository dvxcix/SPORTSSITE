import 'server-only'
import { createAdminClient } from './supabase/admin'
import { nbaValidPublicControl, type NbaPublicControl } from './nbaPublicCaptureControl'

/** No L1/Next cache: the context lease holder must see another instance's final
 * result before it can start a paid browser. Missing/failed reads fail closed. */
export async function readNbaPublicControls(keys: string[]): Promise<Map<string, NbaPublicControl>> {
  const unique = [...new Set(keys)]
  if (!unique.length || unique.length > 100 || unique.some(key => !/^public-(?:context-)?control:v1:/.test(key))) throw new Error('Invalid public control keys')
  const { data, error } = await createAdminClient().from('nba_source_cache').select('key,payload')
    .in('key', unique).limit(unique.length + 1).abortSignal(AbortSignal.timeout(5000))
  if (error || !Array.isArray(data) || data.length > unique.length) throw new Error('Public capture controls unavailable')
  const controls = new Map<string, NbaPublicControl>()
  for (const row of data) {
    if (!unique.includes(row.key) || controls.has(row.key) || !nbaValidPublicControl(row.payload)) throw new Error('Public capture controls invalid')
    controls.set(row.key, row.payload)
  }
  return controls
}

/** Control timestamps describe attempts only; they never enter market history. */
export async function saveNbaPublicControl(key: string, payload: NbaPublicControl): Promise<void> {
  if (!/^public-(?:context-)?control:v1:/.test(key) || !nbaValidPublicControl(payload)) throw new Error('Invalid public capture control')
  const { data, error } = await createAdminClient().from('nba_source_cache').upsert({
    key, payload, fetched_at: payload.attemptedAt,
    // Keep cooldown history through the game even when shared-cache pruning runs.
    expires_at: new Date(Date.parse(payload.attemptedAt) + 7 * 86400_000).toISOString(), lease_token: null, lease_until: null,
  }, { onConflict: 'key' }).select('key').abortSignal(AbortSignal.timeout(5000))
  if (error || !Array.isArray(data) || data.length !== 1 || data[0].key !== key) throw new Error('Public capture control could not save')
}
