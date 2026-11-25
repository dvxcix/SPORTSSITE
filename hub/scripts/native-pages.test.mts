import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { build } from 'esbuild'

const member = '044cb383-5807-4e31-9167-8b0d7c44735c'
const other = '97e5d087-597e-4986-83c3-9e6854d10355'
const page = '5ffb8269-6a5b-4762-bbfe-f76de342cf6c'
const stubs: Record<string, string> = {
  '@/lib/supabase/nativeAccount': `export async function requireNativeAccount(request) {
    return request.headers.get('authorization') === 'Bearer member'
      ? {userId: '${member}', supabase: globalThis.pagesFixture.client}
      : {error: Response.json({}, {status: 401})}
  }`,
  '@/lib/supabase/adminDecisionActor': `export async function adminDecisionActor(request) {
    return request.headers.get('authorization') === 'Bearer admin'
      ? {user: {id: '${member}'}, admin: globalThis.pagesFixture.client}
      : {error: Response.json({}, {status: 403})}
  }`,
  '@/lib/featureFlags.server': 'export async function isFeatureEnabledServer() { return globalThis.pagesFixture.enabled }',
  './featureFlags.server': 'export async function isFeatureEnabledServer() { return globalThis.pagesFixture.enabled }',
  '@/lib/feedQuery': 'export const POST_WITH_AUTHOR = "fixture columns"',
  '@/lib/mlbViewerAccess': 'export async function canViewMlb() { return false }',
  '@/lib/nativeSocial': 'export const mobilePost = value => ({id: value.id})',
  '@/lib/queries': 'export async function attachUserReactions(values) { return values }',
  '@/lib/visiblePickRecords': 'export async function hydrateVisibleAuthorRecords(_, posts) { return {posts} }',
}
const code = await build({
  stdin: { contents: `export * from './src/app/api/mobile/pages/route'; export { nativePagePublishing } from './src/lib/nativePagePublishing';
    export { POST as adminChange } from './src/app/api/mobile/admin/publications/route';`,
    resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, platform: 'node', write: false, format: 'cjs', tsconfig: 'tsconfig.json', external: ['next/server'],
  plugins: [{ name: 'native-page-fixture', setup(plugin) {
    plugin.onResolve({ filter: /.*/ }, args => args.path in stubs ? {path: args.path, namespace: 'fixture'} : undefined)
    plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({contents: stubs[args.path], loader: 'js'}))
  } }],
})
const fixture = { exports: {} as typeof import('../src/app/api/mobile/pages/route') & typeof import('../src/lib/nativePagePublishing')
  & { adminChange: typeof import('../src/app/api/mobile/admin/publications/route')['POST'] } }
new Function('require', 'exports', 'module', code.outputFiles[0].text)(createRequire(import.meta.url), fixture.exports, fixture)
const { GET, POST, nativePagePublishing, adminChange } = fixture.exports
const request = (suffix = '', data?: unknown, authenticated = true) => new Request(`https://fixture.invalid/api/mobile/pages${suffix}`, {
  method: data === undefined ? 'GET' : 'POST', headers: authenticated ? {authorization: 'Bearer member'} : {},
  body: data === undefined ? undefined : JSON.stringify(data),
})

test('Pages requires a verified account and preserves rollouts and unpublished visibility', async () => {
  let reads = 0
  const state = { enabled: false, client: {from(table: string) {
    assert.equal(table, 'pages')
    reads++
    return {select() { return this }, eq() { return this }, async maybeSingle() { return {data: {id: page, owner_id: other, is_published: false}} }}
  }} }
  Object.assign(globalThis, {pagesFixture: state})
  const path = '?view=detail&slug=fixture'
  assert.equal((await GET(request(path, undefined, false))).status, 401)
  assert.equal((await GET(request(path))).status, 403)
  assert.equal(reads, 0)
  state.enabled = true
  assert.equal((await GET(request(path))).status, 404)
  assert.equal(reads, 1)
})

