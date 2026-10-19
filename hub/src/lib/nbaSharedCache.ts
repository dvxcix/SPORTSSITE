import 'server-only'
import { randomUUID } from 'node:crypto'
import { createAdminClient } from './supabase/admin'

export type NbaCached<T> = { value: T; fetchedAt: string; stale: boolean }
type Entry<T> = { payload: T | null; fetched_at: string | null; expires_at: string | null }
/** A database lease coalesces refreshes across serverless instances, not just a process. */
export async function nbaSharedCache<T>(key: string, ttl: number, staleSeconds: number, load: () => Promise<T>, leaseSeconds = 55): Promise<NbaCached<T>> {
  const admin = createAdminClient()
  const read = async () => {
    const { data, error } = await admin.from('nba_source_cache').select('payload,fetched_at,expires_at').eq('key', key).maybeSingle()
    if (error) throw new Error('NBA shared cache unavailable')
    return data as Entry<T> | null
  }
  const usable = (entry: Entry<T> | null, stale = false): NbaCached<T> | null => {
    if (!entry?.payload || !entry.fetched_at || !entry.expires_at) return null
    if (Date.parse(entry.expires_at) + (stale ? staleSeconds * 1000 : 0) <= Date.now()) return null
    return { value: entry.payload, fetchedAt: entry.fetched_at, stale: Date.parse(entry.expires_at) <= Date.now() }
  }
  const prior = await read(), fresh = usable(prior)
  if (fresh) return fresh
  const token = randomUUID()
  const { data: claimed, error } = await admin.rpc('claim_nba_source', { p_key: key, p_token: token, p_seconds: leaseSeconds })
  if (error) throw new Error('NBA shared refresh unavailable')
  if (claimed) {
    try {
      const value = await load()
      const { data: saved, error: writeError } = await admin.rpc('finish_nba_source', { p_key: key, p_token: token, p_payload: value, p_ttl: ttl })
      if (writeError || !saved) throw new Error('NBA shared refresh could not commit')
      const result = usable(await read())
      if (!result) throw new Error('NBA shared refresh missing')
      return result
    } catch (failure) {
      await admin.from('nba_source_cache').update({ lease_token: null, lease_until: null }).eq('key', key).eq('lease_token', token)
      const fallback = usable(prior, true)
      if (fallback) return fallback
      throw failure
    }
  }
  const fallback = usable(prior, true)
  if (fallback) return fallback
  // Cold followers wait for the owner; they never fan out provider requests.
  for (let attempt = 0; attempt < 24; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 500))
    const result = usable(await read())
    if (result) return result
  }
  throw new Error('NBA research is warming; retry shortly')
}
