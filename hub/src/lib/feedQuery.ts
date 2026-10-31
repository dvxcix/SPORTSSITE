import type { SupabaseClient } from '@supabase/supabase-js'
import type { Post } from '@/lib/supabase/types'
import { compareFeedRows, feedCursorFilter, InvalidFeedCursorError, mergeFeedPage, readFeedCursor, requireFeedPageSize, type RepostRow } from './feedPagination'

export const POST_WITH_AUTHOR = `*, author:users!posts_author_id_fkey(id, username, display_name, avatar_url, avatar_ring_style, avatar_ring_color, bio, follower_count, is_verified, account_type, pick_record, tier, beta_access_active)`

export type FeedFilter = 'latest' | 'top' | 'picks' | 'following'
export type FeedSport = 'MLB' | 'NFL' | 'NBA'
export function feedSport(value: string | null | undefined): FeedSport | undefined {
  const sport = value?.toUpperCase()
  return sport === 'MLB' || sport === 'NFL' || sport === 'NBA' ? sport : undefined
}

type FeedReposter = NonNullable<Post['reposted_by']> & { id?: string }
export type FeedPost = Omit<Post, 'reposted_by'> & {
  reposted_by?: FeedReposter | null
}

export interface FeedPageResult {
  posts: FeedPost[]
  // Opaque to callers. Top uses offsets; chronological views use one stable
  // position per source, with backward compatibility for old timestamp cursors.
  nextCursor: string | null
  hasMore: boolean
}

const RELATION_PAGE = 1000
const MAX_SUPPRESSIONS = 10000
const MAX_FOLLOWS = 2000
const FOLLOW_BATCH = 100
const SAFE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// The Data API can cap a response at 1,000 rows. Traverse deterministic
// keys and reject incomplete/error responses rather than silently ignoring a
// member's hidden posts or followed accounts. Large follow sets are bounded.
async function feedSuppressions(supabase: SupabaseClient, userId: string) {
  const rows: { target_type: 'author' | 'post'; target_id: string }[] = []
  let last: { target_type: 'author' | 'post'; target_id: string } | undefined
  const deadline = AbortSignal.timeout(10000)
  for (;;) {
    let query = supabase.from('feed_suppressions').select('target_type,target_id', { count: 'exact' }).eq('user_id', userId)
      .order('target_type', { ascending: true }).order('target_id', { ascending: true }).limit(RELATION_PAGE)
    if (last) query = query.or(`target_type.gt.${last.target_type},and(target_type.eq.${last.target_type},target_id.gt.${last.target_id})`)
    const { data, error, count } = await query.abortSignal(AbortSignal.any([deadline, AbortSignal.timeout(5000)]))
    if (error || !Array.isArray(data) || data.length > RELATION_PAGE || !Number.isSafeInteger(count) || count! < data.length
      || (count! > 0 && data.length === 0)) throw new Error('Feed preferences unavailable')
    if (rows.length + count! > MAX_SUPPRESSIONS) throw new Error('Feed preferences exceed supported limit')
    for (const item of data) {
      if ((item.target_type !== 'author' && item.target_type !== 'post') || typeof item.target_id !== 'string' || !SAFE_UUID.test(item.target_id)
        || last && (item.target_type < last.target_type || item.target_type === last.target_type && item.target_id <= last.target_id)) throw new Error('Feed preferences unavailable')
      last = { target_type: item.target_type, target_id: item.target_id }
      rows.push(last)
      if (rows.length > MAX_SUPPRESSIONS) throw new Error('Feed preferences exceed supported limit')
    }
    if (data.length === count) return rows
  }
}

async function feedFollowing(supabase: SupabaseClient, userId: string) {
  const ids: string[] = []
  let last = ''
  const deadline = AbortSignal.timeout(10000)
  for (;;) {
    let query = supabase.from('follows').select('following_id', { count: 'exact' }).eq('follower_id', userId)
      .order('following_id', { ascending: true }).limit(RELATION_PAGE)
    if (last) query = query.gt('following_id', last)
    const { data, error, count } = await query.abortSignal(AbortSignal.any([deadline, AbortSignal.timeout(5000)]))
    if (error || !Array.isArray(data) || data.length > RELATION_PAGE || !Number.isSafeInteger(count) || count! < data.length
      || (count! > 0 && data.length === 0)) throw new Error('Followed accounts unavailable')
    if (ids.length + count! > MAX_FOLLOWS) throw new Error('Following feed exceeds supported limit')
    for (const item of data) {
      if (typeof item.following_id !== 'string' || !SAFE_UUID.test(item.following_id) || item.following_id <= last) throw new Error('Followed accounts unavailable')
      last = item.following_id
      ids.push(last)
      if (ids.length > MAX_FOLLOWS) throw new Error('Following feed exceeds supported limit')
    }
    if (data.length === count) return ids
  }
}

