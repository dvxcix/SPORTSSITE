import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { build } from 'esbuild'

const creator = { id: 'ed6cc601-bd39-4003-b1cf-a155ee5426b6', username: 'creator-fixture', display_name: 'Creator', account_type: 'creator' }
const member = 'd4da0453-807b-40ab-8e3e-90d4224d591b'
const product = { id: '2dc56a39-71b7-4fed-b4dd-7cd8ee4703a2', creator_id: creator.id, title: 'Fixture Membership', status: 'active', price: '14.99' }
const community = { id: 'a8c09348-a47b-4d46-b878-baf3bed0d7b2', owner_id: creator.id, creator_product_id: product.id, slug: 'fixture', sport: 'NBA' }
const mlb = { ...community, id: '45bf28fd-7dbb-44a8-95cd-10583a5eb38a', slug: 'baseball-fixture', sport: 'MLB' }
const filters: string[] = []
const fixture = { blocked: false, allowedMLB: false, active: true, lookups: 0 }
const client = {
  from(table: string) {
    fixture.lookups++
    const where = new Map<string, string>()
    function data() {
      switch (table) {
        case 'users': return [creator]
        case 'creator_products':
          if (where.get('status') === 'paused') return fixture.active ? [] : [{ id: product.id, creator_id: creator.id }]
          return fixture.active ? [product] : []
        case 'creator_storefronts': return [{ creator_id: creator.id, name: 'Fixture Store', sports: ['NBA', 'MLB'], tags: [] }]
        case 'posts': return [
          { id: 'public', visibility: 'public', sport: 'NBA', group_id: null },
          { id: 'hidden', visibility: 'public', sport: 'MLB', group_id: null },
          { id: 'premium', visibility: 'public', sport: 'NBA', is_premium: true, group_id: null },
        ]
        case 'creator_entitlements': return [{ product_id: product.id, status: 'active' }]
        case 'group_members': return [{ group_id: community.id }]
        case 'follows': return [{ following_id: creator.id }]
        default: return []
      }
    }
    return {
      select() { return this },
      eq(key: string, value: string) { where.set(key, value); filters.push(`${table}.${key}=${value}`); return this },
      is() { return this }, in() { return this }, order() { return this }, limit() { return this },
      async maybeSingle() { return { data: data()[0] ?? null } },
      then(resolve: (value: unknown) => void) { resolve({ data: data() }) },
    }
  },
}
Object.assign(globalThis, { nativeCreatorFixture: { fixture, client, community, mlb } })
const stubs: Record<string, string> = {
  'next/server': 'export const NextResponse = Response;',
  '@/lib/blocks': `export const isAccountId = id => /^[a-f0-9-]{36}$/.test(id); export const isBlockedEitherWay = async () => globalThis.nativeCreatorFixture.fixture.blocked;`,
  '@/lib/creatorCommerce': 'export const hasCurrentCreatorAccess = item => item.status === "active";',
  '@/lib/creatorCommunityDirectory': 'export const publishedPaidCommunities = async () => [globalThis.nativeCreatorFixture.community, globalThis.nativeCreatorFixture.mlb];',
  '@/lib/feedQuery': 'export const POST_WITH_AUTHOR = "*";',
  '@/lib/mlbViewerAccess': 'export const canViewMlb = async () => globalThis.nativeCreatorFixture.fixture.allowedMLB;',
  '@/lib/nativeSocial': `export const nativeAnonymousClient = () => globalThis.nativeCreatorFixture.client;
    export const isGuestVisible = post => post.visibility === 'public' && !post.is_premium && post.group_id === null;
    export const mobilePost = post => post;`,
  '@/lib/queries': 'export const attachUserReactions = async posts => posts;',
  '@/lib/supabase/admin': 'export const createAdminClient = () => globalThis.nativeCreatorFixture.client;',
  '@/lib/supabase/nativeAccount': `export const requireNativeAccount = async req => req.headers.get('authorization') === 'Bearer fixture'
    ? {supabase: globalThis.nativeCreatorFixture.client, userId: '${member}'} : {error: Response.json({}, {status: 401})};`,
  '@/lib/visiblePickRecords': 'export const hydrateVisibleAuthorRecords = async (_client, posts) => ({posts});',
}
const bundle = await build({
  entryPoints: ['src/app/api/mobile/creator-storefront/route.ts'], bundle: true, write: false, platform: 'node', format: 'cjs',
  plugins: [{ name: 'creator-storefront-fixture', setup(plugin) {
    plugin.onResolve({ filter: /.*/ }, arg => Object.hasOwn(stubs, arg.path) ? { path: arg.path, namespace: 'fixture' } : undefined)
    plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, arg => ({ contents: stubs[arg.path] }))
  } }],
})
const module = { exports: {} as typeof import('../src/app/api/mobile/creator-storefront/route') }
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports)
const get = (query: string, token?: string) => module.exports.GET(new Request(`https://fixture.invalid/api/mobile/creator-storefront?${query}`, {
  headers: token ? { authorization: `Bearer ${token}` } : {},
}))

test('storefront links keep guest, blocked, active access and sport visibility separate', async () => {
  assert.equal((await get(`username=${creator.username}&offer=${product.id}`)).status, 400)
  assert.equal((await get(`username=${creator.username}`, 'invalid')).status, 401)
  assert.equal(fixture.lookups, 0)
  const query = `username=${creator.username}`
  const guest = await get(query)
  assert.equal(guest.headers.get('cache-control'), 'private, no-store')
  const storefront = await guest.json()
  assert.deepEqual(storefront.creator.sports, ['NBA'])
  assert.equal(storefront.creator.creator_products[0].price, 14.99)
  assert.deepEqual(storefront.groups.map((group: typeof community) => group.id), [community.id])
  assert.deepEqual(storefront.posts.map((post: { id: string }) => post.id), ['public'])
  assert.deepEqual(storefront.activeProductIds, [])
  const signed = await (await get(query, 'fixture')).json()
  assert.deepEqual(signed.activeProductIds, [product.id])
  assert.deepEqual(signed.joinedIds, [community.id])
  assert.equal(signed.following, true)
  fixture.blocked = true
  assert.equal((await get(query, 'fixture')).status, 404)
  fixture.blocked = false
})

test('exact public offer links retain live pricing and redact paused offers to signed-in access only', async () => {
  const query = `offer=${product.id}`
  const published = await (await get(query)).json()
  assert.equal(published.offer.id, product.id)
  assert.equal(published.offer.price, 14.99)
  assert.equal(published.community.id, community.id)
  assert.ok(filters.includes(`creator_products.id=${product.id}`))
  fixture.active = false
  assert.equal((await get(query)).status, 404)
  assert.deepEqual((await (await get(query, 'fixture')).json()).offer, { id: product.id, status: 'paused', title: 'Existing membership access' })
  fixture.blocked = true
  assert.equal((await get(query, 'fixture')).status, 404)
  fixture.blocked = false
  fixture.active = true
})