test('page publishing checks rollout and owns the exact destination', async () => {
  let canPublish = false
  let checked = 0
  const client = {from(table: string) {
    assert.equal(table, 'pages')
    const scope: Record<string, unknown> = {}
    return {select() { return this }, eq(key: string, value: unknown) { scope[key] = value; return this }, async maybeSingle() {
      checked++
      assert.deepEqual(scope, {id: page, owner_id: member})
      return {data: canPublish ? {id: page} : null}
    }}
  }} as unknown as Parameters<typeof nativePagePublishing>[0]
  const state = {enabled: false}
  Object.assign(globalThis, {pagesFixture: state})
  assert.equal((await nativePagePublishing(client, member, page)).status, 403)
  assert.equal(checked, 0)
  state.enabled = true
  assert.equal((await nativePagePublishing(client, member, 'invalid')).status, 400)
  assert.equal((await nativePagePublishing(client, member, page)).status, 403)
  canPublish = true
  assert.deepEqual(await nativePagePublishing(client, member, page), {id: page})
  assert.equal(checked, 2)
})

test('admin article and page actions preserve the publication visibility scope and reject ordinary members', async () => {
  const removed: string[] = []
  Object.assign(globalThis, {pagesFixture: {client: {from(table: string) {
    return {delete() { return this }, eq(field: string, value: string) {
      assert.equal(field, 'id'); assert.equal(value, page); return this
    }, or(filter: string) {
      const expected = table === 'blogs' ? `status.eq.published,author_id.eq.${member}` : `is_published.eq.true,owner_id.eq.${member}`
      assert.equal(filter, expected)
      return this
    }, select() { return this }, async maybeSingle() { removed.push(table); return {data: {id: page}} } }
  }}}})
  function adminRequest(kind: string, admin: boolean) {
    return new Request(`https://fixture.invalid/api/mobile/admin/publications?kind=${kind}`, {method: 'POST',
      headers: {authorization: admin ? 'Bearer admin' : 'Bearer member'}, body: JSON.stringify({action: 'delete', id: page})})
  }
  assert.equal((await adminChange(adminRequest('pages', false))).status, 403)
  assert.equal((await adminChange(adminRequest('blogs', true))).status, 400)
  assert.equal((await adminChange(adminRequest('articles', true))).status, 200)
  assert.equal((await adminChange(adminRequest('pages', true))).status, 200)
  assert.deepEqual(removed, ['blogs', 'pages'])
})

test('page follows write only the signed member’s relation and return the actual count', async () => {
  let writes = 0
  Object.assign(globalThis, {pagesFixture: {enabled: true, client: {from(table: string) {
    if (table === 'pages') return {select() { return this }, eq() { return this },
      async maybeSingle() { return {data: {id: page, owner_id: other}} }}
    assert.equal(table, 'page_follows')
    return {select() { return this }, async eq() { return {count: 9} }, async upsert(values: object, options: object) {
      assert.deepEqual(values, {user_id: member, page_id: page})
      assert.deepEqual(options, {onConflict: 'user_id,page_id', ignoreDuplicates: true})
      writes++
      return {}
    }}
  }}}})
  const body = {id: page, action: 'follow', following: true, userId: other}
  assert.equal((await POST(request('', body, false))).status, 401)
  assert.deepEqual(await (await POST(request('', body))).json(), {following: true, follower_count: 9})
  assert.equal(writes, 1)
})

test('settings reject stale versions and scope all fields to the verified owner', async () => {
  const expected = {name: 'Old name', description: null, category: 'Team', sport: 'NBA', emoji: '⭐', avatar_url: null,
    banner_url: null, is_published: true}
  let attempted = 0
  Object.assign(globalThis, {pagesFixture: {enabled: true, client: {from(table: string) {
    assert.equal(table, 'pages')
    const filters: Record<string, unknown> = {}
    return {update() { return this }, eq(column: string, value: unknown) { filters[column] = value; return this },
      is(column: string, value: unknown) { filters[column] = value; return this }, select() { return this },
      async maybeSingle() {
        assert.deepEqual(filters, {id: page, owner_id: member, ...expected})
        attempted++
        return {data: null}
      }}
  }}}})
  const draft = {action: 'settings', id: page, name: 'New name', description: '', category: 'Team', sport: 'NBA', emoji: '⭐',
    avatar: '', banner: '', published: true}
  assert.equal((await POST(request('', draft))).status, 400)
  assert.equal((await POST(request('', {...draft, expected}))).status, 409)
  assert.equal(attempted, 1)
})
