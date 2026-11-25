import { NextResponse } from 'next/server'
import { POST_WITH_AUTHOR, type FeedPost } from '@/lib/feedQuery'
import { getBlockedEitherWayIds } from '@/lib/blocks'
import { canViewMlb } from '@/lib/mlbViewerAccess'
import { mobilePost } from '@/lib/nativeSocial'
import { attachUserReactions } from '@/lib/queries'
import { requireTier } from '@/lib/requireTier'
import { requireNativeAccount } from '@/lib/supabase/nativeAccount'

const headers = { 'Cache-Control': 'private, no-store' }

export async function GET(request: Request) {
  const account = await requireNativeAccount(request)
  if (account.error) return account.error
  const tier = await requireTier('basic')
  if (tier.error) return tier.error
  if (tier.userId !== account.userId) return NextResponse.json({ error: 'Sign in required' }, { status: 401, headers })
  try {
    const { supabase, userId } = account
    const [bookmarks, blocked, showMlb] = await Promise.all([
      supabase.from('bookmarks').select(`post:posts(${POST_WITH_AUTHOR})`)
        .eq('user_id', userId).order('created_at', { ascending: false }).limit(30),
      getBlockedEitherWayIds(supabase, userId),
      canViewMlb(supabase, userId),
    ])
    if (bookmarks.error) throw Error('Bookmarks unavailable')
    const suppressed = new Set(blocked)
    const saved = (bookmarks.data ?? []).map(row => row.post as unknown as FeedPost | null)
      .filter((post): post is FeedPost => Boolean(post && !suppressed.has(post.author_id) && (showMlb || post.sport?.toUpperCase() !== 'MLB')))
    const posts = await attachUserReactions(saved, userId, supabase, true)
    return NextResponse.json({ posts: posts.map(post => mobilePost({ ...post, user_bookmarked: true })) }, { headers })
  } catch {
    return NextResponse.json({ error: 'Bookmarks are temporarily unavailable' }, { status: 503, headers })
  }
}
