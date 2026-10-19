import 'server-only'
import { randomUUID } from 'node:crypto'
import { createAdminClient } from './supabase/admin'

export type NbaCached<T> = { value: T; fetchedAt: string; stale: boolean }
type Entry<T> = { payload: T | null; fetched_at: string | null; expires_at: string | null }
const local = new Map<string, { cached: NbaCached<unknown>; until: number }>()
const inFlight = new Map<string, Promise<NbaCached<unknown>>>()
/** A database lease coalesces refreshes across serverless instances, not just a process. */
export async function nbaSharedCache<T>(key: string, ttl: number, staleSeconds: number, load: () => Promise<T>, leaseSeconds = 55): Promise<NbaCached<T>> {
  const hit = local.get(key)
  if (hit && hit.until > Date.now()) return hit.cached as NbaCached<T>
  const pending = inFlight.get(key)
  if (pending) return pending as Promise<NbaCached<T>>
  const task = readSharedCache(key, ttl, staleSeconds, load, leaseSeconds)
  inFlight.set(key, task)
  try {
    const cached = await task
    if (!cached.stale) {
      local.delete(key)
      local.set(key, { cached, until: Math.min(Date.now() + 10000, Date.parse(cached.fetchedAt) + ttl * 1000) })
      while (local.size > 24) local.delete(local.keys().next().value!)
    }
    return cached
  } finally { if (inFlight.get(key) === task) inFlight.delete(key) }
}
async function readSharedCache<T>(key: string, ttl: number, staleSeconds: number, load: () => Promise<T>, leaseSeconds: number): Promise<NbaCached<T>> {
  const admin = createAdminClient()
  const read = async () => {
    // An explicit fresh signal opts this read out of Next's render-pass GET
    // memoization, so post-commit reads and lease followers can see new rows.
    const { data, error } = await admin.from('nba_source_cache').select('payload,fetched_at,expires_at').eq('key', key).abortSignal(AbortSignal.timeout(12_000)).maybeSingle()
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
  // A cold board can legitimately need several sequential stat pages. Followers
  // wait within the route budget instead of failing after twelve seconds while
  // the shared owner is still healthy. Short game leases retain a shorter cap.
  const attempts=Math.floor(Math.min(45000,Math.max(1000,leaseSeconds*1000-5000))/500)
  for (let attempt = 0; attempt < attempts; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 500))
    const result = usable(await read())
    if (result) return result
  }
  throw new Error('NBA research is warming; retry shortly')
}
