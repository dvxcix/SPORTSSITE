import { createClient } from '@/lib/supabase/client'
import type { Post } from '@/lib/supabase/types'
import { hydrateVisibleAuthorRecords } from '@/lib/visiblePickRecords'
import { queryOwnPicks } from '@/lib/myPicksQuery'

// The user's own pick/parlay posts — deliberately NOT capped at 20 and NOT
// filtered to visibility:'public' like the profile feed is, since a
// private/subscriber-only pick you posted is still yours to track here.
export async function fetchMyPicks(userId: string, view: 'active' | 'history' = 'active', limit = 50): Promise<Post[]> {
  const supabase = createClient()
  const posts = await queryOwnPicks(supabase, userId, view, limit)
  return (await hydrateVisibleAuthorRecords(supabase, posts)).posts
}
