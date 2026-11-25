import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { build } from 'esbuild'

const viewer = 'aa92d4b2-a7d8-43af-8f2d-c5a741bf10d2'
const blocked = '4ffcabe0-b625-402c-994b-6272716e219a'
const saved = 'a43f3a69-ddd3-4be5-8aa4-a5d5ca12204c'
const visiblePost = { id: 'p1', author_id: viewer, sport: 'NBA', created_at: '2026-11-25T12:00:00Z',
  content: 'No player name here', pick_data: { legs: [{ player_name: 'Search Fixture' }] } }
const otherPost = { ...visiblePost, id: 'p2', author_id: blocked }
const mlbPost = { ...visiblePost, id: 'p3', sport: 'MLB' }
const calls: unknown[] = []
const fixture = {
  basic: true, mlb: false,
  client: {
    from(table: string) {
      let contentFilter = false
      let isPick = false
      let excluded = false
      let write: Record<string, unknown> | null = null
      return {
        select() { return this },
        eq(column: string, value: string) { calls.push([table, column, value]); return this },
        ilike() { contentFilter = true; return this },
        in(column: string) { if (column === 'post_type') isPick = true; return this },
        gte() { return this },
        not(column: string, _op: string, contents: string) {
          excluded = column === 'author_id' && contents.includes(blocked)
          return this
        },
        or(value: string) { calls.push([table, value]); return this },
        order() { return this },
        limit(amount: number) { calls.push([table, amount]); return this },
        delete() { calls.push([table, 'delete']); return this },
        update() { calls.push([table, 'touch']); return this },
        upsert(payload: Record<string, unknown>) { write = payload; calls.push([table, 'save', payload]); return this },
        async single() { return { data: write ? { id: saved, query: write.query } : null, error: null } },
        then<T>(resolve: (value: { data: unknown[]; error: null }) => T) {
          const posts = isPick && contentFilter ? [] : [visiblePost, otherPost, mlbPost]
          return Promise.resolve(resolve({ data: table === 'posts' ? posts.filter(row => !excluded || row.author_id !== blocked) : [], error: null }))
        },
      }
    },
  },
}
Object.assign(globalThis, { discoveryFixture: fixture })
const stubs: Record<string, string> = {
  'next/server': 'export const NextResponse = Response',
  '@/lib/blocks': `export const getBlockedEitherWayIds = async () => ['${blocked}'];
    export const isAccountId = id => /^[a-f0-9-]{36}$/.test(id);`,
  '@/lib/featureFlags': 'export const FEATURE_FLAGS = {}',
  '@/lib/featureFlags.server': 'export const isFeatureEnabledServer = async () => false',
  '@/lib/exploreActiveMembers': 'export const exploreSpotlightMembers = async () => []',
  '@/lib/feedQuery': "export const POST_WITH_AUTHOR = '*'",
  '@/lib/mlbViewerAccess': 'export const canViewMlb = async () => globalThis.discoveryFixture.mlb',
  '@/lib/nativeSocial': 'export const mobilePost = row => row',
  '@/lib/queries': 'export const attachUserReactions = async rows => rows',
  '@/lib/visiblePickRecords': 'export const fetchVisiblePickRecords = async () => ({ records: new Map() }); export const hydrateVisibleAuthorRecords = async (_, posts) => ({ posts });',
  '@/lib/requireTier': `export const requireVerifiedUserTier = async () => globalThis.discoveryFixture.basic ? {} :
    { error: Response.json({}, { status: 403 }) };`,
  '@/lib/supabase/nativeAccount': `export const requireNativeAccount = async req =>
    req.headers.get('authorization') === 'Bearer viewer' ? { userId: '${viewer}', supabase: globalThis.discoveryFixture.client } :
      { error: Response.json({}, { status: 401 }) };`,
}
const bundle = await build({
  stdin: { contents: `export * as Search from './src/app/api/mobile/search/route';
    export * as Topics from './src/app/api/mobile/topics/route';
    export * as Explore from './src/app/api/mobile/explore/route';`, resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'node', format: 'cjs', tsconfig: 'tsconfig.json',
  plugins: [{ name: 'native-discovery-test', setup(plugin) {
    plugin.onResolve({ filter: /.*/ }, arg => Object.hasOwn(stubs, arg.path) ? { path: arg.path, namespace: 'fixture' } : undefined)
    plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, arg => ({ contents: stubs[arg.path] }))
  } }],
})
const module = { exports: {} as {
  Search: typeof import('../src/app/api/mobile/search/route')
  Topics: typeof import('../src/app/api/mobile/topics/route')
  Explore: typeof import('../src/app/api/mobile/explore/route')
} }
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports)
const { Search, Topics, Explore } = module.exports
const req = (query: string, authorized = true, method = 'GET', body?: unknown) => new Request(`https://fixture.invalid/mobile?${query}`, {
  method, headers: authorized ? { authorization: 'Bearer viewer' } : {}, body: body === undefined ? undefined : JSON.stringify(body),
})

