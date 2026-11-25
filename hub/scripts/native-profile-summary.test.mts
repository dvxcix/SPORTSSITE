import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { build } from 'esbuild'

const profileId = '11111111-1111-4111-8111-111111111111'
const viewer = '22222222-2222-4222-8222-222222222222'
const authorId = '33333333-3333-4333-8333-333333333333'
const post = { id: 'open', author_id: authorId, sport: 'NBA', group_id: null, visibility: 'public', is_premium: false,
  content: 'Saved open discussion', author: { username: 'analyst', display_name: 'Analyst' } }
const group = { id: 'nba-group', name: 'Hoops', access_type: 'open', is_public: true, sport: 'NBA' }
const profile = { id: profileId, username: 'fixture', account_type: 'fan', is_private: false, hide_win_rate: false }
const state = { approved: true, blocked: [] as string[], reads: [] as string[] }
const client = {
  from(table: string) {
    state.reads.push(table)
    const filters = new Map<string, unknown>()
    let countOnly = false
    function result() {
      if (countOnly) return { count: table === 'posts' ? 8 : 4, error: null }
      const rows: Record<string, unknown[]> = {
        users: [profile], creator_applications: state.approved ? [{ id: 'approval' }] : [],
        creator_products: filters.get('status') === 'active' ? [{ id: 'offer', price: '14.99', currency: 'usd' }] : [],
        groups: filters.get('is_public') ? [group, { ...group, id: 'mlb-group', sport: 'MLB' }] : [],
        group_members: [{ role: 'moderator', group }, { role: 'member', group: { ...group, id: 'private', is_public: false } }],
        comments: [
          post, { ...post, id: 'spoiler', is_spoiler: true }, { ...post, id: 'paid', is_premium: true },
          { ...post, id: 'baseball', sport: 'MLB' }, { ...post, id: 'blocked', author_id: 'blocked-author' },
        ].map(item => ({ id: `reply-${item.id}`, post_id: item.id, content: 'A reply', post: item })),
      }
      return { data: rows[table] ?? [], error: null }
    }
    return {
      select(_columns: string, options?: { head?: boolean }) { countOnly = Boolean(options?.head); return this },
      eq(key: string, value: unknown) { filters.set(key, value); return this },
      order() { return this }, limit() { return this },
      async maybeSingle() { return { data: result().data?.[0] ?? null, error: null } },
      then(resolve: (value: unknown) => void) { resolve(result()) },
    }
  },
}
Object.assign(globalThis, { profileSummaryFixture: { client, state } })
const stubs: Record<string, string> = {
  'next/server': 'export const NextResponse = Response',
  '@/lib/blocks': `export const isAccountId = id => /^[a-f0-9-]{36}$/.test(id); export const blockUser = async () => {};
    export const isBlockedEitherWay = async () => false; export const getBlockedEitherWayIds = async () => globalThis.profileSummaryFixture.state.blocked;`,
  '@/lib/feedQuery': 'export const fetchProfilePostsPage = async () => ({ posts: [], hasMore: false, nextCursor: null });',
  '@/lib/favoriteCatalog': 'export const getFavoriteCatalog = async () => [];',
  '@/lib/mlbViewerAccess': 'export const canViewMlb = async () => false;',
  '@/lib/nativeSocial': `export const nativeAnonymousClient = () => globalThis.profileSummaryFixture.client;
    export const isGuestVisible = item => item.visibility === "public" && !item.is_premium && item.group_id === null;
    export const mobilePost = item => item;`,
  '@/lib/nativeSocialPlatforms': 'export const socialPlatformColumns = "id"; export const nativePublicSocialLinks = () => [];',
  '@/lib/notify': 'export const notify = async () => {};',
  '@/lib/publicVerifiedIdentities': 'export const publicVerifiedIdentities = () => ({});',
  '@/lib/queries': 'export const attachUserReactions = async posts => posts;',
  '@/lib/sportFavorites': 'export const resolveFavoriteTeam = () => null;',
  '@/lib/sportTeamArtwork': 'export const sportTeamColors = () => null;',
  '@/lib/supabase/admin': 'export const createAdminClient = () => globalThis.profileSummaryFixture.client;',
  '@/lib/supabase/nativeAccount': `export const requireNativeAccount = async request => request.headers.get('authorization') === 'Bearer fixture'
    ? {supabase: globalThis.profileSummaryFixture.client,userId:'${viewer}'} : {error:Response.json({}, {status:401})};`,
  '@/lib/visibleFavorites': 'export const visibleFavorites = () => ({});',
  '@/lib/visiblePickRecords': `export const fetchVisiblePickRecords = async () => ({records:new Map([['${profileId}',{wins:3,losses:2}]])});`,
}
const bundle = await build({
  entryPoints: ['src/app/api/mobile/profiles/route.ts'], bundle: true, write: false, platform: 'node', format: 'cjs',
  plugins: [{ name: 'native-profile-summary', setup(plugin) {
    plugin.onResolve({ filter: /.*/ }, args => Object.hasOwn(stubs, args.path) ? { path: args.path, namespace: 'fixture' } : undefined)
    plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: stubs[args.path] }))
  } }],
})
const module = { exports: {} as typeof import('../src/app/api/mobile/profiles/route') }
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports)
const get = (selection = '', signed = false) => module.exports.GET(new Request(`https://fixture.invalid/api/mobile/profiles?user=fixture${selection}`, {
  headers: signed ? { authorization: 'Bearer fixture' } : {},
}))

test('profile summary shows visible counts and offers only for qualifying creator accounts', async () => {
  const response = await get()
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
  const summary = (await response.json()).profile
  assert.equal(summary.postCount, 8)
  assert.equal(summary.repostCount, 4)
  assert.equal(summary.record.wins, 3)
  assert.equal(summary.creator.offers[0].price, 14.99)
  assert.deepEqual(summary.creator.communities.map((item: typeof group) => item.id), [group.id])
  assert.equal('account_type' in summary, false)
  state.approved = false
  state.reads = []
  const ordinary = (await (await get()).json()).profile
  assert.equal(ordinary.creator, null)
  assert.equal(state.reads.includes('creator_products'), false)
  state.reads = []
  const cursorPage = (await (await get('&cursor=valid-fixture')).json()).profile
  assert.equal(cursorPage.postCount, null)
  assert.equal(state.reads.includes('posts'), false)
  state.approved = true
})

test('profile replies keep spoiler excerpts and gated threads private, and communities retain visible roles', async () => {
  const guest = await (await get('&tab=replies')).json()
  assert.deepEqual(guest.replies.map((reply: { postId: string }) => reply.postId), ['open', 'spoiler', 'blocked'])
  assert.equal(guest.replies[0].parentAuthor, 'Analyst')
  assert.equal(guest.replies[0].parentExcerpt, post.content)
  assert.equal(guest.replies[1].parentExcerpt, null)
  state.blocked = ['blocked-author']
  const member = await (await get('&tab=replies', true)).json()
  assert.deepEqual(member.replies.map((reply: { postId: string }) => reply.postId), ['open', 'spoiler', 'paid'])
  state.blocked = []
  const communities = await (await get('&tab=communities')).json()
  assert.deepEqual(communities.communities, [{ ...group, member_role: 'moderator' }])
  profile.is_private = true
  const privateProfile = await (await get('&tab=replies')).json()
  assert.equal(privateProfile.profile.record, null)
  assert.deepEqual(privateProfile.replies, [])
  profile.is_private = false
})
