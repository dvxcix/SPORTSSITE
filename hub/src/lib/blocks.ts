import type { SupabaseClient } from '@supabase/supabase-js'

// Every id userId has blocked OR who has blocked userId — the two-way set
// content-listing surfaces (feed/search/comments/notifications) exclude, so
// a mutual "don't show us to each other" holds regardless of who blocked
// whom. Works with either the server or browser Supabase client — both
// share the same query-builder interface.
export async function getBlockedEitherWayIds(supabase: SupabaseClient, userId: string): Promise<string[]> {
  const { data } = await supabase.from('blocks').select('blocker_id, blocked_id')
    .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`)
  const ids = new Set<string>()
  for (const row of (data ?? []) as any[]) {
    ids.add(row.blocker_id === userId ? row.blocked_id : row.blocker_id)
  }
  return [...ids]
}

// For a single pairwise check (profile view gate, DM thread gate) rather
// than fetching a whole viewer-scoped exclusion set.
export async function isBlockedEitherWay(supabase: SupabaseClient, userIdA: string, userIdB: string): Promise<boolean> {
  const { data } = await supabase.from('blocks').select('blocker_id')
    .or(`and(blocker_id.eq.${userIdA},blocked_id.eq.${userIdB}),and(blocker_id.eq.${userIdB},blocked_id.eq.${userIdA})`)
    .limit(1)
  return !!data?.length
}

// Client-side action wired next to Report — inserts the block row, then
// best-effort removes any existing follow relationship in BOTH directions
// (mirrors FollowButton's own .delete().match() pattern), matching every
// mainstream social app: blocking someone also unfollows them either way.
export async function blockUser(supabase: SupabaseClient, blockerId: string, blockedId: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('blocks').insert({ blocker_id: blockerId, blocked_id: blockedId })
  // A duplicate-key error just means the block already existed — not a real
  // failure (same reasoning as FollowButton's own 23505 handling).
  if (error && error.code !== '23505') return { ok: false, error: error.message }
  await Promise.all([
    supabase.from('follows').delete().match({ follower_id: blockerId, following_id: blockedId }),
    supabase.from('follows').delete().match({ follower_id: blockedId, following_id: blockerId }),
  ])
  return { ok: true }
}

export async function unblockUser(supabase: SupabaseClient, blockerId: string, blockedId: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('blocks').delete().match({ blocker_id: blockerId, blocked_id: blockedId })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
