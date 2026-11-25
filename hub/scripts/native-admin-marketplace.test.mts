import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { build } from 'esbuild'

const id = 'e850bb50-e681-4c15-953e-b6add3515ff4'
const updated = '2026-11-25T12:00:00Z'
const changes: unknown[] = []
const audits: unknown[] = []
const revalidations: string[] = []
const fixture = {
  admin: {
    from(table: string) {
      assert.equal(table, 'matrix_marketplace_listings')
      return this
    },
    select() { return this }, order() { return this }, limit() { return this }, or() { return this },
    eq(key: string, value: string) { changes.push([key, value]); return this },
    update(value: unknown) { changes.push(value); return this },
    async maybeSingle() { return { data: fixture.conflict ? null : { id, status: 'removed', updated_at: updated } } },
    then(resolve: (value: unknown) => void) { resolve({ data: [{ id }] }) },
  },
  audits, revalidations, conflict: false,
}
Object.assign(globalThis, { nativeAdminMarketplaceFixture: fixture })
const stubs: Record<string, string> = {
  'next/server': 'export const NextResponse = Response;',
  'next/cache': 'export const revalidatePath = path => globalThis.nativeAdminMarketplaceFixture.revalidations.push(path);',
  '@/lib/adminAudit': 'export const writeAdminAudit = async (_admin, input) => {globalThis.nativeAdminMarketplaceFixture.audits.push(input);};',
  '@/lib/blocks': 'export const isAccountId = id => /^[a-f0-9-]{36}$/.test(id);',
  '@/lib/supabase/adminDecisionActor': `export const adminDecisionActor = async req => req.headers.get('authorization') === 'Bearer admin'
    ? {admin: globalThis.nativeAdminMarketplaceFixture.admin, user: { id: 'admin' }}
    : {error: Response.json({}, {status: req.headers.has('authorization') ? 403 : 401})};`,
}
const bundle = await build({
  entryPoints: ['src/app/api/mobile/admin/marketplace/route.ts'], bundle: true, write: false, platform: 'node', format: 'cjs',
  plugins: [{ name: 'admin-marketplace-fixture', setup(plugin) {
    plugin.onResolve({ filter: /.*/ }, arg => Object.hasOwn(stubs, arg.path) ? { path: arg.path, namespace: 'fixture' } : undefined)
    plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, arg => ({ contents: stubs[arg.path] }))
  } }],
})
const module = { exports: {} as typeof import('../src/app/api/mobile/admin/marketplace/route') }
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports)
const path = 'https://fixture.invalid/api/mobile/admin/marketplace'
const patch = (body: unknown, token = 'admin') => module.exports.PATCH(new Request(path, {
  method: 'PATCH', body: JSON.stringify(body), headers: { authorization: `Bearer ${token}` },
}))
const removal = { id, expectedStatus: 'published', status: 'removed', expectedUpdatedAt: updated }

test('only admins can read or moderate marketplace publications', async () => {
  assert.equal((await module.exports.GET(new Request(path))).status, 401)
  assert.equal((await patch(removal, 'member')).status, 403)
  assert.equal((await patch({ ...removal, status: 'published' })).status, 400)
  assert.deepEqual(changes, [])
  const result = await module.exports.GET(new Request(`${path}?status=unlisted`, { headers: { authorization: 'Bearer admin' } }))
  assert.equal(result.headers.get('cache-control'), 'private, no-store')
  assert.deepEqual((await result.json()).listings, [{ id }])
  assert.deepEqual(changes.pop(), ['status', 'unlisted'])
})

test('moderation compares state and saved version, audits once, and refreshes the marketplace', async () => {
  fixture.conflict = true
  assert.equal((await patch(removal)).status, 409)
  assert.deepEqual(audits, [])
  assert.deepEqual(revalidations, [])
  fixture.conflict = false
  const result = await patch(removal)
  assert.equal(result.status, 200)
  assert.ok(changes.some(value => Array.isArray(value) && value[0] === 'updated_at' && value[1] === updated))
  assert.equal(audits.length, 1)
  assert.deepEqual(revalidations, ['/admin/marketplace', '/marketplace'])
})
