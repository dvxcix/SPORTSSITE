import type { SupabaseClient } from '@supabase/supabase-js'

// Every id userId has blocked OR who has blocked userId — the two-way set
// content-listing surfaces (feed/search/comments/notifications) exclude, so
// a mutual "don't show us to each other" holds regardless of who blocked
// whom. Works with either the server or browser Supabase client — both
// share the same query-builder interface.
export class BlockLookupUnavailable extends Error {
  constructor() { super('Account visibility is temporarily unavailable'); this.name = 'BlockLookupUnavailable' }
}
export function isAccountId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}
/** A missing session is a normal guest; any other auth error is unknown. */
export function authVisibilityUnavailable(error: { name?: string } | null | undefined): boolean {
  return !!error && error.name !== 'AuthSessionMissingError'
}

export async function getBlockedEitherWayIds(supabase: SupabaseClient, userId: string): Promise<string[]> {
  if (!isAccountId(userId)) throw new BlockLookupUnavailable()
  userId = userId.toLowerCase()
  const ids = new Set<string>()
  // PostgREST's default response cap is 1000 rows. Every page is required:
  // treating a partial or failed lookup as an empty set exposes blocked users.
  for (let offset = 0; offset < 50_000; offset += 1000) {
    const { data, error } = await supabase.from('blocks').select('blocker_id, blocked_id')
      .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`)
      .order('blocker_id').order('blocked_id').range(offset, offset + 999)
    if (error || !Array.isArray(data)) throw new BlockLookupUnavailable()
    for (const row of data) {
      if (!row || typeof row.blocker_id !== 'string' || typeof row.blocked_id !== 'string' || !isAccountId(row.blocker_id) || !isAccountId(row.blocked_id)
        || (row.blocker_id !== userId && row.blocked_id !== userId)) throw new BlockLookupUnavailable()
      ids.add(row.blocker_id === userId ? row.blocked_id : row.blocker_id)
    }
    if (data.length < 1000) return [...ids]
  }
  throw new BlockLookupUnavailable()
}

// For a single pairwise check (profile view gate, DM thread gate) rather
// than fetching a whole viewer-scoped exclusion set.
export async function isBlockedEitherWay(supabase: SupabaseClient, userIdA: string, userIdB: string): Promise<boolean> {
  if (!isAccountId(userIdA) || !isAccountId(userIdB)) throw new BlockLookupUnavailable()
  userIdA = userIdA.toLowerCase(); userIdB = userIdB.toLowerCase()
  const { data, error } = await supabase.from('blocks').select('blocker_id, blocked_id')
    .or(`and(blocker_id.eq.${userIdA},blocked_id.eq.${userIdB}),and(blocker_id.eq.${userIdB},blocked_id.eq.${userIdA})`)
    .limit(1)
  if (error || !Array.isArray(data)) throw new BlockLookupUnavailable()
  if (data.some(row => !row || !((row.blocker_id === userIdA && row.blocked_id === userIdB) || (row.blocker_id === userIdB && row.blocked_id === userIdA)))) throw new BlockLookupUnavailable()
  return data.length > 0
}

// Client-side action wired next to Report — inserts the block row, then
// best-effort removes any existing follow relationship in BOTH directions
// (mirrors FollowButton's own .delete().match() pattern), matching every
// mainstream social app: blocking someone also unfollows them either way.
export async function blockUser(supabase: SupabaseClient, blockerId: string, blockedId: string): Promise<{ ok: boolean; error?: string }> {
  if (!blockerId || !blockedId || blockerId === blockedId) return { ok: false, error: 'Could not block this account.' }
  const { error } = await supabase.rpc('set_account_block', { p_target_id: blockedId, p_blocked: true })
  return error ? { ok: false, error: 'Could not block this account.' } : { ok: true }
}

export async function unblockUser(supabase: SupabaseClient, blockerId: string, blockedId: string): Promise<{ ok: boolean; error?: string }> {
  if (!blockerId || !blockedId || blockerId === blockedId) return { ok: false, error: 'Could not unblock this account.' }
  const { error } = await supabase.rpc('set_account_block', { p_target_id: blockedId, p_blocked: false })
  return error ? { ok: false, error: 'Could not unblock this account.' } : { ok: true }
}
