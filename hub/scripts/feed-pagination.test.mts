import assert from 'node:assert/strict'
import test from 'node:test'
import { fetchFeedPage, fetchProfilePostsPage } from '../src/lib/feedQuery'
import { InvalidFeedCursorError } from '../src/lib/feedPagination'
import type { SupabaseClient } from '@supabase/supabase-js'

const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`
const time = (n: number) => new Date(Date.UTC(2026, 9, 28, 12, 0, n)).toISOString()
// The in-memory PostgREST fixture spans several deliberately different tables.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>
const post = (n: number, createdAt = time(59 - n % 60), author = uuid(9000)): Row => ({
  id: uuid(n), created_at: createdAt, author_id: author, sport: 'NBA', post_type: 'pick', media_urls: ['photo'], reaction_count: n, visibility: 'public',
})
const repost = (n: number, item: Row | null, createdAt = time(59 - n % 60), user = uuid(8000)): Row => ({
  id: uuid(20000 + n), user_id: user, created_at: createdAt, reposted_by: { id: user, username: `u${n}` }, post: item,
})
function timestamp(value: string) {
  const decimal = /\.(\d+)/.exec(value)?.[1]?.padEnd(6, '0') ?? '000000'
  return Date.parse(value) * 1000 + Number(decimal.slice(3, 6))
}

// This harness applies query filters/order/limits and simulates RLS hiding
// posts and joined repost targets; it exercises the actual fetch functions.
class FakeQuery implements PromiseLike<{ data: Row[] | null; error: Error | null; count: number | null }> {
  private filters: ((row: Row) => boolean)[] = []
  private sorts: { field: string; ascending: boolean }[] = []
  private start = 0
  private max = Infinity
  private exact = false
  constructor(private db: FakeDb, private table: string) {}
  select(_columns?: string, options?: { count?: string }) { this.exact = options?.count === 'exact'; return this }
  eq(field: string, value: unknown) { this.filters.push(row => row[field] === value); return this }
  in(field: string, values: unknown[]) { this.filters.push(row => values.includes(row[field])); return this }
  ilike(field: string, value: string) { this.filters.push(row => String(row[field]).toLowerCase() === value.toLowerCase()); return this }
  not(field: string, op: string, value: string) { assert.equal(op, 'eq'); assert.equal(value, '{}'); this.filters.push(row => Array.isArray(row[field]) && row[field].length > 0); return this }
  lt(field: string, value: string) { this.filters.push(row => field === 'created_at' ? timestamp(row[field]) < timestamp(value) : row[field] < value); return this }
  gt(field: string, value: string) { this.filters.push(row => row[field] > value); return this }
  or(expression: string) {
    const suppression = /^target_type\.gt\.(author|post),and\(target_type\.eq\.(author|post),target_id\.gt\.([0-9a-f-]+)\)$/i.exec(expression)
    if (suppression) {
      assert.equal(suppression[1], suppression[2])
      this.filters.push(row => row.target_type > suppression[1] || row.target_type === suppression[1] && row.target_id > suppression[3])
      return this
    }
    const match = /^created_at\.lt\.([^,]+),and\(created_at\.eq\.([^,]+),id\.lt\.([0-9a-f-]+)\)$/i.exec(expression)
    assert.ok(match, `unexpected cursor filter: ${expression}`)
    assert.equal(match[1], match[2])
    this.filters.push(row => timestamp(row.created_at) < timestamp(match[1]) || timestamp(row.created_at) === timestamp(match[1]) && row.id < match[3])
    return this
  }
  order(field: string, options: { ascending: boolean }) { this.sorts.push({ field, ascending: options.ascending }); return this }
  limit(count: number) { this.max = count; return this }
  abortSignal(signal: AbortSignal) { assert.ok(signal instanceof AbortSignal); return this }
  range(from: number, to: number) { this.start = from; this.max = to - from + 1; return this }
  then<TResult1 = { data: Row[] | null; error: Error | null; count: number | null }, TResult2 = never>(resolve?: ((value: { data: Row[] | null; error: Error | null; count: number | null }) => TResult1 | PromiseLike<TResult1>) | null, reject?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null): PromiseLike<TResult1 | TResult2> {
    this.db.requests.push(this.table)
    if (this.db.failed.has(this.table)) return Promise.resolve({ data: null, error: new Error('fixture unavailable'), count: null }).then(resolve, reject)
    const source = (this.db.rows[this.table] ?? []).filter(row => this.table !== 'posts' || row.visibility !== 'private')
      .filter(row => {
        if (this.table !== 'reposts' || !this.db.repostRls) return true
        const actor = (this.db.rows.users ?? []).find(user => user.id === row.user_id)
        const followed = (this.db.rows.follows ?? []).some(follow => follow.follower_id === this.db.viewerId && follow.following_id === row.user_id)
        return row.user_id === this.db.viewerId || actor?.is_private === false || actor?.is_private === true && followed
      })
      .map(row => this.table === 'reposts' && row.post?.visibility === 'private' ? { ...row, post: null } : row)
    const matches = source.filter(row => this.filters.every(filter => filter(row))).sort((a, b) => {
      for (const { field, ascending } of this.sorts) {
        const left = field === 'created_at' ? timestamp(a[field]) : a[field]
        const right = field === 'created_at' ? timestamp(b[field]) : b[field]
        const compare = left < right ? -1 : left > right ? 1 : 0
        if (compare) return ascending ? compare : -compare
      }
      return 0
    })
    const result = matches.slice(this.start, this.start + Math.min(this.max, this.db.maxRows))
    return Promise.resolve({ data: result, error: null, count: this.exact ? matches.length : null }).then(resolve, reject)
  }
}
class FakeDb {
  requests: string[] = []
  failed = new Set<string>()
  maxRows = Infinity
  repostRls = false
  viewerId: string | null = null
  constructor(public rows: Record<string, Row[]>) {}
  from(table: string) { return new FakeQuery(this, table) }
  client() { return this as unknown as SupabaseClient }
}

async function allPages(fetch: (cursor: string | null) => Promise<{ posts: Row[]; nextCursor: string | null; hasMore: boolean }>) {
  const pages: Row[][] = [], cursors = new Set<string>()
  let cursor: string | null = null
  for (let i = 0; i < 30; i++) {
    const page = await fetch(cursor); pages.push(page.posts)
    if (!page.hasMore) { assert.equal(page.nextCursor, null); return pages }
    assert.ok(page.nextCursor); assert.ok(!cursors.has(page.nextCursor), 'cursor must advance')
    cursor = page.nextCursor; cursors.add(cursor)
  }
  throw new Error('pagination failed to terminate')
}
const ids = (pages: Row[][]) => pages.flat().map(row => row.reposted_by ? `r:${row.id}` : `p:${row.id}`)

test('feed keeps the unreturned tail when both source queries are short', async () => {
  const originals = Array.from({ length: 15 }, (_, i) => post(i + 1, time(59 - i)))
  const shares = Array.from({ length: 15 }, (_, i) => repost(i + 1, post(i + 101), time(44 - i)))
  const db = new FakeDb({ posts: originals, reposts: shares })
  const pages = await allPages(cursor => fetchFeedPage(db.client(), { filter: 'latest', userId: null, blockedIds: [], cursor }))
  assert.deepEqual(pages.map(page => page.length), [20, 10])
  assert.equal(new Set(ids(pages)).size, 30)
})

test('feed preserves both streams across full pages and equal timestamps', async () => {
  const at = '2026-10-28T12:00:00.123456Z'
  const originals = Array.from({ length: 27 }, (_, i) => post(i + 1, at))
  const shares = Array.from({ length: 25 }, (_, i) => repost(i + 1, post(i + 101), at))
  const db = new FakeDb({ posts: originals, reposts: shares })
  const pages = await allPages(cursor => fetchFeedPage(db.client(), { filter: 'latest', userId: null, blockedIds: [], cursor }))
  assert.equal(pages.flat().length, 52); assert.equal(new Set(ids(pages)).size, 52)
  assert.ok(db.requests.filter(name => name === 'posts').length > 1)
})

test('microsecond ordering is preserved across sources and legacy cursors remain usable', async () => {
  const db = new FakeDb({ posts: [post(1, '2026-10-28T12:00:00.123001Z'), post(2, '2026-10-28T11:59:59.999999Z')], reposts: [repost(1, post(101), '2026-10-28T12:00:00.123999Z')] })
  const pages = await allPages(cursor => fetchFeedPage(db.client(), { filter: 'latest', userId: null, blockedIds: [], cursor, pageSize: 1 }))
  assert.deepEqual(ids(pages), [`r:${uuid(101)}`, `p:${uuid(1)}`, `p:${uuid(2)}`])
  const legacy = await fetchFeedPage(db.client(), { filter: 'latest', userId: null, blockedIds: [], cursor: '2026-10-28T12:00:00.123999Z' })
  assert.deepEqual(ids([legacy.posts]), [`p:${uuid(1)}`, `p:${uuid(2)}`])
})

test('filtered, blocked and RLS-hidden rows advance without leaking or hiding later eligible posts', async () => {
  const viewer = uuid(7000), blocked = uuid(6000), muted = uuid(5000)
  const originals = Array.from({ length: 24 }, (_, i) => post(i + 1, time(59 - i), i < 20 ? blocked : uuid(9000)))
  originals.push({ ...post(50, time(10)), visibility: 'private' })
  const shares = [repost(1, post(101), time(57), muted), repost(2, { ...post(102), visibility: 'private' }, time(56)), repost(3, post(103), time(9))]
  const db = new FakeDb({ posts: originals, reposts: shares, feed_suppressions: [{ user_id: viewer, target_type: 'author', target_id: muted }] })
  const pages = await allPages(cursor => fetchFeedPage(db.client(), { filter: 'latest', userId: viewer, blockedIds: [blocked], cursor }))
  assert.equal(pages[0].length, 0, 'an empty filtered page can still have later results')
  assert.equal(pages.flat().length, 5)
  assert.ok(pages.flat().every(row => row.author_id !== blocked && row.id !== uuid(50) && row.id !== uuid(101) && row.id !== uuid(102)))
})

test('profile all, picks, reposts and media paginate without dropping mixed or tied rows', async () => {
  const owner = uuid(9000), at = '2026-10-28T12:00:00.222222Z'
  const originals = Array.from({ length: 15 }, (_, i) => post(i + 1, at, owner))
  const shares = Array.from({ length: 15 }, (_, i) => repost(i + 1, post(i + 101), at, owner))
  const db = new FakeDb({ posts: originals, reposts: shares })
  for (const [tab, count] of [['all', 30], ['picks', 30], ['reposts', 15], ['media', 15]] as const) {
    const pages = await allPages(cursor => fetchProfilePostsPage(db.client(), { userId: owner, tab, cursor }))
    assert.equal(pages.flat().length, count, tab); assert.equal(new Set(ids(pages)).size, count, tab)
  }
})

test('cursor filters reject arbitrary input and database failures do not masquerade as empty feeds', async () => {
  const db = new FakeDb({ posts: [], reposts: [] })
  await assert.rejects(fetchFeedPage(db.client(), { filter: 'latest', userId: null, blockedIds: [], cursor: '{"v":1,"posts":{"at":"bad),id.gt.x","id":"x"},"reposts":null}' }), InvalidFeedCursorError)
  for (const cursor of ['-1', '3foo', '50001', '1000000000000000000']) {
    await assert.rejects(fetchFeedPage(db.client(), { filter: 'top', userId: null, blockedIds: [], cursor }), InvalidFeedCursorError)
  }
  db.failed.add('posts')
  await assert.rejects(fetchFeedPage(db.client(), { filter: 'latest', userId: null, blockedIds: [] }), /unavailable/)
  db.failed.clear(); db.failed.add('feed_suppressions')
  await assert.rejects(fetchFeedPage(db.client(), { filter: 'latest', userId: uuid(7000), blockedIds: [] }), /preferences unavailable/)
})

test('picks, sport and following filters keep chronological order without duplicates across uneven batches', async () => {
  const viewer = uuid(7000), followed = uuid(7100), blocked = uuid(7200), other = uuid(7300)
  const originals: Row[] = Array.from({ length: 73 }, (_, i) => ({
    ...post(i + 1, time((i * 17) % 60), i % 5 === 0 ? blocked : i % 3 === 0 ? other : followed),
    sport: i % 4 === 0 ? 'NFL' : 'NBA', post_type: i % 7 === 0 ? 'text' : 'pick',
  }))
  const shares = Array.from({ length: 64 }, (_, i) => repost(i + 1, {
    ...post(i + 200), sport: i % 4 === 0 ? 'NFL' : 'NBA', post_type: i % 7 === 0 ? 'text' : 'pick',
  }, time((i * 19) % 60), i % 6 === 0 ? blocked : i % 2 ? followed : other))
  const db = new FakeDb({ posts: originals, reposts: shares, follows: [{ follower_id: viewer, following_id: followed }] })
  for (const filter of ['picks', 'following'] as const) {
    const pages = await allPages(cursor => fetchFeedPage(db.client(), { filter, userId: viewer, blockedIds: [blocked], cursor, sport: 'NBA', pageSize: 7 }))
    const result = pages.flat()
    assert.equal(new Set(ids(pages)).size, result.length)
    assert.ok(result.every(row => row.sport === 'NBA' && (filter !== 'picks' || row.post_type === 'pick')))
    const times = result.map(row => timestamp(row.repost_created_at ?? row.created_at))
    assert.ok(times.every((value, i) => i === 0 || times[i - 1] >= value), 'global order must remain chronological')
    const expectedPosts = originals.filter(row => row.sport === 'NBA' && row.author_id !== blocked
      && (filter !== 'picks' || row.post_type === 'pick') && (filter !== 'following' || row.author_id === followed)).length
    const expectedShares = shares.filter(row => row.post.sport === 'NBA' && row.user_id !== blocked
      && (filter !== 'picks' || row.post.post_type === 'pick') && (filter !== 'following' || row.user_id === followed)).length
    assert.equal(result.length, expectedPosts + expectedShares)
  }
})

test('suppression and following lists continue past the API row cap and following filters are chunked', async () => {
  const viewer = uuid(7000)
  const followed = Array.from({ length: 1100 }, (_, i) => uuid(30000 + i))
  const suppressions = Array.from({ length: 1001 }, (_, i) => ({ user_id: viewer, target_type: 'post', target_id: uuid(50000 + i) }))
  const target = post(51000, time(30), followed[1099])
  const visible = post(40000, time(29), followed[1099])
  const db = new FakeDb({ posts: [target, visible], reposts: [], feed_suppressions: suppressions,
    follows: followed.map(following_id => ({ follower_id: viewer, following_id })) })
  db.maxRows = 200
  const pages = await allPages(cursor => fetchFeedPage(db.client(), { filter: 'following', userId: viewer, blockedIds: [], cursor }))
  assert.deepEqual(ids(pages), [`p:${visible.id}`])
  assert.ok(db.requests.filter(name => name === 'feed_suppressions').length >= 2)
  assert.ok(db.requests.filter(name => name === 'follows').length >= 2)
  assert.equal(db.requests.filter(name => name === 'posts').length, 11)
})

test('relation overflow fails closed instead of silently dropping preferences', async () => {
  const viewer = uuid(7000)
  const suppressions = Array.from({ length: 10001 }, (_, i) => ({ user_id: viewer, target_type: 'post', target_id: uuid(50000 + i) }))
  const db = new FakeDb({ posts: [], reposts: [], feed_suppressions: suppressions })
  await assert.rejects(fetchFeedPage(db.client(), { filter: 'latest', userId: viewer, blockedIds: [] }), /supported limit/)
  const following = Array.from({ length: 2001 }, (_, i) => ({ follower_id: viewer, following_id: uuid(80000 + i) }))
  const followDb = new FakeDb({ posts: [], reposts: [], follows: following })
  await assert.rejects(fetchFeedPage(followDb.client(), { filter: 'following', userId: viewer, blockedIds: [] }), /supported limit/)
})

test('feed and profiles do not widen actor visibility provided by RLS', async () => {
  const viewer = uuid(7000), privateActor = uuid(8000), publicActor = uuid(8001)
  const privateShare = repost(1, post(101), time(50), privateActor)
  const publicShare = repost(2, post(102), time(49), publicActor)
  const db = new FakeDb({ posts: [], reposts: [privateShare, publicShare], users: [
    { id: privateActor, is_private: true }, { id: publicActor, is_private: false },
  ], follows: [{ follower_id: viewer, following_id: privateActor }] })
  db.repostRls = true
  const anonymous = await fetchFeedPage(db.client(), { filter: 'latest', userId: null, blockedIds: [] })
  assert.deepEqual(ids([anonymous.posts]), [`r:${uuid(102)}`])
  db.viewerId = viewer
  const followed = await fetchFeedPage(db.client(), { filter: 'latest', userId: viewer, blockedIds: [] })
  assert.equal(followed.posts.length, 2)
  db.viewerId = null
  const profile = await fetchProfilePostsPage(db.client(), { userId: privateActor, tab: 'reposts' })
  assert.equal(profile.posts.length, 0)
})
