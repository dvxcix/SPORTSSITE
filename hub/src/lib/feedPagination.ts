import type { FeedPageResult, FeedPost } from './feedQuery'

export type RepostRow = {
  id: string
  user_id: string
  created_at: string
  reposted_by: FeedPost['reposted_by']
  post: FeedPost | FeedPost[] | null
}
type Position = { at: string; id: string | null } | 'done' | null
export type MergeCursor = { v: 1; posts: Position; reposts: Position }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TIME = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/

export class InvalidFeedCursorError extends Error {}
function validTime(value: unknown): value is string {
  return typeof value === 'string' && TIME.test(value) && Number.isFinite(Date.parse(value))
}
function validPosition(value: unknown): value is Position {
  if (value === null || value === 'done') return true
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const item = value as { at?: unknown; id?: unknown }
  return validTime(item.at) && (item.id === null || typeof item.id === 'string' && UUID.test(item.id))
}
export function readFeedCursor(cursor: string | null | undefined): MergeCursor {
  if (!cursor) return { v: 1, posts: null, reposts: null }
  // Tabs opened before this release can still send the old timestamp cursor.
  if (validTime(cursor)) return { v: 1, posts: { at: cursor, id: null }, reposts: { at: cursor, id: null } }
  try {
    const value: unknown = JSON.parse(cursor)
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const item = value as { v?: unknown; posts?: unknown; reposts?: unknown }
      if (item.v === 1 && validPosition(item.posts) && validPosition(item.reposts)) return { v: 1, posts: item.posts, reposts: item.reposts }
    }
  } catch { /* An invalid cursor must not restart at the first page. */ }
  throw new InvalidFeedCursorError('Invalid feed cursor')
}

// PostgreSQL timestamps carry microseconds. Date.parse retains milliseconds,
// so account for the remaining digits when merging the two source streams.
function micros(at: string): number {
  if (!validTime(at)) throw new Error('Invalid feed observation time')
  const fractional = /\.(\d{1,6})/.exec(at)?.[1]?.padEnd(6, '0') ?? '000000'
  return Date.parse(at) * 1000 + Number(fractional.slice(3, 6))
}
export function compareFeedRows(a: { id: string; created_at: string }, b: { id: string; created_at: string }): number {
  const timeDifference = micros(b.created_at) - micros(a.created_at)
  return timeDifference || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)
}
function position(row: { id: string; created_at: string }): Exclude<Position, 'done' | null> {
  if (!UUID.test(row.id) || !validTime(row.created_at)) throw new Error('Invalid feed observation identity')
  return { at: row.created_at, id: row.id }
}

// Validating the timestamp and UUID prevents user-provided cursor strings
// from injecting arbitrary PostgREST filters. A null ID is a legacy cursor.
export function feedCursorFilter(value: Exclude<Position, 'done' | null>): string | null {
  return value.id === null ? null : `created_at.lt.${value.at},and(created_at.eq.${value.at},id.lt.${value.id})`
}
export function repostRowPost(row: RepostRow): FeedPost | null {
  return Array.isArray(row.post) ? row.post[0] ?? null : row.post
}

export function mergeFeedPage(rawPosts: FeedPost[], rawReposts: RepostRow[], cursor: MergeCursor, size: number,
  includePost: (post: FeedPost) => boolean, includeRepost: (post: FeedPost, row: RepostRow) => boolean): FeedPageResult {
  let postIndex = 0, repostIndex = 0, postPosition = cursor.posts, repostPosition = cursor.reposts
  const posts: FeedPost[] = []
  while (posts.length < size && (postIndex < rawPosts.length || repostIndex < rawReposts.length)) {
    // If a full source has been consumed, its unseen next row might precede
    // the other source's remaining rows. Continue only after fetching it.
    if (postIndex === rawPosts.length && rawPosts.length === size
      || repostIndex === rawReposts.length && rawReposts.length === size) break
    const original = rawPosts[postIndex], repost = rawReposts[repostIndex]
    // Each source is independently ordered by (time,id); this source tie
    // break keeps both positions correct even when many timestamps are equal.
    if (original && (!repost || micros(original.created_at) >= micros(repost.created_at))) {
      postIndex++
      postPosition = position(original)
      if (includePost(original)) posts.push(original)
    } else if (repost) {
      repostIndex++
      repostPosition = position(repost)
      const post = repostRowPost(repost)
      if (post && includeRepost(post, repost)) posts.push({ ...post, reposted_by: repost.reposted_by, repost_created_at: repost.created_at })
    }
  }
  // A short query is exhausted only once all its fetched rows were consumed.
  // A page-sized merge can leave unreturned rows even if both queries were short.
  if (postIndex === rawPosts.length && rawPosts.length < size) postPosition = 'done'
  if (repostIndex === rawReposts.length && rawReposts.length < size) repostPosition = 'done'
  const hasMore = postPosition !== 'done' || repostPosition !== 'done'
  return { posts, hasMore, nextCursor: hasMore ? JSON.stringify({ v: 1, posts: postPosition, reposts: repostPosition } satisfies MergeCursor) : null }
}

export function requireFeedPageSize(size: number) {
  if (!Number.isSafeInteger(size) || size < 1 || size > 100) throw new Error('Invalid feed page size')
}
