import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { attachUserReactions } from '@/lib/queries'
import { isBlockedEitherWay } from '@/lib/blocks'
import { fetchProfilePostsPage, type ProfileTab } from '@/lib/feedQuery'

const VALID_TABS: ProfileTab[] = ['all', 'picks', 'reposts']

// Backs a profile's infinite scroll — same relationship to the page's own
// initial SSR fetch as /api/feed has to feed/page.tsx: shares
// fetchProfilePostsPage so pagination logic lives in exactly one place.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId')
  const tabParam = searchParams.get('tab') ?? 'all'
  const tab = VALID_TABS.includes(tabParam as ProfileTab) ? (tabParam as ProfileTab) : 'all'
  const cursor = searchParams.get('cursor')
  if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Same bidirectional gate the profile page itself checks before its
  // initial render — a blocked viewer hitting this route directly (bypassing
  // the page) shouldn't be able to page through posts that page would never
  // have shown them.
  if (user && user.id !== userId && await isBlockedEitherWay(supabase, user.id, userId)) {
    return NextResponse.json({ posts: [], nextCursor: null, hasMore: false })
  }

  const { posts: rawPosts, nextCursor, hasMore } = await fetchProfilePostsPage(supabase, { userId, tab, cursor, pageSize: 20 })
  const posts = await attachUserReactions(rawPosts, user?.id)

  return NextResponse.json({ posts, nextCursor, hasMore })
}
