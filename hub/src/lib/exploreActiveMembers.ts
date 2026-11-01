import type { SupabaseClient } from '@supabase/supabase-js'
import { authVisibilityUnavailable, getBlockedEitherWayIds } from './blocks'

export type ExploreUser = {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  avatar_ring_style: 'none' | 'solid' | 'surge' | 'pulse' | 'orbit' | null
  avatar_ring_color: string | null
  is_verified: boolean
  account_type: string
  follower_count: number
}

const PUBLIC_EXPLORE_FIELDS = 'id, username, display_name, avatar_url, avatar_ring_style, avatar_ring_color, is_verified, account_type, follower_count'
const MAX_SPOTLIGHT = 4
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Spotlight selection uses only public fields under the viewer's RLS. It does
// not filter on private membership state, so appearing here does not reveal it.
export async function exploreSpotlightMembers(
  viewer: SupabaseClient,
  creator: boolean,
): Promise<ExploreUser[]> {
  try {
    let query = viewer.from('users').select(PUBLIC_EXPLORE_FIELDS)
    query = creator ? query.eq('account_type', 'creator') : query.neq('account_type', 'creator')
    const { data, error } = await query.order('follower_count', { ascending: false }).limit(MAX_SPOTLIGHT)
    if (error || !Array.isArray(data) || data.length > MAX_SPOTLIGHT) throw new Error('Invalid spotlight response')
    const ids = data.map(row => row.id)
    if (ids.some(id => typeof id !== 'string' || !uuid.test(id)) || new Set(ids).size !== ids.length) throw new Error('Invalid spotlight identities')
    return data as ExploreUser[]
  } catch {
    console.warn('[explore] Recommendations are temporarily unavailable')
    return []
  }
}

// A block applies in both directions. If session or block state is unknown,
// omit the spotlight rather than disclose a member the viewer cannot see.
export async function visibleExploreSpotlights(
  viewer: SupabaseClient,
  userId: string | null,
  authError: { name?: string } | null | undefined,
  lists: [ExploreUser[], ExploreUser[]],
): Promise<[ExploreUser[], ExploreUser[]]> {
  if (authVisibilityUnavailable(authError)) return [[], []]
  if (!userId) return lists
  try {
    const blocked = new Set(await getBlockedEitherWayIds(viewer, userId))
    return lists.map(list => list.filter(user => !blocked.has(user.id.toLowerCase()))) as [ExploreUser[], ExploreUser[]]
  } catch {
    console.warn('[explore] Recommendation visibility is temporarily unavailable')
    return [[], []]
  }
}
