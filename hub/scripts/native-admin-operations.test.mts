import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { build } from 'esbuild'

const owner = '044cb383-5807-4e31-9167-8b0d7c44735c'
const group = '5ffb8269-6a5b-4762-bbfe-f76de342cf6c'
const source = await build({
  stdin: { contents: "export * from './src/app/api/mobile/admin/operations/route'", resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, platform: 'node', write: false, format: 'cjs', tsconfig: 'tsconfig.json', external: ['next/server'],
  plugins: [{ name: 'admin-operations-fixture', setup(plugin) {
    plugin.onResolve({filter: /^@\/lib\/(supabase\/adminDecisionActor|adminAudit)$/}, args => ({path: args.path, namespace: 'fixture'}))
    plugin.onLoad({filter: /.*/, namespace: 'fixture'}, args => ({contents: args.path.endsWith('adminAudit')
      ? 'export async function writeAdminAudit(_, payload) { globalThis.operationsFixture.log.push(payload.targetId) }'
      : `export async function adminDecisionActor(request) {
        if (request.headers.get('authorization') === 'Bearer admin') return globalThis.operationsFixture;
        return {error: Response.json({}, {status: 403})};
      }`, loader: 'js'}))
  } }],
})
const fixture = {exports: {} as typeof import('../src/app/api/mobile/admin/operations/route')}
new Function('require', 'exports', 'module', source.outputFiles[0].text)(createRequire(import.meta.url), fixture.exports, fixture)
const { GET, DELETE } = fixture.exports
const request = (query: string, method = 'GET', token = 'admin') => new Request(`https://fixture.invalid/api/mobile/admin/operations?${query}`, {
  method, headers: {authorization: `Bearer ${token}`},
})

test('admin audit records retain the existing action, request filter and read-only detail', async () => {
  let filter = ''
  Object.assign(globalThis, {operationsFixture: {admin: {from(table: string) {
    assert.equal(table, 'admin_audit_logs')
    return {select() { return this }, order() { return this }, eq(field: string, value: string) {
      assert.equal(field, 'action'); assert.equal(value, 'community.delete'); return this
    }, or(value: string) { filter = value; return this }, limit(amount: number) { assert.equal(amount, 250); return this },
    then(resolve: (value: object) => void) { resolve({data: [{id: 12, action: 'community.delete', details: {kind: 'fixture'}}]}) }}
  }}}})
  assert.equal((await GET(request('kind=audit', 'GET', 'member'))).status, 403)
  const response = await GET(request('kind=audit&action=community.delete&q=request'))
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.deepEqual(body.actions, ['community.delete'])
  assert.deepEqual(JSON.parse(body.events[0].details), {kind: 'fixture'})
  assert.match(filter, /request_id\.ilike\./)
})

test('notification search keeps the member’s RLS and checks actor and recipient together', async () => {
  let predicate = ''
  const lookup = {select() { return this }, or() { return this }, order() { return this }, async limit() { return {data: [{id: owner}]} }}
  const notifications = {select() { return this }, order() { return this }, limit() { return this },
    or(value: string) { predicate = value; return this }, then(resolve: (value: object) => void) { resolve({data: []}) }}
  Object.assign(globalThis, {operationsFixture: {supabase: {from(table: string) { return table === 'users' ? lookup : notifications }},
    admin: {from() { throw Error('Unexpected service-role notification read') }}}})
  const response = await GET(request('kind=notifications&q=member'))
  assert.equal(response.status, 200)
  assert.equal(predicate, `user_id.in.(${owner}),actor_id.in.(${owner})`)
  assert.equal((await GET(request('kind=notifications&from=2026-02-29'))).status, 400)
})

test('community deletion is exact, verified and audited', async () => {
  const log: string[] = []
  Object.assign(globalThis, {operationsFixture: {user: {id: owner}, log, admin: {from(table: string) {
    assert.equal(table, 'groups')
    return {delete() { return this }, eq(key: string, value: string) { assert.equal(key, 'id'); assert.equal(value, group); return this },
      select() { return this }, async maybeSingle() { return {data: {id: group}} }}
  }}}})
  assert.equal((await DELETE(request('kind=groups&id=' + group, 'DELETE', 'member'))).status, 403)
  assert.equal((await DELETE(request('kind=groups&id=no', 'DELETE'))).status, 400)
  assert.deepEqual(await (await DELETE(request('kind=groups&id=' + group, 'DELETE'))).json(), {id: group})
  assert.deepEqual(log, [group])
})
