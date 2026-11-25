import type { SupabaseClient } from '@supabase/supabase-js'
import { POST_WITH_AUTHOR, type FeedPost } from '@/lib/feedQuery'

export async function queryOwnPicks(client: SupabaseClient, userId: string, view: 'active' | 'history', limit: number, hideMlb = false) {
  let query = client.from('posts').select(POST_WITH_AUTHOR).eq('author_id', userId).in('post_type', ['pick', 'parlay'])
    .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(limit)
  if (view === 'active') query = query.or('pick_data->>result.eq.pending,pick_data->>result.is.null')
  if (hideMlb) query = query.or('sport.is.null,sport.not.ilike.MLB')
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as unknown as FeedPost[]
}
