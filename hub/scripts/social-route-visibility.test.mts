import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { build } from 'esbuild'

const require = createRequire(import.meta.url)
const viewer = '00000000-0000-0000-0000-000000000001'
const owner = '00000000-0000-0000-0000-000000000002'
const fixture = {
  user: { id: viewer } as { id: string } | null, authError: null as { name: string } | null,
  blocksError: null as object | null, private: false, ownerError: null as object | null,
  follows: false, followsError: null as object | null, reads: 0,
}
const client = {
  auth: { getUser: async () => ({ data: { user: fixture.user }, error: fixture.authError }) },
  from(table: string) {
    const query = {
      select: () => query, or: () => query, eq: () => query, order: () => query,
      limit: async () => ({ data: fixture.blocksError ? null : [], error: fixture.blocksError }),
      range: async () => ({ data: fixture.blocksError ? null : [], error: fixture.blocksError }),
      maybeSingle: async () => table === 'users' ? { data: fixture.ownerError ? null : { is_private: fixture.private }, error: fixture.ownerError }
        : { data: fixture.follows ? { follower_id: viewer } : null, error: fixture.followsError },
    }
    return query
  },
}
class InvalidFeedCursorError extends Error {}
Object.assign(globalThis, { socialRouteFixture: { fixture, client, InvalidFeedCursorError } })
const stubs: Record<string, string> = {
  'server-only': 'export {}',
  'next/server': 'export const NextResponse={json:(data,options)=>Response.json(data,options)}',
  '@/lib/supabase/server': 'export const createClient=async()=>globalThis.socialRouteFixture.client',
  '@/lib/queries': 'export const attachUserReactions=async(posts)=>posts',
  '@/lib/feedPagination': 'export const InvalidFeedCursorError=globalThis.socialRouteFixture.InvalidFeedCursorError',
  '@/lib/feedQuery': 'export const feedSport=()=>null;export const fetchFeedPage=async()=>{globalThis.socialRouteFixture.fixture.reads++;return {posts:[{id:"feed"}],nextCursor:null,hasMore:false}};export const fetchProfilePostsPage=async()=>{globalThis.socialRouteFixture.fixture.reads++;return {posts:[{id:"profile"}],nextCursor:null,hasMore:false}}',
}
const bundle = await build({
  stdin: { contents: 'export {GET as feed} from "./src/app/api/feed/route";export {GET as profile} from "./src/app/api/profile-posts/route"', resolveDir: resolve('.'), loader: 'ts' },
  bundle: true, write: false, platform: 'node', format: 'cjs', tsconfig: 'tsconfig.json',
  plugins: [{ name: 'social-route-fixture', setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => args.path in stubs ? { path: args.path, namespace: 'fixture' } : undefined)
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: stubs[args.path], loader: 'ts' }))
  } }],
})
const compiled = { exports: {} as { feed: (req: Request) => Promise<Response>; profile: (req: Request) => Promise<Response> } }
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(require, compiled, compiled.exports)
const feed = () => compiled.exports.feed(new Request('https://slipsurge.com/api/feed'))
const profile = (id = owner) => compiled.exports.profile(new Request(`https://slipsurge.com/api/profile-posts?userId=${encodeURIComponent(id)}`))
function reset() { Object.assign(fixture, { user: { id: viewer }, authError: null, blocksError: null, private: false, ownerError: null, follows: false, followsError: null, reads: 0 }) }

test('transient auth or block lookup errors stop both routes before reading content', async () => {
  for (const failure of ['auth', 'blocks']) {
    reset()
    if (failure === 'auth') { fixture.user = null; fixture.authError = { name: 'AuthRetryableFetchError' } }
    else fixture.blocksError = { code: 'PGRST002' }
    assert.equal((await feed()).status, 503)
    assert.equal((await profile()).status, 503)
    assert.equal(fixture.reads, 0)
  }
})

test('confirmed missing sessions retain public guest access, and malformed IDs are rejected', async () => {
  reset(); fixture.user = null; fixture.authError = { name: 'AuthSessionMissingError' }
  assert.equal((await feed()).status, 200)
  assert.equal((await profile()).status, 200)
  assert.equal(fixture.reads, 2)
  assert.equal((await profile('x),blocked_id.eq.bad')).status, 400)
  assert.equal(fixture.reads, 2)
})

test('private profile posts and repost activity require owner or confirmed follower', async () => {
  reset(); fixture.private = true
  let response = await profile()
  assert.deepEqual((await response.json()).posts, []); assert.equal(fixture.reads, 0)
  fixture.user = null; fixture.authError = { name: 'AuthSessionMissingError' }
  response = await profile(); assert.deepEqual((await response.json()).posts, []); assert.equal(fixture.reads, 0)
  fixture.user = { id: viewer }; fixture.authError = null; fixture.followsError = { code: 'PGRST002' }
  assert.equal((await profile()).status, 503); assert.equal(fixture.reads, 0)
  fixture.followsError = null; fixture.follows = true
  response = await profile(); assert.equal(response.status, 200); assert.equal(fixture.reads, 1)
  fixture.user = { id: owner }; fixture.follows = false
  response = await profile(); assert.equal(response.status, 200); assert.equal(fixture.reads, 2)
})
