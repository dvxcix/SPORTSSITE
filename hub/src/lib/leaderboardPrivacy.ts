import type { SupabaseClient } from '@supabase/supabase-js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const BATCH_SIZE = 10_000
const MAX_CANDIDATES = 50_000

/** Filter a shared ranking against current public privacy settings. Never
 * cache this result: an unavailable, malformed or incomplete response must
 * hide the ranking rather than expose a previously public record. */
export async function currentPublicLeaderboard<T extends { id: string }>(client: SupabaseClient, ranked: readonly T[]): Promise<{ users: T[]; available: boolean }> {
  const unavailable = () => ({ users: [] as T[], available: false })
  if (ranked.length === 0) return { users: [], available: true }
  if (ranked.length > MAX_CANDIDATES || ranked.some(row => !UUID.test(row.id))) return unavailable()
  const ids = ranked.map(row => row.id.toLowerCase())
  const candidates = new Set(ids)
  if (candidates.size !== ids.length) return unavailable()
  try {
    const eligible = new Set<string>()
    // Sequential bounded batches avoid per-user queries and concurrency spikes.
    // Never return partial results if any privacy check fails.
    for (let offset = 0; offset < ids.length; offset += BATCH_SIZE) {
      const batch = ids.slice(offset, offset + BATCH_SIZE)
      const batchIds = new Set(batch)
      const { data, error } = await client.rpc('get_current_public_leaderboard_ids', { target_ids: batch }).abortSignal(AbortSignal.timeout(5000))
      if (error || !Array.isArray(data) || data.length > batch.length) return unavailable()
      for (const value of data) {
        if (typeof value !== 'string' || !UUID.test(value)) return unavailable()
        const id = value.toLowerCase()
        if (!batchIds.has(id) || eligible.has(id)) return unavailable()
        eligible.add(id)
      }
    }
    return { users: ranked.filter(row => eligible.has(row.id.toLowerCase())), available: true }
  } catch { return unavailable() }
}
