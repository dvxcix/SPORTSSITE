import { createClient } from '@/lib/supabase/client'
import type { Post } from '@/lib/supabase/types'

const POST_WITH_AUTHOR = `*, author:users!posts_author_id_fkey(id,username,display_name,avatar_url,is_verified,account_type,pick_record)`

// The user's own pick/parlay posts — deliberately NOT capped at 20 and NOT
// filtered to visibility:'public' like the profile feed is, since a
// private/subscriber-only pick you posted is still yours to track here.
export async function fetchMyPicks(userId: string): Promise<Post[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('posts')
    .select(POST_WITH_AUTHOR)
    .eq('author_id', userId)
    .in('post_type', ['pick', 'parlay'])
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as Post[]
}
