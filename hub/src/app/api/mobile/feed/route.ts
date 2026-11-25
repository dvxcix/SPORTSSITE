import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getBlockedEitherWayIds } from '@/lib/blocks'
import { fetchFeedPage, feedSport, type FeedFilter, type FeedPost } from '@/lib/feedQuery'
import { InvalidFeedCursorError } from '@/lib/feedPagination'
import { canViewMlb } from '@/lib/mlbViewerAccess'
import { requireNativeAccount } from '@/lib/supabase/nativeAccount'

const filters = ['latest', 'top', 'picks', 'following'] as const satisfies readonly FeedFilter[]
const headers = { 'Cache-Control': 'private, no-store' }

function anonymousClient() {
  // Guest reads never inherit the browser's session or a service credential.
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function isGuestVisible(post: FeedPost & { group_id?: string | null }) {
  return post.visibility === 'public' && !post.is_premium && post.group_id === null
}

function mobilePost(post: FeedPost) {
  return {
    id: post.id,
    author: post.author ? {
      username: post.author.username,
      displayName: post.author.display_name,
      avatar: post.author.avatar_url,
      verified: post.author.is_verified,
    } : null,
    repostedBy: post.reposted_by ? (post.reposted_by.display_name || post.reposted_by.username) : null,
    repostedAt: post.repost_created_at ?? null,
    createdAt: post.created_at,
    content: post.content,
    kind: post.post_type,
    sport: post.sport ?? null,
    media: post.media_urls ?? [],
    spoiler: post.is_spoiler === true,
    shareable: isGuestVisible(post),
    reactions: post.reaction_count,
    comments: post.comment_count,
    reposts: post.repost_count,
    pick: post.pick_data ? {
      label: post.pick_data.player_name ?? post.pick_data.team,
      line: post.pick_data.line ?? null,
      odds: post.pick_data.odds == null ? null : String(post.pick_data.odds),
      result: post.pick_data.result ?? null,
      legs: (post.pick_data.legs ?? []).map(leg => ({
        label: leg.player_name,
        line: leg.line,
        odds: leg.odds == null ? null : String(leg.odds),
        result: leg.result,
      })),
    } : null,
    poll: post.poll_data ? {
      options: post.poll_data.options.map(option => option.text),
      endsAt: post.poll_data.ends_at,
    } : null,
  }
}

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
    const supabase = gated?.supabase ?? anonymousClient()
    const userId = gated?.userId
    if (!userId && (filter === 'following' || cursor !== null)) {
      return NextResponse.json({ error: 'Sign in to load more posts or view your following feed' }, { status: 401, headers })
    }
    const blockedIds = userId ? await getBlockedEitherWayIds(supabase, userId) : []
    const hideMlb = !(await canViewMlb(supabase, userId))
    const page = await fetchFeedPage(supabase, {
      filter, userId, blockedIds, cursor, pageSize: 20, sport: feedSport(searchParams.get('sport')), hideMlb,
    })
    const posts = userId ? page.posts : page.posts.filter(isGuestVisible)
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
