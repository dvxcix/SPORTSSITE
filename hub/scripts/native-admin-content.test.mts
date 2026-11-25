import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { build } from 'esbuild'

const id = '5ffb8269-6a5b-4762-bbfe-f76de342cf6c'
const author = '044cb383-5807-4e31-9167-8b0d7c44735c'
const source = await build({
  stdin: { contents: "export * from './src/app/api/mobile/admin/content/route'", resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, platform: 'node', write: false, format: 'cjs', tsconfig: 'tsconfig.json', external: ['next/server'],
  plugins: [{ name: 'content-fixture', setup(plugin) {
    plugin.onResolve({filter: /^@\/lib\/adminAudit$/}, args => ({path: args.path, namespace: 'audit-fixture'}))
    plugin.onLoad({filter: /.*/, namespace: 'audit-fixture'}, () => ({contents: 'export async function writeAdminAudit() {}', loader: 'js'}))
    plugin.onResolve({filter: /^@\/lib\/supabase\/adminDecisionActor$/}, args => ({path: args.path, namespace: 'fixture'}))
    plugin.onLoad({filter: /.*/, namespace: 'fixture'}, () => ({contents: `export async function adminDecisionActor(request) {
      if (request.headers.get('authorization') !== 'Bearer admin') return {error: Response.json({}, {status: 403})};
      return globalThis.moderatorFixture;
    }`, loader: 'js'}))
  } }],
})
const fixture = {exports: {} as typeof import('../src/app/api/mobile/admin/content/route')}
new Function('require', 'exports', 'module', source.outputFiles[0].text)(createRequire(import.meta.url), fixture.exports, fixture)
const { GET, DELETE } = fixture.exports
const request = (query = '', method = 'GET', auth = 'admin') => new Request(`https://fixture.invalid/api/mobile/admin/content?${query}`, {
  method, headers: {authorization: `Bearer ${auth}`},
})

test('admin post filters use the request-scoped client, exact authors and UTC date bounds', async () => {
  const calls: unknown[][] = []
  const query = {
    select() { return this }, or(value: string) { calls.push(['or', value]); return this },
    order(...values: unknown[]) { calls.push(['order', ...values]); return this }, limit(value: number) { return Object.assign(this, {limitSize: value}) },
    gte(...values: unknown[]) { calls.push(['gte', ...values]); return this }, lt(...values: unknown[]) { calls.push(['lt', ...values]); return this },
    eq(...values: unknown[]) { calls.push(['eq', ...values]); return this },
    then(resolve: (value: object) => void) { resolve({data: [{id}]}) },
  }
  const userLookup = {select() { return this }, or(value: string) { assert.match(value, /username\.ilike\./); return this }, order() { return this },
    async limit() { return {data: [{id: author}]} }}
  Object.assign(globalThis, {moderatorFixture: {supabase: {from(table: string) {
    return table === 'users' ? userLookup : query
  }}, admin: {from() { throw Error('A service-role read would bypass website content visibility') }}}})
  const filtered = await GET(request('kind=posts&q=team&type=poll&from=2026-11-01&to=2026-11-25&sort=most_commented'))
  assert.equal(filtered.status, 200)
  assert.deepEqual(await filtered.json(), {posts: [{id}]})
  assert.ok(calls.some(([name, value]) => name === 'or' && String(value).includes(author)))
  assert.ok(calls.some(([name, value]) => name === 'order' && value === 'comment_count'))
  assert.ok(calls.some(([name, _, value]) => name === 'gte' && value === '2026-11-01T00:00:00.000Z'))
  assert.ok(calls.some(([name, _, value]) => name === 'lt' && value === '2026-11-26T00:00:00.000Z'))
  assert.equal((await GET(request('kind=posts&from=2026-02-29'))).status, 400)
  assert.equal((await GET(request('kind=posts&sort=constructor'))).status, 400)
  assert.equal((await GET(request('kind=posts', 'GET', 'member'))).status, 403)
})

test('native admin content deletion requires confirmed visibility of the exact row', async () => {
  let visible = false
  let deleted = 0
  Object.assign(globalThis, {moderatorFixture: {
    user: {id: author},
    supabase: {from(table: string) {
      assert.equal(table, 'stories')
      return {select() { return this }, eq(key: string, value: string) { assert.equal(key, 'id'); assert.equal(value, id); return this },
        async maybeSingle() { return {data: visible ? {id} : null} }}
    }},
    admin: {from(table: string) {
      assert.equal(table, 'stories')
      return {delete() { return this }, eq(key: string, value: string) { assert.equal(key, 'id'); assert.equal(value, id); return this },
        select() { return this }, async maybeSingle() { deleted++; return {data: {id}} }}
    }},
  }})
  assert.equal((await DELETE(request('kind=stories&id=' + id, 'DELETE', 'member'))).status, 403)
  assert.equal((await DELETE(request('kind=stories&id=' + id, 'DELETE'))).status, 404)
  assert.equal(deleted, 0)
  visible = true
  assert.deepEqual(await (await DELETE(request('kind=stories&id=' + id, 'DELETE'))).json(), {id})
  assert.equal(deleted, 1)
})