test('native discovery retains Basic and tight topic/query parameters', async () => {
  assert.equal((await Search.GET(req('q=anything', false))).status, 401)
  fixture.basic = false
  assert.equal((await Search.GET(req('q=anything'))).status, 403)
  assert.equal((await Topics.GET(req('tag=NBA'))).status, 403)
  assert.equal((await Explore.GET(req(''))).status, 403)
  fixture.basic = true
  assert.equal((await Search.GET(req('q=x&q=y'))).status, 400)
  assert.equal((await Topics.GET(req('tag=NBA&tag=NFL'))).status, 400)
  assert.equal((await Topics.GET(req('tag=NBA%2Ftest'))).status, 400)
})

test('Explore picks and trending use visible public cards with independent ordering', async () => {
  calls.length = 0
  assert.equal((await Explore.GET(req('', false))).status, 401)
  const result = await Explore.GET(req(''))
  assert.equal(result.status, 200)
  const body = await result.json()
  assert.deepEqual(body.trendingPicks, [visiblePost])
  assert.deepEqual(body.trendingPosts, [visiblePost])
  assert.deepEqual(body.pages, [])
  assert.ok(calls.some(call => Array.isArray(call) && call.join(':') === 'posts:post_type:pick'))
  assert.equal(calls.filter(call => Array.isArray(call) && call.join(':') === 'posts:visibility:public').length, 2)
})

test('trackable picks match the stored player data and exclude blocked and hidden league content', async () => {
  const response = await Search.GET(req('tab=picks&q=Search%20Fixture'))
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
  assert.deepEqual((await response.json()).posts, [visiblePost])
  assert.ok(calls.some(call => Array.isArray(call) && call[0] === 'posts' && call[1] === 150))
  assert.equal((await Topics.GET(req('tag=MLB'))).status, 404)
  assert.deepEqual((await (await Topics.GET(req('tag=NBA'))).json()).posts, [visiblePost])
})

test('saved searches use the verified owner for creation, recency and removal', async () => {
  calls.length = 0
  assert.equal((await Search.GET(req('view=saved'))).status, 200)
  assert.ok(calls.some(call => Array.isArray(call) && call.join(':') === `saved_searches:user_id:${viewer}`))
  calls.length = 0
  assert.equal((await Search.POST(req('', true, 'POST', { query: ' Mixed Case ', tab: 'nba', user_id: blocked }))).status, 200)
  assert.equal((await Search.PATCH(req(`id=${saved}`, true, 'PATCH'))).status, 200)
  assert.equal((await Search.DELETE(req(`id=${saved}`, true, 'DELETE'))).status, 200)
  const write = calls.find(call => Array.isArray(call) && call[1] === 'save') as [string, string, Record<string, unknown>]
  assert.equal(write[2].user_id, viewer)
  assert.equal(write[2].query, 'Mixed Case')
  assert.equal(write[2].query_key, 'mixed case')
  assert.equal(calls.filter(call => Array.isArray(call) && call.join(':') === `saved_searches:user_id:${viewer}`).length, 2)
})
