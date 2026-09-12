import type { SupabaseClient } from '@supabase/supabase-js'
import type { Post } from '@/lib/supabase/types'

export const POST_WITH_AUTHOR = `*, author:users!posts_author_id_fkey(id, username, display_name, avatar_url, avatar_ring_style, avatar_ring_color, bio, follower_count, is_verified, account_type, pick_record, tier, beta_access_active)`

export type FeedFilter = 'latest' | 'top' | 'picks' | 'following'

type FeedReposter = NonNullable<Post['reposted_by']> & { id?: string }
export type FeedPost = Omit<Post, 'reposted_by'> & {
  reposted_by?: FeedReposter | null
}

type RepostRow = {
  created_at: string
  reposted_by: FeedReposter | null
  post: FeedPost | FeedPost[] | null
}

const asFeedPosts = (rows: unknown[] | null | undefined): FeedPost[] =>
  (rows ?? []) as FeedPost[]

const asRepostRows = (rows: unknown[] | null | undefined): RepostRow[] =>
  (rows ?? []) as RepostRow[]

const repostRowPost = (row: RepostRow): FeedPost | null =>
  Array.isArray(row.post) ? row.post[0] ?? null : row.post

export interface FeedPageResult {
  posts: FeedPost[]
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
  const hiddenPostIds = new Set<string>()
  const mutedAuthorIds = new Set<string>()
  if (userId) {
    const { data: suppressions } = await supabase.from('feed_suppressions').select('target_type,target_id').eq('user_id', userId)
    for (const suppression of suppressions ?? []) {
      if (suppression.target_type === 'post') hiddenPostIds.add(suppression.target_id)
      if (suppression.target_type === 'author') mutedAuthorIds.add(suppression.target_id)
    }
  }
  const isSuppressed = (post: FeedPost) => hiddenPostIds.has(post.id)
    || mutedAuthorIds.has(post.author_id)
    || mutedAuthorIds.has(post.reposted_by?.id ?? '')

