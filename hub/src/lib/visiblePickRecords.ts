import type { SupabaseClient } from '@supabase/supabase-js'

export type VisiblePickRecord = { wins: number; losses: number; pushes: number }
type RecordAuthor = { id?: string | null; pick_record?: VisiblePickRecord | null }
type Authored = { author?: RecordAuthor | null }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_PROFILES = 100

function parseRecord(value: unknown): VisiblePickRecord | null | undefined {
  if (value === null) return null
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const row = value as Record<string, unknown>
  if (Object.keys(row).sort().join(',') !== 'losses,pushes,wins') return undefined
  const valid = (part: unknown): part is number => typeof part === 'number' && Number.isSafeInteger(part) && part >= 0 && part <= 999_999_999
  if (!valid(row.wins) || !valid(row.losses) || !valid(row.pushes)) return undefined
  return { wins: row.wins, losses: row.losses, pushes: row.pushes }
}

/** One viewer-scoped request for an entire result page; never cache results
 * across users. A failed or malformed response hides records, not the page. */
export async function fetchVisiblePickRecords(client: SupabaseClient, profileIds: readonly string[]): Promise<{ records: Map<string, VisiblePickRecord | null>; available: boolean }> {
  const ids = [...new Set(profileIds.filter(id => UUID.test(id)).map(id => id.toLowerCase()))]
  const empty = () => ({ records: new Map<string, VisiblePickRecord | null>(), available: false })
  if (!ids.length) return { records: new Map(), available: true }
  if (ids.length > MAX_PROFILES) return empty()
  try {
    const { data, error } = await client.rpc('get_visible_pick_records', { target_ids: ids }).abortSignal(AbortSignal.timeout(5000))
    if (error || !Array.isArray(data) || data.length > ids.length) return empty()
    const allowed = new Set(ids)
    const records = new Map<string, VisiblePickRecord | null>()
    for (const raw of data) {
      if (!raw || typeof raw !== 'object' || typeof raw.profile_id !== 'string' || !UUID.test(raw.profile_id)) return empty()
      const id = raw.profile_id.toLowerCase()
      const record = parseRecord(raw.pick_record)
      if (!allowed.has(id) || records.has(id) || record === undefined) return empty()
      records.set(id, record)
    }
    return { records, available: true }
  } catch { return empty() }
}

/** Replace any raw author record from upstream with the verified projection.
 * Original objects are not mutated; missing and hidden records remain null. */
export async function hydrateVisibleAuthorRecords<T extends Authored>(client: SupabaseClient, posts: readonly T[]): Promise<{ posts: T[]; available: boolean }> {
  const ids = posts.flatMap(post => typeof post.author?.id === 'string' ? [post.author.id] : [])
  const { records, available } = await fetchVisiblePickRecords(client, ids)
  return {
    posts: posts.map(post => {
      if (!post.author) return post
      const id = typeof post.author.id === 'string' ? post.author.id.toLowerCase() : ''
      return { ...post, author: { ...post.author, pick_record: records.get(id) ?? null } }
    }),
    available,
  }
}
