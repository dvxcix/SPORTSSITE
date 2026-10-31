import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { attachUserReactions } from '@/lib/queries'
import { InvalidFeedCursorError } from '@/lib/feedPagination'
import { authVisibilityUnavailable, isAccountId, isBlockedEitherWay } from '@/lib/blocks'
import { fetchProfilePostsPage, type ProfileTab } from '@/lib/feedQuery'
import { canViewMlb } from '@/lib/mlbViewerAccess'

const VALID_TABS: ProfileTab[] = ['all', 'picks', 'reposts', 'media']

// Backs a profile's infinite scroll — same relationship to the page's own
// initial SSR fetch as /api/feed has to feed/page.tsx: shares
// fetchProfilePostsPage so pagination logic lives in exactly one place.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const rawUserId = searchParams.get('userId')
  const tabParam = searchParams.get('tab') ?? 'all'
  const tab = VALID_TABS.includes(tabParam as ProfileTab) ? (tabParam as ProfileTab) : 'all'
  const cursor = searchParams.get('cursor')
  if (!rawUserId || !isAccountId(rawUserId)) return NextResponse.json({ error: 'Invalid userId' }, { status: 400 })
  const userId = rawUserId.toLowerCase()

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authVisibilityUnavailable(authError)) return NextResponse.json({ error: 'Profile posts are temporarily unavailable.' }, { status: 503 })

  // Same bidirectional gate the profile page itself checks before its
  // initial render — a blocked viewer hitting this route directly (bypassing
  // the page) shouldn't be able to page through posts that page would never
  // have shown them.
  let blocked = false
  try { blocked = !!user && user.id !== userId && await isBlockedEitherWay(supabase, user.id, userId) }
  catch { return NextResponse.json({ error: 'Profile posts are temporarily unavailable.' }, { status: 503 }) }
  if (blocked) {
    return NextResponse.json({ posts: [], nextCursor: null, hasMore: false })
  }

  // A private profile hides its activity, including reposts of public posts.
  // Repost RLS alone cannot establish whether the reposter is private.
  const { data: owner, error: ownerError } = await supabase.from('users').select('is_private').eq('id', userId).maybeSingle()
  if (ownerError) return NextResponse.json({ error: 'Profile posts are temporarily unavailable.' }, { status: 503 })
  if (!owner || typeof owner.is_private !== 'boolean') return NextResponse.json({ posts: [], nextCursor: null, hasMore: false })
  if (owner.is_private && user?.id !== userId) {
    if (!user) return NextResponse.json({ posts: [], nextCursor: null, hasMore: false })
    const { data: follow, error: followError } = await supabase.from('follows').select('follower_id').eq('follower_id', user.id).eq('following_id', userId).maybeSingle()
    if (followError) return NextResponse.json({ error: 'Profile posts are temporarily unavailable.' }, { status: 503 })
    if (!follow) return NextResponse.json({ posts: [], nextCursor: null, hasMore: false })
  }

  const page = await fetchProfilePostsPage(supabase, { userId, tab, cursor, pageSize: 20, hideMlb: !(await canViewMlb(supabase, user?.id)) })
    .catch(error => { if (error instanceof InvalidFeedCursorError) return null; throw error })
  if (!page) return NextResponse.json({ error: 'Invalid cursor' }, { status: 400 })
  const { posts: rawPosts, nextCursor, hasMore } = page
  const posts = await attachUserReactions(rawPosts, user?.id)

  return NextResponse.json({ posts, nextCursor, hasMore })
}
