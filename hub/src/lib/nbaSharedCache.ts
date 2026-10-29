import 'server-only'
import { randomUUID } from 'node:crypto'
import { createAdminClient } from './supabase/admin'

export type NbaCached<T> = { value: T; fetchedAt: string; stale: boolean }
type CacheResult<T> = { cached: NbaCached<T>; expires: number }
type Entry<T> = { payload: T | null; fetched_at: string | null; expires_at: string | null; lease_token?: string | null; lease_until?: string | null }
type Metadata = Omit<Entry<unknown>, 'payload'>
const local = new Map<string, { cached: NbaCached<unknown>; until: number; expires: number; bytes: number }>()
let localBytes = 0
const maxLocalBytes = 32 * 1024 * 1024
const inFlight = new Map<string, Promise<CacheResult<unknown>>>()
const failures = new Map<string, { until: number; error: Error }>()
const failureBackoffMs = 15_000
/** A database lease coalesces refreshes across serverless instances, not just a process. */
export async function nbaSharedCache<T>(key: string, ttl: number, staleSeconds: number, load: () => Promise<T>, leaseSeconds = 55): Promise<NbaCached<T>> {
  // Different freshness policies may share the public source and lease, but
  // never an in-flight stale fallback or a longer-lived memory entry.
  const memoryKey = `${ttl}:${staleSeconds}:${key}`
  const hit = local.get(memoryKey)
  if (hit && hit.until > Date.now()) { local.delete(memoryKey); local.set(memoryKey,hit); return hit.cached as NbaCached<T> }
  // Keep the last verified payload beyond its short L1 hit window so a brief
  // database outage does not hide otherwise usable data. Its original expiry
  // and this caller's stale allowance remain the hard boundary.
  if (hit && hit.expires + staleSeconds * 1000 <= Date.now()) { local.delete(memoryKey); localBytes -= hit.bytes }
  const fallback = (): NbaCached<T> | null => {
    const prior = local.get(memoryKey)
    if (!prior || prior.expires + staleSeconds * 1000 <= Date.now()) return null
    return { ...prior.cached, stale: prior.expires <= Date.now() } as NbaCached<T>
  }
  const pending = inFlight.get(memoryKey)
  if (pending) {
    try { return (await pending).cached as NbaCached<T> }
    catch (error) { const retained = fallback(); if (retained) return retained; throw error }
  }
  const failed = failures.get(memoryKey)
  if (failed && failed.until > Date.now()) { const retained = fallback(); if (retained) return retained; throw failed.error }
  failures.delete(memoryKey)
  const task = readSharedCache(key, ttl, staleSeconds, load, leaseSeconds)
  inFlight.set(memoryKey, task)
  try {
    const { cached, expires } = await task
    const bytes = Buffer.byteLength(JSON.stringify(cached.value) ?? '')
    // A successful newer result supersedes the old local snapshot even when
    // the new payload is too large for L1; never revive the older one later.
    const previous = local.get(memoryKey)
    if (previous) { local.delete(memoryKey); localBytes -= previous.bytes }
    if (bytes <= maxLocalBytes) {
      local.set(memoryKey, { cached, bytes, expires, until: Math.min(Date.now() + (cached.stale ? 1000 : 10000), expires + (cached.stale ? staleSeconds * 1000 : 0)) })
      localBytes += bytes
      while (local.size > 256 || localBytes > maxLocalBytes) {
        const oldest = local.keys().next().value!, evicted = local.get(oldest)!
        local.delete(oldest); localBytes -= evicted.bytes
      }
    }
    return cached
  } catch (error) {
    failures.set(memoryKey, { until: Date.now() + failureBackoffMs, error: error instanceof Error ? error : new Error('NBA source temporarily unavailable') })
    while (failures.size > 128) failures.delete(failures.keys().next().value!)
    const retained = fallback()
    if (retained) return retained
    throw error
  } finally { if (inFlight.get(memoryKey) === task) inFlight.delete(memoryKey) }
}
async function readSharedCache<T>(key: string, ttl: number, staleSeconds: number, load: () => Promise<T>, leaseSeconds: number): Promise<CacheResult<T>> {
  const admin = createAdminClient()
  const read = async () => {
    // An explicit fresh signal opts this read out of Next's render-pass GET
    // memoization, so post-commit reads and lease followers can see new rows.
    const { data, error } = await admin.from('nba_source_cache').select('payload,fetched_at,expires_at,lease_token,lease_until').eq('key', key).abortSignal(AbortSignal.timeout(12_000)).maybeSingle()
    if (error) throw new Error('NBA shared cache unavailable')
    return data as Entry<T> | null
  }
  const readMetadata = async () => {
    // Followers need the payload only after a new observation can be fresh.
    // Select no payload here: an expired slate may be several megabytes.
    const { data, error } = await admin.from('nba_source_cache').select('fetched_at,expires_at,lease_token,lease_until').eq('key', key).abortSignal(AbortSignal.timeout(12_000)).maybeSingle()
    if (error) throw new Error('NBA shared cache unavailable')
    return data as Metadata | null
  }
  const expiry = (entry: Metadata | null): number | null => {
    if (!entry?.fetched_at || !entry.expires_at || !Number.isFinite(Date.parse(entry.fetched_at)) || !Number.isFinite(Date.parse(entry.expires_at))) return null
    return Math.min(Date.parse(entry.expires_at), Date.parse(entry.fetched_at) + ttl * 1000)
  }
  const usable = (entry: Entry<T> | null, stale = false): CacheResult<T> | null => {
    const expires = expiry(entry)
    if (entry?.payload == null || !entry.fetched_at || expires == null || expires + (stale ? staleSeconds * 1000 : 0) <= Date.now()) return null
    return { cached: { value: entry.payload, fetchedAt: entry.fetched_at, stale: expires <= Date.now() }, expires }
  }
  const prior = await read(), fresh = usable(prior)
  if (fresh) return fresh
  // A released token with a future lease is a shared failure cooldown. Keep
  // the prior payload intact, but do not let every viewer retry a failing feed.
  const coolingDown = (entry: Metadata | null) => !entry?.lease_token && Date.parse(entry?.lease_until ?? '') > Date.now()
  if (coolingDown(prior)) {
    const fallback = usable(prior, true)
    if (fallback) return fallback
    throw new Error('NBA source temporarily unavailable; retry shortly')
  }
  const token = randomUUID()
  const { data: claimed, error } = await admin.rpc('claim_nba_source', { p_key: key, p_token: token, p_seconds: leaseSeconds })
  if (error) throw new Error('NBA shared refresh unavailable')
  if (claimed) {
    try {
      // Another owner may have committed between our initial read and claim.
      // Release our token without extending that observation's freshness.
      const completed = usable(await read())
      if (completed) {
        await admin.from('nba_source_cache').update({ lease_token: null, lease_until: null }).eq('key', key).eq('lease_token', token)
        return completed
      }
      const value = await load()
      const { data: saved, error: writeError } = await admin.rpc('finish_nba_source', { p_key: key, p_token: token, p_payload: value, p_ttl: ttl })
      if (writeError || !saved) throw new Error('NBA shared refresh could not commit')
      const result = usable(await read())
      if (!result) throw new Error('NBA shared refresh missing')
      return result
    } catch (failure) {
      await admin.from('nba_source_cache').update({ lease_token: null, lease_until: new Date(Date.now() + failureBackoffMs).toISOString() }).eq('key', key).eq('lease_token', token)
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
  const budget = Math.min(45000, Math.max(1000, leaseSeconds * 1000 - 5000)), started = Date.now()
  for (let attempt = 0, waited = 0; waited < budget && Date.now() - started < budget; attempt++) {
    const delay = Math.min(500 * 2 ** Math.min(attempt, 3), budget - waited)
    await new Promise(resolve => setTimeout(resolve, delay)); waited += delay
    const metadata = await readMetadata(), expires = expiry(metadata)
    if (expires != null && expires > Date.now()) {
      // Metadata and payload are separate reads. Revalidate the complete row:
      // the owner may expire, replace, or fail between the two requests.
      const entry = await read(), result = usable(entry)
      if (result) return result
      if (coolingDown(entry)) throw new Error('NBA source temporarily unavailable; retry shortly')
    } else if (coolingDown(metadata)) throw new Error('NBA source temporarily unavailable; retry shortly')
  }
  throw new Error('NBA research is warming; retry shortly')
}
