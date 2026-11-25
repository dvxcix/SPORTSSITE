import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { build } from 'esbuild'

const require = createRequire(import.meta.url)
const accountID = '6efe901c-c709-4cb0-9a58-2a0eac6dcff2'
const activeID = 'f4afc3ce-a64a-4db1-9188-8da98026a0c5'
const otherID = '5ffb8269-6a5b-4762-bbfe-f76de342cf6c'
const stubs: Record<string, string> = {
  '@/lib/supabase/nativeAccount': `export async function requireNativeAccount(request) {
    return request.headers.get('authorization') === 'Bearer current'
      ? { userId: '${accountID}', supabase: globalThis.announcementFixture.member }
      : { error: Response.json({}, { status: 401 }) }
  }`,
  '@/lib/nativeSocial': 'export const nativeAnonymousClient = () => globalThis.announcementFixture.anon',
  '@/lib/supabase/adminDecisionActor': `export async function adminDecisionActor(request) {
    return request.headers.get('authorization') === 'Bearer admin'
      ? { user: { id: '${accountID}' }, admin: globalThis.announcementFixture.admin }
      : { error: Response.json({}, { status: 403 }) }
  }`,
  '@/lib/blocks': 'export const isAccountId = value => typeof value === "string" && /^[0-9a-f-]{36}$/.test(value)',
}
const bundle = await build({
  stdin: { contents: "export { GET, POST } from './src/app/api/mobile/announcements/route'; export { PATCH } from './src/app/api/mobile/admin/announcements/route';",
    resolveDir: process.cwd(), loader: 'ts' }, platform: 'node', format: 'cjs', bundle: true, write: false,
  tsconfig: 'tsconfig.json', external: ['next/server'],
  plugins: [{name: 'announcements-fixture', setup(plugin) {
    plugin.onResolve({filter: /.*/}, args => args.path in stubs ? {path: args.path, namespace: 'fixture'} : undefined)
    plugin.onLoad({filter: /.*/, namespace: 'fixture'}, args => ({contents: stubs[args.path], loader: 'js'}))
  }}],
})
const fixture = { exports: {} as typeof import('../src/app/api/mobile/announcements/route') &
  Pick<typeof import('../src/app/api/mobile/admin/announcements/route'), 'PATCH'> }
new Function('require', 'exports', 'module', bundle.outputFiles[0].text)(require, fixture.exports, fixture)
const { GET, POST, PATCH } = fixture.exports
const host = 'https://slipsurge.invalid'
const publicPath = '/api/mobile/announcements'
const adminPath = '/api/mobile/admin/announcements'
const ver = '2026-11-25T06:00:00+00:00'
const request = (path: string, authorization?: string, method = 'GET', body?: unknown) =>
  new Request(host + path, { method, headers: authorization ? {authorization} : {}, body: body === undefined ? undefined : JSON.stringify(body) })

test('guest sees only the active banner and a member does not get dismissed or inaccessible releases', async () => {
  const banner = {message: 'Announcement', is_active: true}
  const published = [{id: activeID}, {id: otherID}]
  const fixture = {
    anon: { from(table: string) {
      assert.equal(table, 'site_banner')
      return {select() { return this }, eq(field: string, value: unknown) {
        if (field === 'is_active') assert.equal(value, true)
        return this
      }, async maybeSingle() { return {data: banner} }}
    }},
    member: { from(table: string) {
      if (table === 'changelog_entries') {
        return {select() { return this }, eq(field: string, value: boolean) {
          assert.equal(field, 'is_active')
          assert.equal(value, true)
          return this
        }, order() { return this }, then(resolve: (value: unknown) => unknown) { return resolve({data: published}) }}
      }
      assert.equal(table, 'changelog_dismissals')
      return {select() { return this }, async eq(field: string, value: string) {
        assert.equal(field, 'user_id')
        assert.equal(value, accountID)
        return {data: [{entry_id: activeID}]}
      }}
    }},
  }
  Object.assign(globalThis, {announcementFixture: fixture})
  assert.equal((await GET(request(publicPath, 'Bearer stale'))).status, 401)
  const guest = await GET(request(publicPath))
  assert.equal(guest.headers.get('cache-control'), 'private, no-store')
  assert.deepEqual(await guest.json(), {banner, entries: []})
  const member = await GET(request(publicPath, 'Bearer current'))
  assert.deepEqual(await member.json(), {banner, entries: [published[1]]})
})

test('dismissal uses the signed account, checks the real active release and permits harmless retries', async () => {
  let supported = false
  const changed: unknown[] = []
  Object.assign(globalThis, {announcementFixture: {member: {from(table: string) {
    if (table === 'changelog_entries') {
      return {select() { return this }, eq() { return this }, async maybeSingle() { return {data: supported ? {id: activeID} : null} }}
    }
    assert.equal(table, 'changelog_dismissals')
    return {async upsert(values: unknown, options: {ignoreDuplicates: boolean}) {
      assert.equal(options.ignoreDuplicates, true)
      changed.push(values)
      return {error: null}
    }}
  }}}})
  const body = {entryId: activeID, userId: otherID}
  assert.equal((await POST(request(publicPath, undefined, 'POST', body))).status, 401)
  assert.equal((await POST(request(publicPath, 'Bearer current', 'POST', body))).status, 404)
  supported = true
  assert.equal((await POST(request(publicPath, 'Bearer current', 'POST', body))).status, 200)
  assert.equal((await POST(request(publicPath, 'Bearer current', 'POST', body))).status, 200)
  assert.deepEqual(changed, Array(2).fill({entry_id: activeID, user_id: accountID}))
})

test('announcement writes require an admin and protect against stale configuration or unsafe links', async () => {
  let operations = 0
  Object.assign(globalThis, {announcementFixture: {admin: {from(table: string) {
    assert.equal(table, 'site_banner')
    let fresh = false
    return {
      update() { operations++; return this },
      eq(field: string, value: unknown) { if (field === 'updated_at') fresh = value === ver; return this },
      select() { return this },
      async maybeSingle() { return {data: fresh ? {message: 'Fixture'} : null} },
    }
  }}}})
  const payload = {kind: 'banner', message: 'Fixture', background: '#000000', foreground: '#ffffff', active: false, dismissible: true, linkUrl: '/pricing', linkLabel: 'Plans', expectedUpdatedAt: ver}
  assert.equal((await PATCH(request(adminPath, 'Bearer current', 'PATCH', payload))).status, 403)
  assert.equal((await PATCH(request(adminPath, 'Bearer admin', 'PATCH', {...payload, linkUrl: 'javascript:alert(1)'}))).status, 400)
  assert.equal(operations, 0)
  assert.equal((await PATCH(request(adminPath, 'Bearer admin', 'PATCH', {...payload, expectedUpdatedAt: '2026-11-24T06:00:00Z'}))).status, 409)
  assert.equal((await PATCH(request(adminPath, 'Bearer admin', 'PATCH', payload))).status, 200)
})