  let followedIds: string[] | null = null
  if (filter === 'following') {
    if (!userId) return { posts: [], nextCursor: null, hasMore: false }
    const { data } = await supabase.from('follows').select('following_id').eq('follower_id', userId)
    followedIds = ((data ?? []) as { following_id: string }[]).map(f => f.following_id)
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
    const posts = asFeedPosts(data).filter(p => !blockedSet.has(p.author_id) && !isSuppressed(p))
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

  let reposted = asRepostRows(repostRows)
    .map(row => ({ row, post: repostRowPost(row) }))
    .filter((entry): entry is { row: RepostRow; post: FeedPost } => Boolean(entry.post))
    .map(({ row, post }) => ({ ...post, reposted_by: row.reposted_by, repost_created_at: row.created_at }))
  if (filter === 'picks') reposted = reposted.filter(p => p.post_type === 'pick' || p.post_type === 'parlay')

  const typedRawPosts = asFeedPosts(rawPosts)
  const merged = [...typedRawPosts, ...reposted]
    .filter(p => !blockedSet.has(p.author_id) && !blockedSet.has(p.reposted_by?.id ?? '') && !isSuppressed(p))
    .sort((a, b) =>
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
  const postsBoundary = !postsExhausted ? typedRawPosts[typedRawPosts.length - 1]?.created_at ?? null : null
  const typedRepostRows = asRepostRows(repostRows)
  const repostsBoundary = !repostsExhausted ? typedRepostRows[typedRepostRows.length - 1]?.created_at ?? null : null
  const hasMore = !postsExhausted || !repostsExhausted
  // Older (smaller) of the two boundaries — advancing the cursor to the
  // more conservative point means neither source's un-fetched tail gets
  // skipped on the next page.
  const nextCursor = !hasMore ? null : [postsBoundary, repostsBoundary].filter(Boolean)
    .sort((a, b) => new Date(a as string).getTime() - new Date(b as string).getTime())[0] ?? null

  return { posts, nextCursor, hasMore }
}

export type ProfileTab = 'all' | 'picks' | 'reposts' | 'media'

// Profile pages had the identical no-pagination gap as the feed — getUserPosts
// fetched two flat .limit(20) queries (authored + this user's own reposts),
// merged, sliced to 20, with the "Picks"/"Reposts" tabs then filtered out of
// that same fixed page in JS. Same keyset-cursor approach as fetchFeedPage
// above, scoped to one author instead of a following graph, plus a
// reposts-only mode the feed doesn't need (the feed already merges reposts
// from everyone the viewer follows; a profile's Reposts tab means "things
// THIS person reposted," a query reposts.user_id already answers directly).
export async function fetchProfilePostsPage(supabase: SupabaseClient, opts: {
  userId: string
  tab: ProfileTab
  cursor?: string | null
  pageSize?: number
}): Promise<FeedPageResult> {
  const { userId, tab, cursor, pageSize = 20 } = opts

  if (tab === 'media') {
    let mediaQuery = supabase.from('posts').select(POST_WITH_AUTHOR)
      .eq('author_id', userId)
      .not('media_urls', 'eq', '{}')
      .order('created_at', { ascending: false })
      .limit(pageSize)
    if (cursor) mediaQuery = mediaQuery.lt('created_at', cursor)
    const { data } = await mediaQuery
    const posts = asFeedPosts(data).filter(post => Array.isArray(post.media_urls) && post.media_urls.length > 0)
    const hasMore = (data?.length ?? 0) === pageSize
    return { posts, nextCursor: hasMore ? posts[posts.length - 1]?.created_at ?? null : null, hasMore }
  }

  if (tab === 'reposts') {
    let repostQuery = supabase.from('reposts')
      .select(`created_at, reposted_by:users!reposts_user_id_fkey(id, username, display_name, avatar_url), post:posts(${POST_WITH_AUTHOR})`)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(pageSize)
    if (cursor) repostQuery = repostQuery.lt('created_at', cursor)
    const { data } = await repostQuery
    const posts = asRepostRows(data)
      .map(row => ({ row, post: repostRowPost(row) }))
      .filter((entry): entry is { row: RepostRow; post: FeedPost } => Boolean(entry.post))
      .map(({ row, post }) => ({ ...post, reposted_by: row.reposted_by, repost_created_at: row.created_at }))
    const hasMore = (data?.length ?? 0) === pageSize
    const last = posts[posts.length - 1]
    return { posts, nextCursor: hasMore ? (last?.repost_created_at ?? null) : null, hasMore }
  }

  let postQuery = supabase.from('posts').select(POST_WITH_AUTHOR).eq('author_id', userId).order('created_at', { ascending: false }).limit(pageSize)
  if (tab === 'picks') postQuery = postQuery.in('post_type', ['pick', 'parlay'])
  if (cursor) postQuery = postQuery.lt('created_at', cursor)

  let repostQuery = supabase.from('reposts')
    .select(`created_at, reposted_by:users!reposts_user_id_fkey(id, username, display_name, avatar_url), post:posts(${POST_WITH_AUTHOR})`)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(pageSize)
  if (cursor) repostQuery = repostQuery.lt('created_at', cursor)

  const [{ data: rawPosts }, { data: repostRows }] = await Promise.all([postQuery, repostQuery])

  let reposted = asRepostRows(repostRows)
    .map(row => ({ row, post: repostRowPost(row) }))
    .filter((entry): entry is { row: RepostRow; post: FeedPost } => Boolean(entry.post))
    .map(({ row, post }) => ({ ...post, reposted_by: row.reposted_by, repost_created_at: row.created_at }))
  if (tab === 'picks') reposted = reposted.filter(p => p.post_type === 'pick' || p.post_type === 'parlay')

  const typedRawPosts = asFeedPosts(rawPosts)
  const merged = [...typedRawPosts, ...reposted]
    .sort((a, b) =>
      new Date(b.repost_created_at ?? b.created_at).getTime() - new Date(a.repost_created_at ?? a.created_at).getTime())

  const posts = merged.slice(0, pageSize)

  const postsExhausted = (rawPosts?.length ?? 0) < pageSize
  const repostsExhausted = (repostRows?.length ?? 0) < pageSize
  const postsBoundary = !postsExhausted ? typedRawPosts[typedRawPosts.length - 1]?.created_at ?? null : null
  const typedRepostRows = asRepostRows(repostRows)
  const repostsBoundary = !repostsExhausted ? typedRepostRows[typedRepostRows.length - 1]?.created_at ?? null : null
  const hasMore = !postsExhausted || !repostsExhausted
  const nextCursor = !hasMore ? null : [postsBoundary, repostsBoundary].filter(Boolean)
    .sort((a, b) => new Date(a as string).getTime() - new Date(b as string).getTime())[0] ?? null

  return { posts, nextCursor, hasMore }
}
