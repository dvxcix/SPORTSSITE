import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { build } from 'esbuild'

const groupID = 'f72af066-e18a-46b1-ba03-8fb452b5643b'
const offerID = 'bcca2b08-7a07-42ff-bcaf-facc4552d84a'
const base = { name: 'Fixture Club', description: 'Fixture details', sport: 'NBA', emoji: '🏀', isPublic: true }
const calls: { name: string; args: Record<string, unknown> }[] = []
const fixture = {
  code: '', artworkFails: false, existing: false, allowMLB: false,
  database: {
    async rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args })
      if (name === 'update_community_group') return { error: fixture.artworkFails ? { code: 'fixture' } : null }
      return fixture.code ? { error: { code: fixture.code }, data: null } : { data: [{ group_id: groupID, group_slug: 'fixture-club' }] }
    },
    from() { return this }, select() { return this }, eq() { return this },
    async maybeSingle() {
      return { data: fixture.existing ? { id: groupID, ...base, is_public: true, avatar_url: null,
        banner_url: 'https://fixtures.invalid/banners/existing.jpg', creator_product_id: null } : null }
    },
  },
}
Object.assign(globalThis, { nativeCommunityCreateFixture: fixture })
const stubs: Record<string, string> = {
  'next/server': 'export const NextResponse = Response;',
  '@/lib/blocks': 'export const isAccountId = value => typeof value === "string" && /^[a-f0-9-]{36}$/.test(value);',
  '@/lib/mlbViewerAccess': 'export const canViewMlb = async () => globalThis.nativeCommunityCreateFixture.allowMLB;',
  '@/lib/nativeMedia': 'export const isOwnedNativeMedia = (value, _, kind) => typeof value === "string" && value.startsWith(`https://fixtures.invalid/${kind}/`);',
  '@/lib/supabase/nativeAccount': `export const requireNativeAccount = async req => req.headers.has('authorization')
    ? {supabase:globalThis.nativeCommunityCreateFixture.database,userId:'fixture'} : {error:Response.json({}, {status:401})};`,
}
const bundle = await build({
  entryPoints: ['src/app/api/mobile/communities/route.ts'], bundle: true, write: false, platform: 'node', format: 'cjs',
  plugins: [{ name: 'create-community-fixture', setup(plugin) {
    plugin.onResolve({ filter: /.*/ }, arg => Object.hasOwn(stubs, arg.path) ? { path: arg.path, namespace: 'fixture' } : undefined)
    plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, arg => ({ contents: stubs[arg.path] }))
  } }],
})
const module = { exports: {} as typeof import('../src/app/api/mobile/communities/route') }
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports)
const submit = (body: unknown, member = true) => module.exports.POST(new Request('https://fixture.invalid/api/mobile/communities', {
  method: 'POST', body: JSON.stringify(body), headers: member ? { authorization: 'Bearer fixture' } : {},
}))

test('community creation keeps the guest, MLB and account-owned artwork gates', async () => {
  assert.equal((await submit(base, false)).status, 401)
  assert.equal((await submit({ ...base, sport: 'MLB' })).status, 403)
  assert.equal((await submit({ ...base, avatarUrl: 'https://other.invalid/logo.png' })).status, 400)
  assert.deepEqual(calls, [])
})

test('paid communities stay private and successful creation survives optional image failure', async () => {
  fixture.artworkFails = true
  const result = await submit({ ...base, offerId: offerID, avatarUrl: 'https://fixtures.invalid/avatars/logo.jpg' })
  assert.equal(result.status, 201)
  assert.deepEqual(await result.json(), { id: groupID, slug: 'fixture-club', existing: false, artworkSaved: false })
  assert.equal(calls[0].args.p_is_public, false)
  assert.equal(calls[0].args.p_creator_product_id, offerID)
  assert.equal(calls[1].args.p_group_id, groupID)
  fixture.artworkFails = false
})

test('an identical retry recovers the existing owned group and preserves artwork', async () => {
  fixture.code = '23505'
  assert.equal((await submit(base)).status, 409)
  fixture.existing = true
  const result = await submit({ ...base, avatarUrl: 'https://fixtures.invalid/avatars/logo.jpg' })
  assert.equal(result.status, 200)
  assert.equal((await result.json()).existing, true)
  assert.equal(calls.at(-1)?.args.p_banner_url, 'https://fixtures.invalid/banners/existing.jpg')
  fixture.code = ''
  fixture.existing = false
})
