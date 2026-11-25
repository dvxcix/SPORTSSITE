import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { build } from 'esbuild'
import { isNativePublicRead } from '../src/lib/publicBrowsePolicy'

const require = createRequire(import.meta.url)
const stubs: Record<string, string> = {
  'server-only': '',
  '@/lib/queries': 'export async function attachUserReactions(posts, userId, client, strict) { if (client.role !== "member" || !strict) throw Error("viewer state was not scoped"); return posts }',
  '@supabase/supabase-js': 'export function createClient() { return { role: "anon" } }',
  '@/lib/blocks': 'export async function getBlockedEitherWayIds() { return ["blocked-author"] }',
  '@/lib/feedQuery': `
    export const feedSport = sport => sport ?? undefined
    export async function fetchFeedPage(client, options) {
      const fixture = globalThis.nativeFeed
      fixture.calls.push({role: client.role, options})
      const post = {
        id: '00000000-0000-0000-0000-000000000001', group_id: null,
        visibility: 'public', is_premium: false, is_spoiler: true,
        post_type: 'text', content: 'Spoiler fixture',
        author: {username:'review', display_name:'Review Member', email:'private@example.invalid'},
        media_urls: [], reaction_count: 1, repost_count: 0, comment_count: 0,
        created_at: '2026-11-24T20:00:00Z',
      }
      return { nextCursor:'next', hasMore:true, posts: [
        post, {...post, id:'private', visibility:'private'}, {...post, id:'premium', is_premium:true},
        {...post, id:'community', group_id:'private-group'}
      ]}
    }`,
  '@/lib/feedPagination': 'export class InvalidFeedCursorError extends Error {}',
  '@/lib/mlbViewerAccess': 'export async function canViewMlb(client) { return client.role === "member" }',
  '@/lib/supabase/nativeAccount': `
    export async function requireNativeAccount(req) {
      return req.headers.get('authorization') === 'Bearer fixture-token'
        ? { userId: 'member', supabase: { role: 'member' } }
        : { error: Response.json({error:'Sign in required'}, {status:401}) }
    }`,
}
const fixture = { calls: [] as Array<{role: string; options: Record<string, unknown>}> }
Object.assign(globalThis, { nativeFeed: fixture })
const bundle = await build({
  stdin: { contents: 'export * from "./src/app/api/mobile/feed/route"', resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, write: false, format: 'cjs', platform: 'node', tsconfig: 'tsconfig.json',
  external: ['next/server'],
  plugins: [{ name: 'native-feed-fixture', setup(plugin) {
    plugin.onResolve({ filter: /.*/ }, args => args.path in stubs ? { path: args.path, namespace: 'fixture' } : undefined)
    plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: stubs[args.path], loader: 'js' }))
  } }],
})
const route = { exports: {} as typeof import('../src/app/api/mobile/feed/route') }
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(require, route, route.exports)
const read = (query: string, headers?: HeadersInit) => route.exports.GET(new Request('https://slipsurge.invalid/api/mobile/feed?' + query, { headers }))

test('only the exact native guest reads reach their public handlers', () => {
  assert.equal(isNativePublicRead('/api/mobile/feed', 'GET'), true)
  assert.equal(isNativePublicRead('/api/mobile/feed', 'POST'), false)
  assert.equal(isNativePublicRead('/api/mobile/feed/anything', 'GET'), false)
  assert.equal(isNativePublicRead('/api/feed', 'GET'), false)
  assert.equal(isNativePublicRead('/api/mobile/discover', 'GET'), true)
  assert.equal(isNativePublicRead('/api/mobile/scores', 'GET'), true)
  assert.equal(isNativePublicRead('/api/mobile/scores/game', 'GET'), true)
  assert.equal(isNativePublicRead('/api/mobile/scores/game/room', 'GET'), false)
  assert.equal(isNativePublicRead('/api/mobile/scores/game', 'POST'), false)
  assert.equal(isNativePublicRead('/api/mobile/profiles', 'GET'), true)
  assert.equal(isNativePublicRead('/api/mobile/profiles', 'POST'), false)
  assert.equal(isNativePublicRead('/api/mobile/profiles/admin', 'GET'), false)
  const post = '/api/mobile/posts/00000000-0000-4000-8000-000000000301'
  assert.equal(isNativePublicRead(post, 'GET'), true)
  for (const path of ['/api/mobile/feed', '/api/mobile/discover', '/api/mobile/scores', post]) {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) assert.equal(isNativePublicRead(path, method), false)
  }
  for (const path of ['/api/mobile/posts', post + '/edit', '/api/mobile/posts/undefined', '/api/mobile/account',
    '/api/mobile/communities/00000000-0000-4000-8000-000000000301', '/api/mobile/notifications', '/api/mobile/court/tools']) {
    assert.equal(isNativePublicRead(path, 'GET'), false)
  }
})

test('guest feed uses anonymous visibility, redacts the projection and cannot paginate or follow', async () => {
  const response = await read('filter=latest&sport=NFL', { cookie: 'existing-member-cookie=value' })
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
  const body = await response.json()
  assert.equal(body.posts.length, 1)
  assert.equal(body.posts[0].spoiler, true)
  assert.equal(body.posts[0].shareable, true)
  assert.equal('email' in body.posts[0].author, false)
  assert.equal(body.hasMore, false)
  assert.equal(body.nextCursor, null)
  assert.deepEqual(fixture.calls.at(-1), {
    role: 'anon', options: { filter: 'latest', userId: undefined, cursor: null, pageSize: 20, sport: 'NFL', hideMlb: true, blockedIds: [] },
  })
  assert.equal((await read('cursor=next')).status, 401)
  assert.equal((await read('filter=following')).status, 401)
  assert.equal((await read('filter=all')).status, 400)
})

test('failed native auth cannot fall back to guest and member feed keeps block filters and opaque cursors', async () => {
  const before = fixture.calls.length
  assert.equal((await read('', { authorization: 'Bearer rejected' })).status, 401)
  assert.equal(fixture.calls.length, before)
  const response = await read('filter=following&cursor=opaque', { authorization: 'Bearer fixture-token' })
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.deepEqual(body.posts.map((post: {shareable: boolean}) => post.shareable), [true, false, false, false])
  assert.equal(body.hasMore, true)
  assert.equal(body.nextCursor, 'next')
  assert.deepEqual(fixture.calls.at(-1), {
    role: 'member', options: { filter: 'following', userId: 'member', cursor: 'opaque', pageSize: 20, sport: undefined, hideMlb: false, blockedIds: ['blocked-author'] },
  })
})
