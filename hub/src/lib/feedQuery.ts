import type { SupabaseClient } from '@supabase/supabase-js'

export const POST_WITH_AUTHOR = `*, author:users!posts_author_id_fkey(id, username, display_name, avatar_url, is_verified, account_type, pick_record)`

export type FeedFilter = 'latest' | 'top' | 'picks' | 'following'

export interface FeedPageResult {
  posts: any[]
  // Opaque to the caller — a keyset timestamp for latest/picks/following, a
  // stringified offset for top (which sorts by reaction_count, not time, so
  // a timestamp cursor doesn't apply). Null means there's nothing more.
  nextCursor: string | null
  hasMore: boolean
}

// The feed page previously had a hard 30-post ceiling with zero pagination
// — post #31 simply didn't exist for a viewer, confirmed via `.limit(30)`
// with no cursor anywhere. This is the shared fetch both the initial SSR
// page load and the infinite-scroll API route call, so the two can never
// drift into different query logic.
export async function fetchFeedPage(supabase: SupabaseClient, opts: {
  filter: FeedFilter
  userId: string | null | undefined
  blockedIds: string[]
  cursor?: string | null
  pageSize?: number
}): Promise<FeedPageResult> {
  const { filter, userId, blockedIds, cursor, pageSize = 20 } = opts
  const blockedSet = new Set(blockedIds)

  let followedIds: string[] | null = null
  if (filter === 'following') {
    if (!userId) return { posts: [], nextCursor: null, hasMore: false }
    const { data } = await supabase.from('follows').select('following_id').eq('follower_id', userId)
    followedIds = (data ?? []).map((f: any) => f.following_id)
    if (followedIds.length === 0) return { posts: [], nextCursor: null, hasMore: false }
  }

  // "Top" sorts by reaction_count, not time, so a timestamp keyset cursor
  // doesn't apply — falls back to plain offset pagination, encoded as a
  // stringified integer in the same cursor field so the API/client don't
  // need to know which pagination style a given filter uses.
  if (filter === 'top') {
    const offset = cursor ? parseInt(cursor, 10) || 0 : 0
    const { data } = await supabase.from('posts').select(POST_WITH_AUTHOR)
      .order('reaction_count', { ascending: false })
      .range(offset, offset + pageSize - 1)
    const posts = (data ?? []).filter((p: any) => !blockedSet.has(p.author_id))
    const gotFullPage = (data?.length ?? 0) === pageSize
    return { posts, nextCursor: gotFullPage ? String(offset + pageSize) : null, hasMore: gotFullPage }
  }

  let postQuery = supabase.from('posts').select(POST_WITH_AUTHOR).order('created_at', { ascending: false }).limit(pageSize)
  if (filter === 'picks') postQuery = postQuery.in('post_type', ['pick', 'parlay'])
  if (followedIds) postQuery = postQuery.in('author_id', followedIds)
  if (cursor) postQuery = postQuery.lt('created_at', cursor)

  let repostQuery = supabase.from('reposts')
    .select(`created_at, reposted_by:users!reposts_user_id_fkey(id, username, display_name, avatar_url), post:posts(${POST_WITH_AUTHOR})`)
    .order('created_at', { ascending: false })
    .limit(pageSize)
  if (followedIds) repostQuery = repostQuery.in('user_id', followedIds)
  if (cursor) repostQuery = repostQuery.lt('created_at', cursor)

  const [{ data: rawPosts }, { data: repostRows }] = await Promise.all([postQuery, repostQuery])

  let reposted = ((repostRows ?? []) as any[])
    .filter(r => r.post)
    .map(r => ({ ...r.post, reposted_by: r.reposted_by, repost_created_at: r.created_at }))
  if (filter === 'picks') reposted = reposted.filter(p => p.post_type === 'pick' || p.post_type === 'parlay')

  const merged = [...(rawPosts ?? []), ...reposted]
    .filter((p: any) => !blockedSet.has(p.author_id) && !blockedSet.has(p.reposted_by?.id))
    .sort((a: any, b: any) =>
      new Date(b.repost_created_at ?? b.created_at).getTime() - new Date(a.repost_created_at ?? a.created_at).getTime())

  const posts = merged.slice(0, pageSize)

  // The cursor tracks how far back in time each RAW source has actually
  // been fetched — not the block-filtered/paginated result — so it keeps
  // advancing correctly even on a page where blocking (or the picks
  // post_type filter, applied after the repost query already ran) removed
  // everything from what's returned. A source only contributes a boundary
  // when it came back with a full page — fewer rows means that source is
  // exhausted and shouldn't gate `hasMore`.
  const postsExhausted = (rawPosts?.length ?? 0) < pageSize
  const repostsExhausted = (repostRows?.length ?? 0) < pageSize
  const postsBoundary = !postsExhausted ? (rawPosts as any[])[rawPosts!.length - 1].created_at : null
  const repostsBoundary = !repostsExhausted ? (repostRows as any[])[repostRows!.length - 1].created_at : null
  const hasMore = !postsExhausted || !repostsExhausted
  // Older (smaller) of the two boundaries — advancing the cursor to the
  // more conservative point means neither source's un-fetched tail gets
  // skipped on the next page.
  const nextCursor = !hasMore ? null : [postsBoundary, repostsBoundary].filter(Boolean)
    .sort((a, b) => new Date(a as string).getTime() - new Date(b as string).getTime())[0] ?? null

  return { posts, nextCursor, hasMore }
}
