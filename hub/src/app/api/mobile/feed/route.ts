import { NextResponse } from 'next/server'
import { getBlockedEitherWayIds } from '@/lib/blocks'
import { fetchFeedPage, feedSport, type FeedFilter } from '@/lib/feedQuery'
import { InvalidFeedCursorError } from '@/lib/feedPagination'
import { canViewMlb } from '@/lib/mlbViewerAccess'
import { isGuestVisible, mobilePost, nativeAnonymousClient } from '@/lib/nativeSocial'
import { attachUserReactions } from '@/lib/queries'
import { requireNativeAccount } from '@/lib/supabase/nativeAccount'

const filters = ['latest', 'top', 'picks', 'following'] as const satisfies readonly FeedFilter[]
const headers = { 'Cache-Control': 'private, no-store' }

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const requested = searchParams.get('filter') ?? 'latest'
  const filter = filters.find(option => option === requested)
  const cursor = searchParams.get('cursor')
  if (!filter || (cursor?.length ?? 0) > 2048) {
    return NextResponse.json({ error: 'Invalid feed selection' }, { status: 400, headers })
  }

  try {
    const gated = request.headers.has('authorization') ? await requireNativeAccount(request) : null
    if (gated?.error) return gated.error
    const supabase = gated?.supabase ?? nativeAnonymousClient()
    const userId = gated?.userId
    if (!userId && (filter === 'following' || cursor !== null)) {
      return NextResponse.json({ error: 'Sign in to load more posts or view your following feed' }, { status: 401, headers })
    }
    const blockedIds = userId ? await getBlockedEitherWayIds(supabase, userId) : []
    const hideMlb = !(await canViewMlb(supabase, userId))
    const page = await fetchFeedPage(supabase, {
      filter, userId, blockedIds, cursor, pageSize: 20, sport: feedSport(searchParams.get('sport')), hideMlb,
    })
    const posts = userId ? await attachUserReactions(page.posts, userId, supabase, true) : page.posts.filter(isGuestVisible)
    return NextResponse.json({
      posts: posts.map(mobilePost),
      nextCursor: userId ? page.nextCursor : null,
      hasMore: Boolean(userId && page.hasMore && page.nextCursor),
      sports: hideMlb ? ['NBA', 'NFL'] : ['NBA', 'NFL', 'MLB'],
    }, { headers })
  } catch (error) {
    return error instanceof InvalidFeedCursorError
      ? NextResponse.json({ error: 'Invalid cursor' }, { status: 400, headers })
      : NextResponse.json({ error: 'Feed is temporarily unavailable' }, { status: 503, headers })
  }
}
