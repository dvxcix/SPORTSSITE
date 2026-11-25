import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { build } from 'esbuild'

const id = '11111111-1111-4111-8111-111111111111'
const signedUrl = 'https://primary.invalid/storage/v1/object/sign/contact-recap-exports/clip.mp4?token=fixture'
const job = { id, status: 'completed', format: 'mp4', storage_path: `${id}/clip.mp4`, filename: 'slipsurge-fixture.mp4',
  expires_at: new Date(Date.now() + 60_000).toISOString() }
const calls = { table: 0, signed: [] as Array<{ path: string; seconds: number; filename: string }> }
const admin = {
  from(table: string) {
    assert.equal(table, 'contact_recap_export_jobs')
    calls.table++
    return {
      select(columns: string) { if (!columns.includes('storage_path')) assert.ok(columns.includes('recap_date')); return this },
      order() { return this },
      async limit(limit: number) { assert.equal(limit, 30); return { data: [{ id, status: job.status }] } },
      eq(column: string, value: string) { assert.equal(column, 'id'); assert.equal(value, id); return this },
      async maybeSingle() { return { data: job } },
    }
  },
  storage: { from(bucket: string) {
    assert.equal(bucket, 'contact-recap-exports')
    return { async createSignedUrl(path: string, seconds: number, options: { download: string }) {
      calls.signed.push({ path, seconds, filename: options.download })
      return { data: { signedUrl } }
    } }
  } },
}
Object.assign(globalThis, { nativeContactRecapAdmin: admin })
const stubs: Record<string, string> = {
  'next/server': 'export const NextResponse = Response;',
  '@/lib/blocks': `export const isAccountId = value => value === '${id}';`,
  '@/lib/supabase/adminDecisionActor': `export const adminDecisionActor = async request => request.headers.get('authorization') === 'Bearer admin'
    ? { admin: globalThis.nativeContactRecapAdmin }
    : { error: Response.json({}, {status:403}) };`,
}
const bundle = await build({
  entryPoints: ['src/app/api/mobile/admin/contact-recap/route.ts'], bundle: true, write: false, platform: 'node', format: 'cjs',
  plugins: [{ name: 'native-contact-recap', setup(plugin) {
    plugin.onResolve({ filter: /.*/ }, args => Object.hasOwn(stubs, args.path) ? { path: args.path, namespace: 'fixture' } : undefined)
    plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: stubs[args.path] }))
  } }],
})
const module = { exports: {} as typeof import('../src/app/api/mobile/admin/contact-recap/route') }
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports)
const get = (token?: string, exportId?: string) => module.exports.GET(new Request(
  `https://fixture.invalid/api/mobile/admin/contact-recap${exportId ? `?export=${exportId}` : ''}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  }))

test('recap queue verifies the account before reading private jobs', async () => {
  assert.equal((await get()).status, 401)
  assert.equal((await get('member', id)).status, 403)
  assert.equal(calls.table, 0)
  const response = await get('admin')
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
  const result = await response.json()
  assert.equal(typeof result.paused, 'boolean')
  assert.deepEqual(result.jobs, [{ id, status: 'completed' }])
  assert.deepEqual(calls.signed, [])
})

test('existing exports are private and their download token does not outlive the job', async () => {
  assert.equal((await get('admin', 'invalid')).status, 400)
  const response = await get('admin', id)
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
  assert.deepEqual(await response.json(), { downloadUrl: signedUrl, filename: job.filename })
  assert.equal(calls.signed.length, 1)
  assert.ok(calls.signed[0].seconds > 0 && calls.signed[0].seconds <= 60)
  job.status = 'running'
  assert.equal((await get('admin', id)).status, 409)
  job.status = 'completed'
  job.expires_at = new Date(Date.now() - 1_000).toISOString()
  assert.equal((await get('admin', id)).status, 409)
  assert.equal(calls.signed.length, 1)
})
