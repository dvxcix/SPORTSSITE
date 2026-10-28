import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { attachUserReactions } from '@/lib/queries'
import { InvalidFeedCursorError } from '@/lib/feedPagination'
import { authVisibilityUnavailable, getBlockedEitherWayIds } from '@/lib/blocks'
import { fetchFeedPage, feedSport, type FeedFilter } from '@/lib/feedQuery'

const VALID_FILTERS: FeedFilter[] = ['latest', 'top', 'picks', 'following']

// Backs the feed's infinite scroll — the initial page load still comes
// from feed/page.tsx's own server-rendered fetch (same fetchFeedPage
// function, so the two can never drift), this route only serves pages
// after the first.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const filterParam = searchParams.get('filter') ?? 'latest'
  const filter = VALID_FILTERS.includes(filterParam as FeedFilter) ? (filterParam as FeedFilter) : 'latest'
  const cursor = searchParams.get('cursor')

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authVisibilityUnavailable(authError)) return NextResponse.json({ error: 'Feed is temporarily unavailable.' }, { status: 503 })
  let blockedIds: string[]
  try { blockedIds = user ? await getBlockedEitherWayIds(supabase, user.id) : [] }
  catch { return NextResponse.json({ error: 'Feed is temporarily unavailable.' }, { status: 503 }) }

  const page = await fetchFeedPage(supabase, {
    filter, userId: user?.id, blockedIds, cursor, pageSize: 20, sport: feedSport(searchParams.get('sport')),
  }).catch(error => { if (error instanceof InvalidFeedCursorError) return null; throw error })
  if (!page) return NextResponse.json({ error: 'Invalid cursor' }, { status: 400 })
  const { posts: rawPosts, nextCursor, hasMore } = page
  const posts = await attachUserReactions(rawPosts, user?.id)

  return NextResponse.json({ posts, nextCursor, hasMore })
}