// Chunk large IN filters to avoid URL limits. Four batches per source at a
// time bound database pressure, then select the global newest page.
async function collectFeedBatches<T extends { id: string; created_at: string }>(groups: (string[] | undefined)[], load: (ids: string[] | undefined) => PromiseLike<{ data: unknown[] | null; error: unknown }>, pageSize: number): Promise<T[]> {
  const rows: T[] = []
  for (let offset = 0; offset < groups.length; offset += 4) {
    const responses = await Promise.all(groups.slice(offset, offset + 4).map(load))
    for (const response of responses) {
      if (response.error || !Array.isArray(response.data) || response.data.length > pageSize) throw new Error('Feed posts unavailable')
      rows.push(...response.data as T[])
    }
  }
  return rows.sort(compareFeedRows).slice(0, pageSize)
}

// The feed page previously had a hard 30-post ceiling with zero pagination
// — post #31 simply didn't exist for a viewer, confirmed via `.limit(30)`
// with no cursor anywhere. This is the shared fetch both the initial SSR
// page load and the infinite-scroll API route call, so the two can never
// drift into different query logic.
export async function fetchFeedPage(supabase: SupabaseClient, opts: {
  filter: FeedFilter; userId: string | null | undefined; blockedIds: string[]
  cursor?: string | null; pageSize?: number; sport?: FeedSport; hideMlb?: boolean
}): Promise<FeedPageResult> {
  const { filter, userId, blockedIds, cursor, pageSize = 20, sport, hideMlb = false } = opts
  requireFeedPageSize(pageSize)
  if (hideMlb && sport === 'MLB') return { posts: [], nextCursor: null, hasMore: false }
  const blockedSet = new Set(blockedIds), hiddenPostIds = new Set<string>(), mutedAuthorIds = new Set<string>()
  if (userId) {
    for (const suppression of await feedSuppressions(supabase, userId)) {
      if (suppression.target_type === 'post') hiddenPostIds.add(suppression.target_id)
      if (suppression.target_type === 'author') mutedAuthorIds.add(suppression.target_id)
    }
  }
  const isSuppressed = (post: FeedPost) => hiddenPostIds.has(post.id)
    || mutedAuthorIds.has(post.author_id)
    || mutedAuthorIds.has(post.reposted_by?.id ?? '')
    || (hideMlb && post.sport?.toUpperCase() === 'MLB')

  let followedIds: string[] | null = null
  if (filter === 'following') {
    if (!userId) return { posts: [], nextCursor: null, hasMore: false }
    followedIds = await feedFollowing(supabase, userId)
    if (!followedIds.length) return { posts: [], nextCursor: null, hasMore: false }
  }
  if (filter === 'top') {
    if (cursor && (!/^(0|[1-9]\d{0,4})$/.test(cursor) || Number(cursor) > 50000)) throw new InvalidFeedCursorError('Invalid feed cursor')
    const offset = cursor ? Number(cursor) : 0
    let query = supabase.from('posts').select(POST_WITH_AUTHOR)
    if (sport) query = query.ilike('sport', sport)
    const { data, error } = await query.order('reaction_count', { ascending: false }).order('id', { ascending: false }).range(offset, offset + pageSize - 1).abortSignal(AbortSignal.timeout(10000))
    if (error) throw new Error('Feed posts unavailable')
    const posts = ((data ?? []) as FeedPost[]).filter(p => !blockedSet.has(p.author_id) && !isSuppressed(p))
    const hasMore = (data?.length ?? 0) === pageSize
    return { posts, nextCursor: hasMore ? String(offset + pageSize) : null, hasMore }
  }

  const state = readFeedCursor(cursor)
  const deadline = AbortSignal.timeout(15000)
  const groups: (string[] | undefined)[] = followedIds ? Array.from({ length: Math.ceil(followedIds.length / FOLLOW_BATCH) }, (_, i) => followedIds!.slice(i * FOLLOW_BATCH, (i + 1) * FOLLOW_BATCH)) : [undefined]
  const postQuery = (ids: string[] | undefined) => {
    let query = supabase.from('posts').select(POST_WITH_AUTHOR).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(pageSize)
    if (sport) query = query.ilike('sport', sport)
    if (filter === 'picks') query = query.in('post_type', ['pick', 'parlay'])
    if (ids) query = query.in('author_id', ids)
    if (state.posts && state.posts !== 'done') {
      const expression = feedCursorFilter(state.posts)
      query = expression ? query.or(expression) : query.lt('created_at', state.posts.at)
    }
    return query.abortSignal(AbortSignal.any([deadline, AbortSignal.timeout(10000)]))
  }
  const repostQuery = (ids: string[] | undefined) => {
    let query = supabase.from('reposts')
      .select('id, user_id, created_at, reposted_by:users!reposts_user_id_fkey(id, username, display_name, avatar_url), post:posts(' + POST_WITH_AUTHOR + ')')
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(pageSize)
    if (ids) query = query.in('user_id', ids)
    if (state.reposts && state.reposts !== 'done') {
      const expression = feedCursorFilter(state.reposts)
      query = expression ? query.or(expression) : query.lt('created_at', state.reposts.at)
    }
    return query.abortSignal(AbortSignal.any([deadline, AbortSignal.timeout(10000)]))
  }
  const [postRows, repostRows] = await Promise.all([
    state.posts === 'done' ? Promise.resolve([]) : collectFeedBatches<FeedPost>(groups, postQuery, pageSize),
    state.reposts === 'done' ? Promise.resolve([]) : collectFeedBatches<RepostRow>(groups, repostQuery, pageSize),
  ])
  const includePost = (post: FeedPost) => !blockedSet.has(post.author_id) && !isSuppressed(post)
  return mergeFeedPage(postRows, repostRows, state, pageSize, includePost,
    (post, row) => includePost(post) && !blockedSet.has(row.user_id) && !mutedAuthorIds.has(row.user_id)
      && (filter !== 'picks' || post.post_type === 'pick' || post.post_type === 'parlay')
      && (!sport || post.sport?.toUpperCase() === sport))
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
  userId: string; tab: ProfileTab; cursor?: string | null; pageSize?: number; hideMlb?: boolean
}): Promise<FeedPageResult> {
  const { userId, tab, cursor, pageSize = 20, hideMlb = false } = opts
  requireFeedPageSize(pageSize)
  const state = readFeedCursor(cursor)
  if (tab === 'media') state.reposts = 'done'
  if (tab === 'reposts') state.posts = 'done'
  let postQuery = supabase.from('posts').select(POST_WITH_AUTHOR).eq('author_id', userId)
    .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(pageSize)
  if (tab === 'media') postQuery = postQuery.not('media_urls', 'eq', '{}')
  if (tab === 'picks') postQuery = postQuery.in('post_type', ['pick', 'parlay'])
  if (state.posts && state.posts !== 'done') {
    const expression = feedCursorFilter(state.posts)
    postQuery = expression ? postQuery.or(expression) : postQuery.lt('created_at', state.posts.at)
  }
  let repostQuery = supabase.from('reposts')
    .select('id, user_id, created_at, reposted_by:users!reposts_user_id_fkey(id, username, display_name, avatar_url), post:posts(' + POST_WITH_AUTHOR + ')')
    .eq('user_id', userId).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(pageSize)
  if (state.reposts && state.reposts !== 'done') {
    const expression = feedCursorFilter(state.reposts)
    repostQuery = expression ? repostQuery.or(expression) : repostQuery.lt('created_at', state.reposts.at)
  }
  const [postResult, repostResult] = await Promise.all([
    state.posts === 'done' ? Promise.resolve({ data: [], error: null }) : postQuery.abortSignal(AbortSignal.timeout(10000)),
    state.reposts === 'done' ? Promise.resolve({ data: [], error: null }) : repostQuery.abortSignal(AbortSignal.timeout(10000)),
  ])
  if (postResult.error || repostResult.error) throw new Error('Profile posts unavailable')
  return mergeFeedPage((postResult.data ?? []) as FeedPost[], (repostResult.data ?? []) as RepostRow[], state, pageSize,
    post => (!hideMlb || post.sport?.toUpperCase() !== 'MLB') && (tab !== 'media' || Array.isArray(post.media_urls) && post.media_urls.length > 0),
    post => (!hideMlb || post.sport?.toUpperCase() !== 'MLB') && (tab !== 'picks' || post.post_type === 'pick' || post.post_type === 'parlay'))
}
