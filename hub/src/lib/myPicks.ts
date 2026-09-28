import { createClient } from '@/lib/supabase/client'
import type { Post } from '@/lib/supabase/types'

const POST_WITH_AUTHOR = `*, author:users!posts_author_id_fkey(id,username,display_name,avatar_url,avatar_ring_style,avatar_ring_color,bio,follower_count,is_verified,account_type,pick_record,tier,beta_access_active)`

// The user's own pick/parlay posts — deliberately NOT capped at 20 and NOT
// filtered to visibility:'public' like the profile feed is, since a
// private/subscriber-only pick you posted is still yours to track here.
export async function fetchMyPicks(userId: string, view: 'active' | 'history' = 'active', limit = 50): Promise<Post[]> {
  const supabase = createClient()
  let query = supabase
    .from('posts')
    .select(POST_WITH_AUTHOR)
    .eq('author_id', userId)
    .in('post_type', ['pick', 'parlay'])
    .order('created_at', { ascending: false })
    .limit(limit)
  if (view === 'active') query = query.or('pick_data->>result.eq.pending,pick_data->>result.is.null')
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as unknown as Post[]
}
