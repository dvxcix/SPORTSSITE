import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { build } from 'esbuild'

const user = '7faffcca-294a-49dc-9c86-fc3f09eaba23'
const id = 'c2bd41c2-e513-4bdc-b572-3f5c7997b011'
const card = { id, slug: 'test-community', name: 'Test community', sport: 'NBA', access_type: 'paid', is_public: false }
const fixture = {
  group: null as null | typeof card,
  paid: [] as (typeof card & { price: number })[],
  invitation: null as null | (typeof card & { invitationId: string }),
  allowMlb: false,
  joined: false,
  reads: [] as string[],
  client: {
    from(table: string) {
      return {
        select() { return this },
        eq(field: string, value: string) {
          fixture.reads.push(`${table}.${field}=${value}`)
          return this
        },
        async maybeSingle() {
          return { data: table === 'groups' ? fixture.group : fixture.joined ? { group_id: id } : null, error: null }
        },
      }
    },
  },
}
const stubs: Record<string, string> = {
  'server-only': '',
  'next/server': 'export const NextResponse = Response',
  '@/lib/creatorDirectoryServer': 'export const loadPublicCreators = async () => []',
  '@/lib/leaderboardServer': 'export const loadPublicLeaderboard = async () => []',
  '@/lib/nativeSocial': 'export const nativeAnonymousClient = () => globalThis.sharedLinkFixture.client',
  '@/lib/supabase/nativeAccount': `export const requireNativeAccount = async request =>
    request.headers.get('authorization') === 'Bearer member' ? { supabase: globalThis.sharedLinkFixture.client, userId: '${user}' } :
      { error: Response.json({}, {status: 401}) }`,
  '@/lib/blocks': 'export const getBlockedEitherWayIds = async () => []',
  '@/lib/mlbViewerAccess': 'export const canViewMlb = async () => globalThis.sharedLinkFixture.allowMlb',
  '@/lib/creatorCommunityDirectory': `
    export const publishedPaidCommunities = async ({slug}) => globalThis.sharedLinkFixture.paid.filter(row => row.slug === slug);
    export const invitedCommunityEntry = async (_, slug) => globalThis.sharedLinkFixture.invitation?.slug === slug ? globalThis.sharedLinkFixture.invitation : null;
    export const invitedCommunityEntries = async () => [];`,
}
Object.assign(globalThis, { sharedLinkFixture: fixture })
const source = await build({
  entryPoints: ['src/app/api/mobile/discover/route.ts'], bundle: true, write: false, platform: 'node', format: 'cjs',
  plugins: [{ name: 'shared-link-fixture', setup(plugin) {
    plugin.onResolve({ filter: /.*/ }, arg => Object.hasOwn(stubs, arg.path) ? { path: arg.path, namespace: 'fixture' } : undefined)
    plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, arg => ({ contents: stubs[arg.path] }))
  } }],
})
const module = { exports: {} as typeof import('../src/app/api/mobile/discover/route') }
new Function('require', 'module', 'exports', source.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports)
const get = (query: string, token?: string) => module.exports.GET(new Request(`https://fixture.invalid/api/mobile/discover?${query}`, {
  headers: token ? { authorization: `Bearer ${token}` } : {},
}))
const link = 'resource=communities&slug=test-community'

test('exact community links validate the route before lookup', async () => {
  assert.equal((await get('resource=creators&slug=test-community')).status, 400)
  assert.equal((await get(link + '&slug=other')).status, 400)
  assert.equal((await get('resource=communities&slug=embedded%2Fpath')).status, 400)
  assert.equal((await get(link, 'invalid')).status, 401)
  assert.deepEqual(fixture.reads, [])
})

test('anonymous exact lookup respects visibility and exposes only published offers', async () => {
  fixture.invitation = { ...card, invitationId: 'private' }
  assert.equal((await get(link)).status, 404)
  fixture.paid = [{ ...card, price: 10 }]
  const result = await get(link)
  assert.equal(result.status, 200)
  assert.equal(result.headers.get('cache-control'), 'private, no-store')
  assert.deepEqual(await result.json(), { group: { ...card, price: 10 }, member: false })
  assert.equal(fixture.reads.every(query => query === 'groups.slug=test-community'), true)
})

test('invited viewers see an invite and a joined viewer sees only their own membership', async () => {
  fixture.paid = []
  assert.deepEqual(await (await get(link, 'member')).json(), { group: fixture.invitation, member: false })
  fixture.group = card
  fixture.joined = true
  assert.deepEqual(await (await get(link, 'member')).json(), { group: card, member: true })
  assert.ok(fixture.reads.includes(`group_members.user_id=${user}`))
  fixture.group = { ...card, sport: ' MLB ' }
  assert.equal((await get(link, 'member')).status, 404)
  fixture.allowMlb = true
  assert.equal((await get(link, 'member')).status, 200)
})
